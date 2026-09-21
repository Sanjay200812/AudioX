# AudioX Media Worker (Railway Deployment Guide)

This is the dedicated heavy media processing service for **AudioX**, containing Python, `yt-dlp`, FFmpeg, and a sequential FIFO queue (concurrency = 1).

---

## 1. Railway Deployment Steps

1. **Push your repository to GitHub**:
   Ensure the latest commits (including `/worker`) are pushed to your GitHub repository.

2. **Create a new Project in Railway**:
   - Go to [railway.app](https://railway.app) and create a **New Project**.
   - Select **Deploy from GitHub repo**.
   - Choose your `AudioX` repository.

3. **Configure Service Source**:
   - In Railway, click on the newly created service and open **Settings**.
   - Under **Build**:
     - **Dockerfile Path**: `worker/Dockerfile`
     - **Watch Paths**: `/worker/**`

4. **Add Railway Environment Variables**:
   In the **Variables** tab of the service, set:

   | Variable | Example Value | Description |
   | :--- | :--- | :--- |
   | `WORKER_SECRET` | `<generate-strong-secret>` | Shared secret for authenticating server-to-server calls from Vercel |
   | `TEMP_DIR` | `/tmp/audiox` | Temp directory for media downloading and transcoding |
   | `FILE_EXPIRY_MINUTES` | `30` | Auto-cleanup interval for completed audio files |
   | `MAX_FILE_SIZE_MB` | `500` | Maximum allowable output audio file size |
   | `MAX_VIDEO_DURATION_MINUTES` | `120` | Maximum media duration allowed (rejects live streams) |

5. **Deploy the Worker**:
   Railway will automatically build the Docker image, install FFmpeg & Python dependencies, and run `uvicorn app:app --host 0.0.0.0 --port $PORT`.

6. **Generate Public HTTPS Domain**:
   - In the service settings, navigate to **Networking** -> **Public Networking**.
   - Click **Generate Domain**.
   - Example: `https://audiox-worker-production.up.railway.app`.

7. **Verify Worker Health**:
   Open in your browser or curl:
   ```bash
   curl -s https://<your-worker-domain>.up.railway.app/health
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

## 2. Connecting Vercel to Railway

In your Vercel project settings, set:

```env
AUDIOX_WORKER_URL=https://<your-worker-domain>.up.railway.app
AUDIOX_WORKER_SECRET=<the-exact-same-WORKER_SECRET>
```

Redeploy Vercel. AudioX will now route all audio downloads through your dedicated Railway worker.
