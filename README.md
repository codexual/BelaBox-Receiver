# 🛰️ BelaBox Receiver (Updated Docker Image)

This project is a **cleaned-up, modernized, and simplified fork** of [rmoriz/bbox-receiver](https://github.com/rmoriz/bbox-receiver), which itself was a Dockerized version of the now **outdated** [sherazarde/belabox-receiver](https://hub.docker.com/r/sherazarde/belabox-receiver).

> **Note**: This is **not** an official Belabox project. Please do not contact `rationalirl` for support.

---

## ✅ What’s Updated?

- Rebuilt Dockerfile with updated package dependencies.
- Removed deprecated or unnecessary tools.
- Simplified run scripts for **Windows (`.bat`, `.ps1`) and Linux (`.sh`)**.
- Supports persistent Docker image reuse (doesn't rebuild unless required).
- No longer requires `config.json`.

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

For PowerShell:
```powershell
.\run.ps1
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

## 📁 Files Included

- `Dockerfile` — Cleaned and rebuilt
- `run.sh` — For Linux
- `run.bat` — For Windows CMD
- `run.ps1` — For Windows PowerShell

---

## 🧠 Credits

- [rmoriz/bbox-receiver](https://github.com/rmoriz/bbox-receiver) — Original Docker wrapper
- [sherazarde/belabox-receiver](https://hub.docker.com/r/sherazarde/belabox-receiver) — Original image
- **Community-updated and maintained by [You]**

---
