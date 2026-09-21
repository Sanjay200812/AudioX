# AudioX

Lightweight, Public Audio Download & Offline Listening Tool with Decoupled Media Worker.

AudioX is a fast, 100% public, mobile-friendly audio downloader. Its architecture is split into:
1. **Lightweight Next.js Frontend & API (Vercel)**: Fast URL validation, instant metadata analysis via native HTTP, queue management, PWA, and secure worker proxy. No Python, no yt-dlp, and no FFmpeg child processes run on Vercel.
2. **Dedicated Media Processing Worker (Docker on Railway / VPS)**: Isolated container running Python 3, yt-dlp, and FFmpeg with an in-memory sequential FIFO queue (concurrency = 1).

- **Zero Login & Zero Accounts**: Immediate access for all users.
- **Zero Server-Side Database / Analytics**: No Supabase, no Postgres, no Redis, no visitor IDs, no telemetry.
- **100% Local Browser History**: Download history is stored strictly in your browser (IndexedDB) for duplicate-download detection.
- **Sequential FIFO Queue**: Concurrency = 1. Tracks process and download individually, one by one.
- **No ZIP Files Policy**: Every track remains an individual, cleanly-tagged audio file.
- **PWA Ready**: Installable on mobile and desktop with offline player support.

---

## Production Architecture

```
User Browser
    ↓
AudioX Frontend (Next.js on Vercel)
    ↓ (Secure Server-to-Server with Bearer Token)
AudioX Worker (Docker container with Python 3 + yt-dlp + FFmpeg on Railway)
```

---

## Deploying the Media Worker (Railway)

1. **Push Repo to GitHub**:
   Push your changes to your GitHub repository.

2. **Create Railway Project**:
   - Go to [railway.app](https://railway.app) and create a new project.
   - Choose **Deploy from GitHub repo** and select your `AudioX` repository.

3. **Configure Worker Service in Railway**:
   - Set **Root Directory** to `/worker` (or specify `worker/Dockerfile`).
   - Railway will build and run the Dockerfile directly.
   - Verification during build ensures `python3`, `yt-dlp`, and `ffmpeg` are installed.

4. **Add Environment Variables in Railway**:
   Add the following variable in your Railway service settings:
   - `WORKER_SECRET` = `<generate-a-strong-random-secret>`
   - `PORT` = `8000` (FastAPI listens on `PORT` or 8000 by default)

5. **Generate Public HTTPS Domain in Railway**:
   - In your Railway service settings under **Networking**, click **Generate Domain** (e.g., `https://audiox-worker-production.up.railway.app`).

6. **Set Environment Variables on Vercel**:
   In your Vercel Project Settings → Environment Variables, add:
   - `AUDIOX_WORKER_URL` = `https://audiox-worker-production.up.railway.app`
   - `AUDIOX_WORKER_SECRET` = `<the-same-secret-set-in-railway>`

7. **Redeploy Vercel**:
   Trigger a new deployment on Vercel. AudioX will automatically route all media processing jobs securely to the worker!

---

## Environment Variables Reference

| Variable | Description | Required | Scope |
|---|---|---|---|
| `AUDIOX_WORKER_URL` | Public HTTPS URL of the deployed Railway worker | Required for production audio extraction | Server only (Vercel) |
| `AUDIOX_WORKER_SECRET` | Shared secret for authenticating requests between Vercel and the Worker | Required for production | Server only (Vercel & Railway) |
| `FILE_EXPIRY_MINUTES` | Converted file retention duration in minutes (default: `30`) | Optional | Server only |

*Note: Neither `AUDIOX_WORKER_URL` nor `AUDIOX_WORKER_SECRET` are exposed to browser code (no `NEXT_PUBLIC_` prefix).*

---

## Local Development

### 1. Run Next.js Frontend
```bash
npm install
npm run dev
```
AudioX frontend will start at `http://localhost:3000`.

### 2. Run Worker Locally (Optional with Docker or Python)
```bash
cd worker
pip install -r requirements.txt
python server.py
```
Or via Docker:
```bash
cd worker
docker build -t audiox-worker .
docker run -p 8000:8000 -e WORKER_SECRET=testsecret audiox-worker
```
