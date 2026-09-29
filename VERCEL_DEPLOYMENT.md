# AudioX - Vercel Production Deployment Guide

This guide provides end-to-end instructions for deploying **AudioX** entirely on **Vercel** with native Serverless Python media processing.

AudioX requires no accounts, passwords, or cloud databases. All user download history, preferences, and offline playback files are stored locally on the user's browser device using **IndexedDB** and **localStorage**.

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
    │  • Native Python Media Function   │
    │    (/api/process - @vercel/python)│
    │    ├── yt-dlp                     │
    │    ├── Bundled static FFmpeg      │
    │    └── Real-time chunked streaming│
    └───────────────────────────────────┘
```

---

## 2. Required Accounts & Services

1. **GitHub Account**: To host the AudioX repository.
2. **Vercel Account**: Hosting the full-stack Next.js + Python serverless application ([vercel.com](https://vercel.com)).

No Railway, Docker, or cloud databases required.

---

## 3. Environment Variables Reference

| Variable Name | Required | Public / Secret | Where to Get It | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Optional | **Public** (Client + Server) | Your custom domain or Vercel production URL | Canonical origin URL for links and redirects |
| `TEMP_DIR` | Optional | **Secret** (Server-only) | Default: `/tmp` | Scratch directory for media extraction and FFmpeg transcoding |
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

### Step 4: Click Deploy
Click **Deploy**. Vercel will build the Next.js frontend and the Serverless Python function (`api/process.py`) automatically.

---

## 5. Post-Deployment Verification Checklist

1. **Verify Health Route**:
   Visit `https://<your-vercel-domain>/api/health` in your browser.
   - Status should return `200 OK` with `"status": "ok"`.
2. **Verify Fast Metadata Analysis**:
   Paste a YouTube video link (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
   - Metadata, title, duration, author, and thumbnails should load within ~800ms.
3. **Verify Audio Conversion & Streaming**:
   - Choose format (`MP3` or `M4A`) and quality (`192k`, `320k`).
   - Click **Download Audio**.
   - Verify stages transition: `queued` -> `resolving` -> `downloading` -> `converting` -> `finalizing` -> `downloading file` -> `completed`.
4. **Verify Offline Player**:
   - Completed audio tracks are stored directly in browser IndexedDB.
   - Disconnect your internet connection and verify that the track continues to play directly from the offline cache.
