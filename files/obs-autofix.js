#!/usr/bin/env node
// obs-autofix: restarts this receiver's OBS media source, the same thing NOALBS
// !fix does, whenever OBS is likely to end up with broken/static audio:
//   - every time the BelaBox (re)connects (OBS often joins mid-stream), and
//   - after a burst of dropped packets (lost data can desync OBS's audio).
//
// On the main receiver it also listens to Twitch chat, so !fix / !f restarts
// the media sources of ALL receivers, in every OBS scene.
//
// Settings come from /app/config.json (software.* for OBS, chat.* for Twitch).
// Environment:
//   OBS_SRT_PORT     host SRT port of this receiver (8282, 8283, ...). Sources
//                    whose srt:// URL uses this port are restarted.
//   OBS_SOURCES      optional comma-separated OBS source names to restart
//                    instead of matching by port.
//   AUTOFIX_DELAY    seconds to wait after a reconnect before restarting (5).
//   AUTOFIX_DROPS    dropped packets within AUTOFIX_DROP_WINDOW that count as
//                    a burst and trigger a restart (20). 0 turns this off.
//   AUTOFIX_DROP_WINDOW    seconds (10).
//   AUTOFIX_DROP_COOLDOWN  minimum seconds between burst restarts (180).
//   CHAT_FIX_ALL     "true" to make chat !fix restart every receiver's source.
//   FIX_ALL_PORTS    SRT ports chat !fix treats as receivers (8282,8283,8284).
//   FIX_ALL_SOURCES  extra OBS source names chat !fix also restarts.
//   OBS_HOST, OBS_PORT, OBS_PASSWORD  override config.json.

const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const WebSocket = require('ws');

const CONFIG_PATH = process.env.NOALBS_CONFIG || '/app/config.json';
const STATS_URL = 'http://127.0.0.1:8181/stats';
const POLL_MS = 1000;

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const software = config.software || {};
const obs = {
  host: process.env.OBS_HOST || software.host || '127.0.0.1',
  port: Number(process.env.OBS_PORT || software.port || 4455),
  password: process.env.OBS_PASSWORD ?? software.password ?? '',
};
const srtPort = String(process.env.OBS_SRT_PORT || '8282');
const sourceNames = (process.env.OBS_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean);
const delayMs = Number(process.env.AUTOFIX_DELAY || 5) * 1000;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const allPorts = list(process.env.FIX_ALL_PORTS || '8282,8283,8284');
const allSourceNames = list(process.env.FIX_ALL_SOURCES);
const dropThreshold = Number(process.env.AUTOFIX_DROPS ?? 20);
const dropWindowMs = Number(process.env.AUTOFIX_DROP_WINDOW || 10) * 1000;
const dropCooldownMs = Number(process.env.AUTOFIX_DROP_COOLDOWN || 180) * 1000;

const log = (...args) => console.log(new Date().toISOString(), ...args);

// ---------------------------------------------------------------- OBS client

function obsSession(fn) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${obs.host}:${obs.port}`);
    const pending = new Map();
    let nextId = 0;
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('OBS timed out')); }, 15000);

    const request = (requestType, requestData = {}) => new Promise((res, rej) => {
      const requestId = String(++nextId);
      pending.set(requestId, { res, rej });
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });

    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw);
      if (msg.op === 0) { // Hello
        const d = { rpcVersion: 1, eventSubscriptions: 0 };
        const auth = msg.d.authentication;
        if (auth) {
          const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
          d.authentication = sha(sha(obs.password + auth.salt) + auth.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) { // Identified
        try { resolve(await fn(request)); } catch (e) { reject(e); }
        clearTimeout(timer);
        ws.close();
      } else if (msg.op === 7) { // RequestResponse
        const p = pending.get(msg.d.requestId);
        if (!p) return;
        pending.delete(msg.d.requestId);
        if (msg.d.requestStatus.result) p.res(msg.d.responseData || {});
        else p.rej(new Error(`${msg.d.requestType}: ${msg.d.requestStatus.comment || msg.d.requestStatus.code}`));
      }
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`OBS connection closed (${code}${reason.length ? ` ${reason}` : ''})`));
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

const MEDIA_KINDS = ['ffmpeg_source', 'vlc_source', 'irl_source', 'smooth_media_source'];

function sourceUrls(kind, settings) {
  if (kind === 'vlc_source') return (settings.playlist || []).map((p) => p.value || '');
  return [settings.input || settings.url || ''];
}

function urlPort(url) {
  const m = /^[a-z]+:\/\/(?:\[[^\]]*\]|[^/?:]*):(\d+)/i.exec(url);
  return m ? m[1] : null;
}

const isNetworkUrl = (url) => /^(srt|rtmp|udp|rist|rtsp):/i.test(url);

// Is this OBS source one we should restart?
//   allReceivers=false: only this receiver's source (OBS_SOURCES, else by port).
//   allReceivers=true:  every receiver's source (srt:// on FIX_ALL_PORTS, plus
//                       FIX_ALL_SOURCES). Other cams in OBS are left alone.
function isTarget(allReceivers, name, urls) {
  if (allReceivers) {
    if (allSourceNames.includes(name)) return true;
    return urls.some((u) => /^srt:/i.test(u) && allPorts.includes(urlPort(u)));
  }
  if (!urls.some(isNetworkUrl)) return false;
  if (sourceNames.length) return sourceNames.includes(name);
  return urls.some((u) => urlPort(u) === srtPort);
}

async function restartSources(allReceivers, why) {
  const restarted = await obsSession(async (request) => {
    const { inputs } = await request('GetInputList');
    const done = [];
    for (const input of inputs) {
      if (!MEDIA_KINDS.includes(input.inputKind)) continue;
      const name = input.inputName;
      if (!allReceivers && sourceNames.length && !sourceNames.includes(name)) continue;

      const { inputSettings } = await request('GetInputSettings', { inputName: name });
      if (!isTarget(allReceivers, name, sourceUrls(input.inputKind, inputSettings))) continue;

      // Same methods NOALBS !fix uses.
      if (input.inputKind === 'smooth_media_source') {
        await request('CallVendorRequest', {
          vendorName: 'obs-smooth-media', requestType: 'RestartSource', requestData: { sourceName: name },
        });
      } else if (input.inputKind === 'irl_source') {
        await request('TriggerMediaInputAction', { inputName: name, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
      } else {
        await request('SetInputSettings', { inputName: name, inputSettings: {}, overlay: true });
      }
      done.push(name);
    }
    return done;
  });

  if (restarted.length) log(`${why}: restarted OBS source(s): ${restarted.join(', ')}`);
  else if (allReceivers) log(`${why}: no OBS source uses SRT port ${allPorts.join('/')}`);
  else log(`${why}: no OBS media source uses port ${srtPort}. Set OBS_SOURCES to the source name.`);
}

// ------------------------------------------------- reconnect watcher (stats)

function getStats() {
  return new Promise((resolve) => {
    const req = http.get(STATS_URL, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

let last = new Map(); // publisher -> { uptime, drops }
let drops = [];       // [time, packets] dropped recently, all publishers
let fixTimer = null;
let burstSince = 0;   // when the pending burst restart was first scheduled
let lastBurstAt = 0;  // when the last burst restart was triggered

function scheduleFix(why, ms) {
  // Debounce: a flapping connection only gets one restart, once it settles.
  clearTimeout(fixTimer);
  fixTimer = setTimeout(() => {
    fixTimer = null;
    burstSince = 0;
    restartSources(false, why).catch((e) => log(`OBS restart failed: ${e.message}`));
  }, ms);
}

function checkDrops(publisher, newDrops) {
  const now = Date.now();
  if (newDrops > 0) drops.push([now, newDrops]);
  drops = drops.filter(([t]) => now - t <= dropWindowMs);
  if (dropThreshold <= 0 || newDrops <= 0) return;

  const total = drops.reduce((n, [, d]) => n + d, 0);
  if (burstSince) {
    // Burst restart already pending: wait until the drops stop (2s quiet),
    // but never longer than 10s after the burst started.
    if (now - burstSince < 10000) scheduleFix(`${publisher} drop burst`, 2000);
    return;
  }
  if (total < dropThreshold || fixTimer || now - lastBurstAt < dropCooldownMs) return;
  log(`${publisher}: ${total} packets dropped in ${dropWindowMs / 1000}s, restarting OBS source once it settles`);
  burstSince = lastBurstAt = now;
  scheduleFix(`${publisher} drop burst`, 2000);
}

async function poll() {
  const stats = await getStats();
  if (stats) {
    const now = new Map();
    for (const [publisher, s] of Object.entries(stats.publishers || {})) {
      // Without ?reset, SLS reports pktRcvDrop as a running total per connection.
      const cur = { uptime: Number(s && s.uptime) || 0, drops: Number(s && s.pktRcvDrop) || 0 };
      now.set(publisher, cur);
      const before = last.get(publisher);
      if (!before || cur.uptime < before.uptime || cur.drops < before.drops) {
        log(`publisher ${publisher} connected`);
        burstSince = 0;
        scheduleFix(`${publisher} reconnected`, delayMs);
      } else {
        checkDrops(publisher, cur.drops - before.drops);
      }
    }
    last = now;
  }
  setTimeout(poll, POLL_MS);
}

// -------------------------------------------- Twitch chat !fix (all receivers)

function startChat() {
  const chat = config.chat || {};
  if ((chat.platform || '').toLowerCase() !== 'twitch' || !chat.username) {
    log('chat: no Twitch channel in config.json, chat !fix for all receivers disabled');
    return;
  }
  const channel = chat.username.toLowerCase();
  const prefix = chat.prefix || '!';
  const fixCmd = (chat.commands && chat.commands.Fix) || {};
  const names = ['fix', ...(fixCmd.alias || [])].map((n) => n.toLowerCase());
  const permission = (fixCmd.permission || 'Mod').toLowerCase();
  const admins = (chat.admins || []).map((a) => a.toLowerCase());
  const userPerms = (fixCmd.userPermissions || []).map((a) => a.toLowerCase());
  let lastFix = 0;

  const allowed = (user, badges) => {
    if (user === channel || admins.includes(user) || userPerms.includes(user)) return true;
    if (permission === 'public') return true;
    if (permission === 'mod') return /(^|,)(moderator|broadcaster)\//.test(badges);
    if (permission === 'vip') return /(^|,)(moderator|broadcaster|vip)\//.test(badges);
    return false;
  };

  const connect = () => {
    const sock = net.connect(6667, 'irc.chat.twitch.tv');
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('connect', () => {
      // Anonymous read-only login. Nothing is ever sent to chat.
      sock.write(`CAP REQ :twitch.tv/tags\r\nNICK justinfan${Math.floor(Math.random() * 90000) + 10000}\r\nJOIN #${channel}\r\n`);
      log(`chat: watching #${channel} for ${names.map((n) => prefix + n).join(' / ')}`);
    });
    sock.on('data', (data) => {
      buf += data;
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('PING')) { sock.write(`PONG${line.slice(4)}\r\n`); continue; }
        const m = /^@(\S+) :(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(line);
        if (!m) continue;
        const [, tags, user, text] = m;
        if (!text.startsWith(prefix)) continue;
        const cmd = text.slice(prefix.length).split(/\s+/)[0].toLowerCase();
        if (!names.includes(cmd)) continue;
        const badges = (/(?:^|;)badges=([^;]*)/.exec(tags) || [])[1] || '';
        if (!allowed(user.toLowerCase(), badges)) continue;
        if (Date.now() - lastFix < 5000) continue;
        lastFix = Date.now();
        // NOALBS restarts the live scene's sources right away; this covers the rest.
        restartSources(true, `chat ${prefix}${cmd} by ${user}`).catch((e) => log(`OBS restart failed: ${e.message}`));
      }
    });
    sock.on('error', (e) => log(`chat: ${e.message}`));
    sock.on('close', () => { log('chat: disconnected, reconnecting in 10s'); setTimeout(connect, 10000); });
  };
  connect();
}

// ----------------------------------------------------------------------- main

if (process.argv.includes('--now')) {
  // Manual: docker exec belabox-receiver-2 obs-autofix --now   (add --all for every receiver)
  restartSources(process.argv.includes('--all'), 'manual')
    .then(() => process.exit(0))
    .catch((e) => { log(`OBS restart failed: ${e.message}`); process.exit(1); });
} else {
  log(`watching ${STATS_URL}; OBS ${obs.host}:${obs.port}; ` +
      (sourceNames.length ? `sources: ${sourceNames.join(', ')}` : `sources on SRT port ${srtPort}`) +
      (dropThreshold > 0 ? `; restart after ${dropThreshold}+ dropped packets in ${dropWindowMs / 1000}s` : ''));
  poll();
  if (String(process.env.CHAT_FIX_ALL).toLowerCase() === 'true') startChat();
}
