# AudioX

Lightweight, Public Audio Download & Offline Listening Tool running 100% on Vercel.

AudioX is a fast, 100% public, mobile-friendly audio downloader designed to run entirely within a single Vercel deployment:
1. **Next.js Frontend & Lightweight API**: Instant metadata analysis via native HTTP (oEmbed + Innertube HTML), browser-driven sequential queue orchestration, and offline PWA listening.
2. **Next.js Node.js Media Processing (`src/app/api/media/process/route.ts`)**: Bundles Linux-compatible static FFmpeg (`ffmpeg-static`) with `libmp3lame` for MP3 conversion and direct streaming for M4A.
3. **Vercel Python Serverless Function (`api/raw.py`)**: Runs directly on Vercel's Python runtime with `yt-dlp` to extract raw media streams on demand.

- **Zero External Servers**: No Railway, no Render, no VPS, no external Docker containers.
- **Zero Required Secrets or Databases**: Runs out-of-the-box with zero `.env` configuration.
- **Full MP3 & M4A Support**: Bundled static FFmpeg provides true `libmp3lame` MP3 conversion across standard (128k), high (192k), and best (320k) qualities, while direct M4A provides instant 0-transcode downloads.
- **Zero Login & Zero Accounts**: Immediate access for all users.
- **100% Local Browser History**: Download history is stored strictly in your browser (IndexedDB) for duplicate-download detection.
- **Sequential Client Queue**: Concurrency = 1. Tracks process and download individually, one by one.
- **No ZIP Files Policy**: Every track remains an individual, cleanly-tagged audio file.
- **PWA Ready**: Installable on mobile and desktop with offline player support.

---

## Production Architecture

```
User Browser (AudioX Queue Orchestrator, Concurrency = 1)
    ↓
POST /api/media/process (Next.js Node.js Serverless Function)
    ↓
    ├── If M4A (native): Streams directly with zero transcoding overhead
    └── If MP3: Converts using bundled ffmpeg-static (libmp3lame at 128k/192k/320k)
    ↓
Temporary files deleted immediately from /tmp
```

---

## Deploying to Vercel

1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. Import the repository in [Vercel](https://vercel.com).
3. Click **Deploy**.
   Vercel automatically detects Next.js, bundles `ffmpeg-static` via `outputFileTracingIncludes`, and builds the Python Serverless Function (`api/raw.py`) with dependencies from `requirements.txt`.
4. Zero environment variables are required!

*Note for Large Functions:* If your Vercel deployment requires large function support for the bundled FFmpeg binary, enable:
`VERCEL_SUPPORT_LARGE_FUNCTIONS=1` in your Vercel Project Environment Variables.

---

## Local Development

```bash
# Install Node dependencies
npm install

# Run Next.js frontend
npm run dev
```

To run the raw extractor locally:
```bash
python api/raw.py
```
AudioX will start at `http://localhost:3000`.
