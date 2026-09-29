# AudioX - Vercel Production Deployment Guide

This guide provides end-to-end instructions for deploying **AudioX** with **Vercel** (Next.js Frontend & API routes) and the containerized **Media Worker** (Railway or container host).

AudioX requires no accounts, passwords, or logins. All user download history, preferences, and offline playback files are stored locally on the user's browser device using **IndexedDB** and **localStorage**.

---

## 1. Architecture

```
User Browser (PWA / Offline Playback via IndexedDB)
                     │
                     ▼
    ┌───────────────────────────────────┐
    │       Vercel (Production)         │
    │                                   │
    │  • Next.js App Router (Turbopack) │
    │  • Fast Metadata Analyzer         │
    │    (/api/analyze - pure TS)       │
    │  • Streaming Download Proxy       │
    │    (/api/download/[token])        │
    │  • Job Queue Orchestrator         │
    │    (/api/jobs)                    │
    └─────────────────┬─────────────────┘
                      │
                      │ (Server-to-Server Authenticated Media API)
                      ▼
    ┌───────────────────────────────────┐
    │   Media Worker (Railway/Docker)   │
    │                                   │
    │ • Python 3.12                     │
    │ • FastAPI                         │
    │ • yt-dlp                          │
    │ • FFmpeg / ffprobe                │
    │ • Bounded Sequential Queue        │
    │ • Temporary File Lifecycle        │
    └───────────────────────────────────┘
```

---

## 2. Required Accounts & Services

1. **GitHub Account**: To host the AudioX repository.
2. **Vercel Account**: Hosting Next.js web application and serverless API endpoints ([vercel.com](https://vercel.com)).
3. **Media Processing Worker**:
   - The worker runs `worker/Dockerfile` (Python 3.12 + FFmpeg + yt-dlp) on Railway or any container host.
   - In local development, it runs locally on `http://127.0.0.1:8000`.

---

## 3. Environment Variables Reference

| Variable Name | Required | Public / Secret | Where to Get It | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `AUDIOX_WORKER_URL` | **Yes (Prod)** | **Secret** (Server-only) | Deployed Media Worker HTTPS domain | Directs Next.js API routes to the audio extraction and FFmpeg worker |
| `AUDIOX_WORKER_SECRET` | **Yes (Prod)** | **Secret** (Server-only) | Random 32+ character hex string (e.g. `openssl rand -hex 32`) | Authenticates server-to-server calls between Vercel and the media worker |
| `NEXT_PUBLIC_APP_URL` | Optional | **Public** (Client + Server) | Your custom domain or Vercel production URL | Canonical origin URL for links and redirects |
| `TEMP_DIR` | Optional | **Secret** (Server-only) | Default: `/tmp/audiox` | Scratch directory for media extraction and FFmpeg transcoding |
| `FILE_EXPIRY_MINUTES` | Optional | **Secret** (Server-only) | Default: `30` | Auto-cleanup interval for completed temporary audio files |
| `GEMINI_API_KEY` | Optional | **Secret** (Server-only) | Google AI Studio | Optional AI features |
| `OPENAI_API_KEY` | Optional | **Secret** (Server-only) | OpenAI Dashboard | Optional AI features |

---

## 4. Vercel Import & Deployment Steps

### Step 1: Push Repository to GitHub
Ensure all changes in `AudioX` are committed to your GitHub repository:
```bash
git add .
git commit -m "Configure AudioX for Vercel production deployment"
git push origin main
```

### Step 2: Import into Vercel
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Select your `AudioX` repository from GitHub and click **Import**.

### Step 3: Configure Project Settings in Vercel
- **Framework Preset**: `Next.js` (automatically detected).
- **Root Directory**: `./` (leave default).
- **Build Command**: `next build` (or leave default).
- **Output Directory**: `.next` (or leave default).
- **Install Command**: `npm install` (or leave default).

### Step 4: Configure Environment Variables in Vercel
Under the **Environment Variables** section in the Vercel import screen, add:

```env
AUDIOX_WORKER_URL = https://worker.your-audiox-domain.com
AUDIOX_WORKER_SECRET = your_chosen_secret
```

### Step 5: Click Deploy
Click **Deploy**. Vercel will compile the Next.js frontend, bundle serverless functions with configured timeouts, and launch your application.

---

## 5. Media Worker Deployment

The media worker handles CPU-heavy audio extraction and FFmpeg transcoding. Deploy it using the included production container configuration in `worker/Dockerfile`.

### Build & Run Container
```bash
cd worker
docker build -t audiox-worker .
docker run -d \
  --name audiox-worker \
  -p 8000:8000 \
  -e PORT=8000 \
  -e WORKER_SECRET="<your-chosen-secret>" \
  -e TEMP_DIR="/tmp/audiox" \
  -e FILE_EXPIRY_MINUTES=30 \
  audiox-worker
```

### Verify Worker Status
Check health endpoint:
```bash
curl -s https://<your-worker-domain>/health
```
Expected response:
```json
{
  "status": "ok",
  "python": true,
  "ytdlp": true,
  "ffmpeg": true,
  "queue": true
}
```

---

## 6. Post-Deployment Verification Checklist

1. **Verify Health Route**:
   Visit `https://<your-vercel-domain>/api/health` in your browser.
   - Status should return `200 OK` with `"status": "ok"`.
2. **Verify Fast Metadata Analysis**:
   Paste a YouTube video link (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
   - Metadata, title, duration, author, and thumbnails should load within ~800ms.
3. **Verify Audio Conversion & Sequential Queue**:
   - Choose format (`MP3` or `M4A`) and quality (`192k`, `320k`).
   - Click **Download Audio**.
   - Verify stages transition: `queued` -> `resolving` -> `downloading` -> `converting` -> `finalizing` -> `ready`.
4. **Verify Storage & Offline Player**:
   - Completed audio tracks are stored directly in browser IndexedDB.
   - Disconnect your internet connection and verify that the track continues to play directly from the offline cache.

---

## 7. Custom Domain Configuration

To connect your custom domain to AudioX:
1. In your Vercel Project Dashboard, navigate to **Settings** -> **Domains**.
2. Enter your custom domain (e.g. `audiox.yourdomain.com`).
3. Add the generated DNS CNAME or A records to your DNS provider.
4. Set `NEXT_PUBLIC_APP_URL=https://audiox.yourdomain.com` in Vercel Environment Variables.

---

## 8. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `503 Service Unavailable / WORKER_UNAVAILABLE` | `AUDIOX_WORKER_URL` is empty or incorrect | Set `AUDIOX_WORKER_URL` in Vercel Project Settings -> Environment Variables and redeploy. |
| `403 Forbidden` on worker requests | Worker secrets do not match | Ensure `AUDIOX_WORKER_SECRET` on Vercel exactly matches `WORKER_SECRET` on the worker. |
| Download timed out | Video duration exceeds limits | Ensure duration is under 120 minutes. Set function timeout to 60s in `vercel.json`. |
| Converted file expired (`410 Gone`) | 30-minute temp file cleanup occurred | Download links expire after 30 minutes for security. Re-queue or download immediately. |
