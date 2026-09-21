/**
 * AudioX Decoupled Heavy Worker Configuration
 *
 * AudioX Architecture:
 * - Vercel (Edge / Serverless):
 *   - Frontend Next.js UI & PWA
 *   - Lightweight Analyze API (/api/analyze)
 *   - Non-blocking Supabase Analytics & Telemetry
 *   - Admin Dashboard (/admin)
 *
 * - External Worker (Railway / Render / Fly.io / VPS / Docker):
 *   - YouTube audio stream fetching (yt-dlp)
 *   - FFmpeg audio transcoding (MP3 320k/192k/128k, M4A AAC)
 *   - Queue Engine FIFO sequential processing
 *   - Temporary workspace & media storage
 */

export interface WorkerConfig {
  workerUrl: string | null;
  workerSecret: string | null;
  isExternal: boolean;
}

export function getWorkerConfig(): WorkerConfig {
  const workerUrl = process.env.WORKER_URL?.trim() || null;
  const workerSecret = process.env.WORKER_SECRET?.trim() || null;

  return {
    workerUrl,
    workerSecret,
    isExternal: Boolean(workerUrl && workerUrl.startsWith('http')),
  };
}

export function isExternalWorkerConfigured(): boolean {
  return getWorkerConfig().isExternal;
}
