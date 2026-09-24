# AudioX

**AudioX** is a modern, high-performance YouTube audio downloader and offline listening web application built with Next.js and React.

---

## Architecture Overview

AudioX combines lightweight edge/serverless metadata extraction with dedicated media processing:

```
User Browser
    │
    ▼
Next.js Frontend (Vercel)
    │
    ├── Native Metadata Analysis (/api/analyze)
    │   └── oEmbed + Lightweight Watch Page Parser (0s delay, pure TypeScript)
    │
    ├── Sequential Queue & Download State
    │   └── Bounded FIFO queue orchestration with real-time stage tracking
    │
    ├── Browser Offline Storage
    │   └── IndexedDB v2 (audio_blobs store for full offline playback)
    │
    └── Media Worker Client (/api/jobs, /api/download)
            │ (Server-to-Server authenticated HTTP)
            ▼
    Media Processing Worker
            │
            ├── yt-dlp (Native Python library audio stream extraction)
            ├── FFmpeg / ffprobe (libmp3lame MP3 transcoding & native M4A optimization)
            └── Automated temporary file lifecycle & cleanup
```

---

## Features

- **Blazing-Fast Analysis**: Instant YouTube video & playlist metadata extraction without invoking heavy binaries on page load.
- **Audio Formats & Qualities**: MP3 (`128k`, `192k`, `256k`, `320k`) and native M4A (direct AAC stream copy without re-encoding).
- **Sequential Queue**: Strictly sequential single-concurrency queue to prevent CPU saturation and bandwidth throttling.
- **Offline Audio Player**: Built-in audio player powered by browser IndexedDB storage for offline listening anywhere.
- **Vercel Production Ready**: Zero external server lock-in; deployable on Vercel with optional Vercel Blob persistent storage.
- **Strict SSRF & Security**: Fail-closed URL validation, constant-time token comparison, and path traversal protection.

---

## Deployment on Vercel

For complete step-by-step instructions on deploying AudioX to Vercel, consult:
👉 **[VERCEL_DEPLOYMENT.md](file:///G:/AntiGravity%20IDE/Main/AudioX/VERCEL_DEPLOYMENT.md)**

---

## Local Development Workflow

### 1. Start the Media Worker

In a terminal window:

```bash
cd worker
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

### 2. Start Next.js Frontend

In another terminal window:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Testing

Run frontend test suite:

```bash
npm run test
```

Run Python worker test suite:

```bash
python -m unittest worker/test_worker_security.py
```
