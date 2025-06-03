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

Clone this repo and run the appropriate script for your system:

#### 🐧 Linux / WSL
```bash
./run.sh

🪟 Windows
run.bat — for cmd

run.ps1 — for PowerShell

These will:

Build the Docker image (if not already built)

Run the container with the correct ports:

UDP 5000 for ingest

TCP 8181 for SLS stats

UDP 8282 for playback
