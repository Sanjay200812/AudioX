# AudioX Media Processing Worker

This is the dedicated heavy media processing service for **AudioX**, containing Python 3.12, `yt-dlp`, FFmpeg, and a sequential FIFO queue (concurrency = 1).

---

## 1. Architecture Overview

- **FastAPI HTTP Service**: Exposes authenticated endpoints for `/health`, `/jobs` (submission, status polling, cancellation, retry), and `/jobs/{job_id}/download` (token-validated audio streaming).
- **yt-dlp**: High-performance extraction of YouTube media streams.
- **FFmpeg & ffprobe**: Audio transcoding with `libmp3lame` (MP3) and `aac` (M4A) with metadata tagging.
- **Sequential FIFO Queue**: Bounded capacity (`maxsize=200`) processing jobs one-at-a-time to prevent CPU and memory spikes.
- **Automated Lifecycle**: 30-minute temp file cleanup loop with immediate source file deletion upon successful conversion.

---

## 2. Docker & Container Deployment

Build and run the production container:

```bash
cd worker
docker build -t audiox-worker .
docker run -d \
  -p 8000:8000 \
  -e PORT=8000 \
  -e WORKER_SECRET="your_strong_worker_secret_here" \
  -e TEMP_DIR="/tmp/audiox" \
  -e FILE_EXPIRY_MINUTES=30 \
  audiox-worker
```

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WORKER_SECRET` | *(required in prod)* | Shared secret for authenticating server-to-server calls from Vercel |
| `PORT` | `8000` | Runtime listening port |
| `TEMP_DIR` | `/tmp/audiox` | Temp directory for media downloading and transcoding |
| `FILE_EXPIRY_MINUTES` | `30` | Auto-cleanup interval for completed audio files |
| `MAX_FILE_SIZE_MB` | `500` | Maximum allowable output audio file size |
| `MAX_VIDEO_DURATION_MINUTES` | `120` | Maximum media duration allowed (rejects live streams) |

---

## 3. Verifying Health

Verify the service is operational:

```bash
curl -s http://127.0.0.1:8000/health
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

## 4. Connecting with Vercel

In your Vercel project environment settings, configure:

```env
AUDIOX_WORKER_URL=https://your-worker-domain.com
AUDIOX_WORKER_SECRET=your_strong_worker_secret_here
```
