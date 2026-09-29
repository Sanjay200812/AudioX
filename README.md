# AudioX

**AudioX** is a modern, high-performance YouTube audio downloader and offline listening web application built with Next.js, React, and native Vercel Serverless Python processing.

---

## Architecture Overview

AudioX runs **100% inside Vercel** with zero external server dependencies:

```
User Browser (PWA & Offline Playback via IndexedDB)
                     │
                     ▼
    ┌───────────────────────────────────┐
    │       Vercel (Production)         │
    │                                   │
    │  • Next.js App Router             │
    │  • Fast Metadata Analyzer         │
    │    (/api/analyze - pure TS)       │
    │  • Native Python Media Function   │
    │    (/api/process - Python 3.12)   │
    │    ├── yt-dlp                     │
    │    ├── Bundled static FFmpeg      │
    │    └── Chunked response streaming │
    └───────────────────────────────────┘
```

---

## Features

- **100% Vercel-Native**: Completely self-contained within a single Vercel deployment. No Railway, no external worker, no Supabase.
- **Default MP3 Format**: Converts YouTube tracks to MP3 (`128k`, `192k`, `256k`, `320k`) or native M4A (direct AAC stream copy).
- **Sequential Client Queue**: Strictly single-concurrency (`concurrency = 1`) browser queue orchestrating per-track processing and downloads.
- **Chunked Streamed Responses**: Large audio responses stream directly from the Python serverless function to the browser without exceeding function payload memory limits.
- **Offline Audio Player**: Built-in audio player powered by browser IndexedDB storage for true offline listening.
- **Strict Security**: SSRF protection, fail-closed URL validation, and automatic cleanup of temporary files in `/tmp`.

---

## Deployment on Vercel

For complete step-by-step instructions on deploying AudioX to Vercel, consult:
👉 **[VERCEL_DEPLOYMENT.md](file:///G:/AntiGravity%20IDE/Main/AudioX/VERCEL_DEPLOYMENT.md)**

---

## Local Development Workflow

Run the application:

```bash
npm run dev
```

This single command launches both the Next.js dev server and the local Python media processing function.
Open `http://localhost:3000` in your browser.

---

## Testing

Run the test suite:

```bash
npm test
```
