# AudioX

Lightweight, Public Audio Download & Offline Listening Tool.

AudioX is a fast, 100% public, mobile-friendly audio downloader. Its purpose is to allow users to process and download permitted YouTube audio (individual tracks and playlists) directly to individual MP3 and M4A files.

- **Zero Login & Zero Accounts**: Immediate access for all users.
- **Zero Server-Side Database / Analytics**: No Supabase, no tracking, no visitor IDs, no telemetry.
- **100% Local Browser History**: Download history is stored strictly in your browser (IndexedDB) for duplicate-download detection and file management.
- **Sequential FIFO Queue**: Concurrency = 1. Tracks process and download individually, one by one.
- **PWA Ready**: Installable on mobile and desktop with offline player support.

---

## Features

- **YouTube Single Video Audio Processing**: Fast native metadata extraction with MP3 and M4A conversion presets.
- **YouTube Playlist Detection & Sequential Processing**: Automatically analyzes full playlists, provides one-click batch queueing or individual track selection, and processes sequential downloads safely.
- **No ZIP Files Policy**: Every track remains an individual, cleanly-tagged audio file.
- **Offline PWA Experience**: Mobile-first responsive interface with offline player and custom download directory support.
- **Duplicate Download Detection**: Identifies previously downloaded tracks using browser-local IndexedDB history.

---

## Environment Variables

All environment variables are optional with built-in fallbacks. None are required.

| Variable | Description | Required | Scope |
|---|---|---|---|
| `TEMP_DIR` | Working directory for scratch audio files (defaults to OS temp) | Optional | Server only |
| `FILE_EXPIRY_MINUTES` | Retention time before temp file auto-cleanup (default: `30`) | Optional | Server only |
| `MAX_FILE_SIZE_MB` | Maximum local media upload file limit in MB (default: `500`) | Optional | Server only |

---

## Getting Started

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

AudioX will start at `http://localhost:3000`.
