#!/usr/bin/env node
// obs-autofix: restarts this receiver's OBS media source every time its BelaBox
// (re)connects, the same thing NOALBS !fix does. OBS often joins a stream
// mid-reconnect and ends up with broken/static audio until the source restarts.
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
//   CHAT_FIX_ALL     "true" to make chat !fix restart every receiver's source.
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

// Restart media sources. allReceivers=false: only this receiver's source(s).
async function restartSources(allReceivers, why) {
  const restarted = await obsSession(async (request) => {
    const { inputs } = await request('GetInputList');
    const done = [];
    for (const input of inputs) {
      if (!MEDIA_KINDS.includes(input.inputKind)) continue;
      const name = input.inputName;
      if (!allReceivers && sourceNames.length && !sourceNames.includes(name)) continue;

      const { inputSettings } = await request('GetInputSettings', { inputName: name });
      const urls = sourceUrls(input.inputKind, inputSettings);
      if (!urls.some(isNetworkUrl)) continue;
      if (!allReceivers && !sourceNames.length && !urls.some((u) => urlPort(u) === srtPort)) continue;

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
  else if (allReceivers) log(`${why}: no SRT/RTMP media sources found in OBS`);
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

let lastUptime = new Map(); // publisher -> uptime
let fixTimer = null;

function scheduleFix(publisher) {
  // Debounce: a flapping connection only gets one restart, once it settles.
  clearTimeout(fixTimer);
  fixTimer = setTimeout(() => {
    restartSources(false, `${publisher} reconnected`).catch((e) => log(`OBS restart failed: ${e.message}`));
  }, delayMs);
}

async function poll() {
  const stats = await getStats();
  if (stats) {
    const now = new Map();
    for (const [publisher, s] of Object.entries(stats.publishers || {})) {
      const uptime = Number(s && s.uptime) || 0;
      now.set(publisher, uptime);
      const before = lastUptime.get(publisher);
      if (before === undefined || uptime < before) {
        log(`publisher ${publisher} connected`);
        scheduleFix(publisher);
      }
    }
    lastUptime = now;
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
      (sourceNames.length ? `sources: ${sourceNames.join(', ')}` : `sources on SRT port ${srtPort}`));
  poll();
  if (String(process.env.CHAT_FIX_ALL).toLowerCase() === 'true') startChat();
}
