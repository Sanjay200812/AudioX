# AudioX - Vercel + Supabase Production Deployment Guide

This guide provides end-to-end instructions for deploying **AudioX** with **Vercel** (Compute, Next.js Frontend & API routes) and **Supabase** (Postgres Database, Supabase Auth, and Supabase Storage).

Zero dependency on Railway, Render, Fly.io, or separate VPS.

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
    └─────────┬───────────────┬─────────┘
              │               │
  (Media API) │               │ (Auth, DB & Media Storage)
              ▼               ▼
┌───────────────────┐   ┌───────────────────────────────────┐
│   Media Worker    │   │        Supabase (Cloud)           │
│                   │   │                                   │
│ • Python 3.12     │   │ • Supabase Auth                   │
│ • FastAPI         │   │ • PostgreSQL Database (downloads) │
│ • yt-dlp          │   │ • Supabase Storage (audio files,  │
│ • FFmpeg/ffprobe  │   │   thumbnails & user media)        │
│ • Bounded Queue   │   │ • Row Level Security (RLS)        │
└───────────────────┘   └───────────────────────────────────┘
```

---

## 2. Required Accounts & Services

1. **GitHub Account**: To host the AudioX repository.
2. **Vercel Account**: Hosting Next.js web application and serverless API endpoints ([vercel.com](https://vercel.com)).
3. **Supabase Account**: Managed PostgreSQL Database, Auth, and Storage ([supabase.com](https://supabase.com)).
4. **Media Processing Worker**:
   - The worker runs `worker/Dockerfile` (Python 3.12 + FFmpeg + yt-dlp).
   - In local development, it runs locally on `http://127.0.0.1:8000`.
   - In production, it can be run as a containerized service.

---

## 3. Environment Variables Reference

| Variable Name | Required | Public / Secret | Where to Get It | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | **Public** (Client + Server) | Supabase Dashboard -> **Project Settings** -> **API** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | **Public** (Client + Server) | Supabase Dashboard -> **Project Settings** -> **API** | Public anonymous API key for client-side queries |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | **Secret** (Server-only) | Supabase Dashboard -> **Project Settings** -> **API** | Secret service-role key for backend uploads to Supabase Storage |
| `SUPABASE_STORAGE_BUCKET` | Optional | **Server-only** | Default: `audiox-media` | Supabase Storage bucket name for persistent media files |
| `AUDIOX_WORKER_URL` | **Yes (Prod)** | **Secret** (Server-only) | Deployed Media Worker HTTPS domain | Directs Next.js API routes to the audio extraction and FFmpeg worker |
| `AUDIOX_WORKER_SECRET` | **Yes (Prod)** | **Secret** (Server-only) | Random 32+ character hex string (e.g. `openssl rand -hex 32`) | Authenticates server-to-server calls between Vercel and the media worker |
| `NEXT_PUBLIC_APP_URL` | Optional | **Public** (Client + Server) | Your custom domain or Vercel production URL | Canonical origin URL for links and redirects |
| `TEMP_DIR` | Optional | **Secret** (Server-only) | Default: `/tmp/audiox` | Scratch directory for media extraction and FFmpeg transcoding |
| `FILE_EXPIRY_MINUTES` | Optional | **Secret** (Server-only) | Default: `30` | Auto-cleanup interval for completed temporary audio files |
| `GEMINI_API_KEY` | Optional | **Secret** (Server-only) | Google AI Studio | Optional AI features |
| `OPENAI_API_KEY` | Optional | **Secret** (Server-only) | OpenAI Dashboard | Optional AI features |

---

## 4. Supabase Setup Steps

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com) and create a new project.
2. **Execute Database & Storage Schema**:
   - In your Supabase Dashboard, open the **SQL Editor**.
   - Copy and paste the contents of [`supabase/schema.sql`](file:///G:/AntiGravity%20IDE/Main/AudioX/supabase/schema.sql).
   - Click **Run**.
   - This creates:
     - The `public.downloads` table with Row Level Security (RLS).
     - The `audiox-media` Storage bucket for audio files.
     - Public read and server-side upload policies.
3. **Copy API Keys**:
   - Go to **Project Settings** -> **API**.
   - Note the **Project URL**, the **anon public key**, and the **service_role secret key**.

---

## 5. Vercel Import & Deployment Steps

### Step 1: Push Repository to GitHub
Ensure all changes in `AudioX` are committed to your GitHub repository:
```bash
git add .
git commit -m "Configure AudioX for Vercel + Supabase production deployment"
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
NEXT_PUBLIC_SUPABASE_URL = https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your_anon_key
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
AUDIOX_WORKER_URL = https://worker.your-audiox-domain.com
AUDIOX_WORKER_SECRET = your_chosen_secret
```

### Step 5: Click Deploy
Click **Deploy**. Vercel will compile the Next.js frontend, bundle serverless functions with 60-second timeouts, and launch your application.

---

## 6. Media Worker Deployment

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

## 7. Post-Deployment Verification Checklist

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
   - Completed audio tracks are stored in Supabase Storage and cached in browser IndexedDB.
   - Disconnect your internet connection and verify that the track continues to play directly from the offline cache.

---

## 8. Custom Domain Configuration

To connect your custom domain to AudioX:
1. In your Vercel Project Dashboard, navigate to **Settings** -> **Domains**.
2. Enter your custom domain (e.g. `audiox.yourdomain.com`).
3. Add the generated DNS CNAME or A records to your DNS provider.
4. Set `NEXT_PUBLIC_APP_URL=https://audiox.yourdomain.com` in Vercel Environment Variables.
5. In Supabase Dashboard -> **Authentication** -> **URL Configuration**, add `https://audiox.yourdomain.com/**` to the **Redirect URLs**.

---

## 9. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `503 Service Unavailable / WORKER_UNAVAILABLE` | `AUDIOX_WORKER_URL` is empty or incorrect | Set `AUDIOX_WORKER_URL` in Vercel Project Settings -> Environment Variables and redeploy. |
| `403 Forbidden` on worker requests | Worker secrets do not match | Ensure `AUDIOX_WORKER_SECRET` on Vercel exactly matches `WORKER_SECRET` on the worker. |
| Supabase Storage upload error | Missing `SUPABASE_SERVICE_ROLE_KEY` or bucket not created | Ensure `SUPABASE_SERVICE_ROLE_KEY` is set and run `supabase/schema.sql` in the Supabase SQL Editor. |
| Download timed out | Video duration exceeds limits | Ensure duration is under 120 minutes. Set function timeout to 60s in `vercel.json`. |
| Converted file expired (`410 Gone`) | 30-minute temp file cleanup occurred | Download links expire after 30 minutes for security. Re-queue or download immediately. |
