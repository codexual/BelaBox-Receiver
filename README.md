# 🛰️ BelaBox Receiver (Updated Docker Image)

This project is a **cleaned-up, modernized, and simplified fork** of [rmoriz/bbox-receiver](https://github.com/rmoriz/bbox-receiver), which itself was a Dockerized version of the now **outdated** [sherazarde/belabox-receiver](https://hub.docker.com/r/sherazarde/belabox-receiver).

> **Note**: This is **not** an official Belabox project. Please do not contact `rationalirl` for support.

---

## ✅ What’s Updated?

- Rebuilt Dockerfile with updated package dependencies.
- Removed deprecated or unnecessary tools.
- Simplified run scripts for **Windows (`.bat`) and Linux (`.sh`)**.
- Supports persistent Docker image reuse (doesn't rebuild unless required).

---

## 🛠️ How to Use

### 🔧 Setup

1. Clone this repository.
2. Run the appropriate script for your system:

#### 🐧 Linux / WSL
```bash
./run.sh
```

#### 🪟 Windows
For Command Prompt:
```cmd
run.bat
```

These scripts will:
- Build the Docker image (if not already built).
- Run the container with the correct ports exposed:
  - **UDP 5000** — Ingest
  - **TCP 8181** — SLS Stats
  - **UDP 8282** — Playback

---

## 📡 How to Connect

### SLS Stats Page
Open in your browser:
```
http://localhost:8181/stats
```

### BelaBox App
- **Host**: Your local IP or public IP
- **Port**: `5000`
- **Stream ID**: `live/stream/belabox`

### OBS Media Source
```
srt://<your-ip>:8282/?streamid=play/stream/belabox
```

---

## 🌐 Network Access & Remote Streaming

### Port Forwarding

To use BelaBox Receiver from outside your home network (for example, for remote streaming), you must **port forward** the required ports on your router:

- **UDP 5000** — Ingest
- **TCP 8181** — SLS Stats
- **UDP 8282** — Playback

**Port forwarding** lets traffic from the internet reach your BelaBox Receiver. You need to log into your router and add port forwarding rules pointing to the device running your receiver.

- [Step-by-step port forwarding tutorial (wikiHow)](https://www.wikihow.com/Set-Up-Port-Forwarding-on-a-Router)
- [Another guide (No-IP Support)](https://www.noip.com/support/knowledgebase/general-port-forwarding-guide)

If you’re new to port forwarding, these guides cover the basics for most router brands.

---

### Dynamic DNS and no-ip.com

If you have a **dynamic IP address** (most home internet connections), your public IP can change. This makes remote access tricky, since your address might not stay the same.

**no-ip.com** offers a free Dynamic DNS (DDNS) service:
- It gives you a persistent hostname (like `mycamera.no-ip.org`) that always points to your current IP—even if it changes.
- This makes connecting to your BelaBox Receiver reliable from anywhere.

**Benefits of no-ip.com:**
- Always know your device’s internet address, even when your ISP changes it.
- Simple setup, free for basic usage.
- Works great for home servers, cameras, and streaming devices.

**Get started with no-ip.com:**
- [Official No-IP Dynamic DNS Getting Started Guide](https://www.noip.com/support/knowledgebase/free-dynamic-dns-getting-started-guide-ip-version)
- [Beginner video tutorial (YouTube)](https://www.youtube.com/watch?v=qBXC7qe-dUk)
- [Guide: Dynamic DNS for your home network](https://homenetworkgeek.com/dynamic-dns/)

---

**Tip:**  
After setting up port forwarding and Dynamic DNS, you can access your BelaBox Receiver from anywhere using your no-ip address and the forwarded ports.

---

## 📁 Files Included

- `Dockerfile` — Cleaned and rebuilt
- `run.sh` — For Linux
- `run.bat` — For Windows CMD

---

## 🚨 NOALBS Integration Highlights

This project leverages [NOALBS (Nginx-OBS Automatic Low Bitrate Switching)](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching) to improve stream reliability and monitoring:

- **Automatic Low Bitrate Switching:**  
  Detects unstable RTMP ingest streams and automatically switches to a backup or lower bitrate stream, reducing interruptions for viewers.
- **OBS & Nginx-RTMP Compatible:**  
  Seamlessly works with popular streaming setups using OBS Studio and Nginx RTMP servers.
- **Flexible Notification System:**  
  Supports alerts via Discord, Telegram, webhooks, and more for real-time stream status updates.
- **Stream Health Monitoring:**  
  Continuously checks the status of all incoming streams and can restart or re-route as needed based on configurable thresholds.
- **Easy Integration:**  
  Docker-ready and scriptable, fitting right into automated or containerized workflows like this project.
- **Community Driven:**  
  Actively maintained, open-source, and widely adopted in the streaming community.

For more details, visit the [NOALBS GitHub repository](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching).

---

## ⚙️ Configuration & NOALBS Reference

The `config.json` file is central to customizing how this project (and NOALBS) operates. Key features like automatic bitrate switching, stream status triggers, notification settings, OBS connection, and Twitch chat integration are all controlled here.

### NOALBS-Related Sections

- **switcher**:  
  Controls NOALBS automatic bitrate switching and stream monitoring behavior.  
  - `bitrateSwitcherEnabled`, `retryAttempts`, and `triggers` (low/RTT/offline) determine when and how failover happens.
  - `switchingScenes` lets you set OBS scenes for normal, low bitrate, or offline states.
  - `streamServers` configures monitored ingest servers (e.g., SRT or RTMP endpoints).

- **software**:  
  OBS connection details for remote control (scene switching, etc.).

- **chat**:  
  Twitch bot and command options, including admin/mod lists and custom commands.

- **optionalOptions**/**optionalScenes**:  
  Extra behaviors—transcoding checks, additional scenes, and more.

### Editing Tips

- See inline comments in the provided `config.json` for description of each field.
- For advanced options, troubleshooting, or to understand all possible configuration settings, refer to the official [NOALBS documentation](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching#configuration).

### Example

To change the RTT trigger for low bitrate detection, edit:
```json
"triggers": {
  "low": 50,
  "rtt": 2500,
  "offline": 350,
  "rttOffline": null
}
```
Set `"rtt"` to your preferred maximum round-trip time in milliseconds.

### Secure Your .env

Your `.env` file contains sensitive information (Twitch bot username and OAuth token).  
**Never share this file publicly.**  
Update these values with your own Twitch credentials before running the project.

---

## 🧠 Credits

- [rmoriz/bbox-receiver](https://github.com/rmoriz/bbox-receiver) — Original Docker wrapper
- [sherazarde/belabox-receiver](https://hub.docker.com/r/sherazarde/belabox-receiver) — Original image
- [NOALBS/nginx-obs-automatic-low-bitrate-switching](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching) — Stream monitoring, low bitrate switching, and failover system
- **Community-updated and maintained by Codexual**

---
