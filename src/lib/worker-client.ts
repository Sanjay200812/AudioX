/**
 * AudioX Server-Only Worker Client.
 * Communicates with the external Docker media worker (Railway/Render/VPS).
 * NEVER import this file in client components.
 */

export interface WorkerJobStatus {
  jobId: string;
  status: 'queued' | 'fetching' | 'extracting' | 'converting' | 'finalizing' | 'ready' | 'failed' | 'cancelled';
  stage?: string;
  progress: number;
  title?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string | null;
  createdAt?: number;
  startedAt?: number | null;
  completedAt?: number | null;
}

export interface CreateWorkerJobParams {
  id?: string;
  sourceUrl: string;
  format: string;
  quality: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
}

function getWorkerConfig(): { workerUrl: string; workerSecret: string } {
  const workerUrl = (process.env.AUDIOX_WORKER_URL || '').trim().replace(/\/+$/, '');
  const workerSecret = (process.env.AUDIOX_WORKER_SECRET || '').trim();
  return { workerUrl, workerSecret };
}

export function isWorkerConfigured(): boolean {
  const { workerUrl } = getWorkerConfig();
  return Boolean(workerUrl);
}

function getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const { workerSecret } = getWorkerConfig();
  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (workerSecret) {
    headers['Authorization'] = `Bearer ${workerSecret}`;
  }
  return headers;
}

/**
 * Health check on external worker
 */
export async function checkWorkerHealth(): Promise<{
  ok: boolean;
  status: string;
  python?: boolean;
  ytdlp?: boolean;
  ffmpeg?: boolean;
  error?: string;
}> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    return { ok: false, status: 'unconfigured', error: 'AUDIOX_WORKER_URL is not set' };
  }

  try {
    const res = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, status: `HTTP ${res.status}`, error: 'Worker returned non-200' };
    }

    const data = await res.json();
    return {
      ok: data.status === 'ok',
      status: data.status || 'unknown',
      python: data.python,
      ytdlp: data.ytdlp,
      ffmpeg: data.ffmpeg,
    };
  } catch (err: any) {
    return { ok: false, status: 'unreachable', error: err?.message || 'Worker connection failed' };
  }
}

/**
 * Enqueue a conversion job on the external worker
 */
export async function createWorkerJob(params: CreateWorkerJobParams): Promise<{ jobId: string; status: string }> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    throw new Error('AUDIOX_WORKER_URL is not configured on this server.');
  }

  const res = await fetch(`${workerUrl}/jobs`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Worker rejected job (status ${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Poll job status from the external worker
 */
export async function getWorkerJob(jobId: string): Promise<WorkerJobStatus | null> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) return null;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: getHeaders(),
      cache: 'no-store',
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to fetch job: HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`Error polling worker job ${jobId}:`, err);
    return null;
  }
}

/**
 * Cancel an active or queued job on the external worker
 */
export async function cancelWorkerJob(jobId: string): Promise<boolean> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) return false;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stream converted audio file from external worker to the Next.js API route
 */
export async function fetchWorkerDownload(jobId: string): Promise<Response> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    throw new Error('Worker URL is not configured');
  }

  return await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/download`, {
    method: 'GET',
    headers: getHeaders(),
    cache: 'no-store',
  });
}
