# AudioX

Lightweight, Public Audio Download & Offline Listening Tool.

AudioX decouples heavy media processing from the frontend:
1. **Vercel (Next.js Frontend & API)**:
   - Ultra-fast native metadata analysis (oEmbed + Innertube HTML without heavy processing)
   - Mobile-first playlist and sequential queue UI
   - Progressive Web App (PWA) with offline audio player
   - Browser-only IndexedDB download history and duplicate-download detection
   - Server-only proxy client communicating securely with the Railway worker
2. **Railway (Dedicated Media Worker)**:
   - Python 3.11 + FastAPI container
   - Direct `yt-dlp` Python library execution
   - FFmpeg & ffprobe (`libmp3lame` MP3 transcoding + native M4A optimization)
   - Strictly sequential FIFO queue (concurrency = 1)
   - Automatic 30-minute temporary file cleanup

---

## 1. Railway Worker Deployment

1. **Push current repository to GitHub**:
   ```bash
   git push origin main
   ```

2. **Create Railway Project**:
   - Go to [railway.app](https://railway.app) and create a **New Project**.
   - Select **Deploy from GitHub repo** and choose your `AudioX` repository.

3. **Configure Service Source**:
   - Open service **Settings**.
   - Under **Build**:
     - **Dockerfile Path**: `worker/Dockerfile`
     - **Watch Paths**: `/worker/**`

4. **Add Railway Environment Variables**:
   In the **Variables** tab of the service, add:
   - `WORKER_SECRET=<strong-random-secret>`
   - `TEMP_DIR=/tmp/audiox`
   - `FILE_EXPIRY_MINUTES=30`
   - `MAX_FILE_SIZE_MB=500`
   - `MAX_VIDEO_DURATION_MINUTES=120`

5. **Deploy Worker**:
   Railway will automatically build the container, install FFmpeg, and start FastAPI on `$PORT`.

6. **Generate Public HTTPS Domain**:
   - Under **Networking** -> **Public Networking**, click **Generate Domain**.
   - Example: `https://audiox-worker-production.up.railway.app`.

7. **Test Worker Health**:
   ```bash
   curl -s https://<your-worker-domain>.up.railway.app/health
   ```
   Must return:
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

## 2. Vercel Connection Configuration

1. In your Vercel project dashboard, navigate to **Settings** -> **Environment Variables**.
2. Add the following production variables:

   | Variable | Value |
   | :--- | :--- |
   | `AUDIOX_WORKER_URL` | `https://<your-worker-domain>.up.railway.app` |
   | `AUDIOX_WORKER_SECRET` | `<the-exact-same-WORKER_SECRET-from-railway>` |

3. Redeploy Vercel.
   *(Do NOT use `127.0.0.1` or `localhost` in production).*

---

## 3. Local Development

Run the worker locally:
```bash
cd worker
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

In another terminal, run Next.js:
```bash
npm run dev
```

AudioX will be accessible at `http://localhost:3000`.
