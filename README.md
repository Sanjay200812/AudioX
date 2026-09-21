# AudioX

Lightweight, Public Audio Download & Offline Listening Tool running 100% on Vercel.

AudioX is a fast, 100% public, mobile-friendly audio downloader designed to run entirely within a single Vercel deployment:
1. **Next.js Frontend & Lightweight API**: Instant metadata analysis via native HTTP (oEmbed + Innertube HTML), browser-driven sequential queue orchestration, and offline PWA listening.
2. **Vercel Python Serverless Function (`api/media/process.py`)**: Runs directly on Vercel's Python runtime with `yt-dlp` to extract and stream native audio tracks on demand.

- **Zero External Servers**: No Railway, no Render, no VPS, no external Docker containers.
- **Zero Required Secrets or Databases**: Runs out-of-the-box with zero `.env` configuration.
- **Zero Login & Zero Accounts**: Immediate access for all users.
- **100% Local Browser History**: Download history is stored strictly in your browser (IndexedDB) for duplicate-download detection.
- **Sequential Client Queue**: Concurrency = 1. Tracks process and download individually, one by one.
- **Native Audio Streaming**: Downloads YouTube native M4A/AAC audio directly without transcoding delays or FFmpeg dependencies.
- **No ZIP Files Policy**: Every track remains an individual, cleanly-tagged audio file.
- **PWA Ready**: Installable on mobile and desktop with offline player support.

---

## Production Architecture

```
User Browser (AudioX Queue Orchestrator, Concurrency = 1)
    ↓
POST /api/media/process (Vercel Python Serverless Function with yt-dlp)
    ↓
Streams audio file directly back to browser
```

---

## Deploying to Vercel

1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. Import the repository in [Vercel](https://vercel.com).
3. Click **Deploy**.
   Vercel automatically detects Next.js and builds the Python Serverless Function (`api/media/process.py`) with dependencies from `requirements.txt`.
4. Zero environment variables are required!

---

## Local Development

```bash
# Install Node dependencies
npm install

# Run Next.js frontend
npm run dev
```

To run the media processing function locally:
```bash
python api/media/process.py
```
AudioX will start at `http://localhost:3000`.
