/**
 * AudioX Server-Only Railway Worker Client.
 * Communicates with the external dedicated media worker.
 * NEVER import this file in client-side React components.
 */

export interface WorkerJobStatus {
  jobId: string;
  videoId?: string;
  sourceUrl?: string;
  title?: string;
  creator?: string;
  thumbnail?: string;
  duration?: number;
  format?: string;
  quality?: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'cancelled';
  stage?: 'queued' | 'resolving' | 'downloading' | 'converting' | 'finalizing' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  downloadToken?: string;
  retryCount?: number;
}

export interface CreateWorkerJobParams {
  id?: string;
  sourceUrl: string;
  videoId?: string;
  format: string;
  quality: string;
  title?: string;
  artist?: string;
  creator?: string;
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

function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
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
 * Health check on dedicated Railway worker.
 */
export async function checkWorkerHealth(): Promise<{
  ok: boolean;
  status: string;
  python?: boolean;
  ytdlp?: boolean;
  ffmpeg?: boolean;
  queue?: boolean;
  error?: string;
}> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    return { ok: false, status: 'unconfigured', error: 'AUDIOX_WORKER_URL is not set' };
  }

  try {
    const res = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, status: `HTTP ${res.status}`, error: 'Worker returned degraded/non-200' };
    }

    const data = await res.json();
    return {
      ok: data.status === 'ok',
      status: data.status || 'unknown',
      python: data.python,
      ytdlp: data.ytdlp,
      ffmpeg: data.ffmpeg,
      queue: data.queue,
    };
  } catch (err: any) {
    return { ok: false, status: 'unreachable', error: err?.message || 'Worker connection failed' };
  }
}

/**
 * Enqueue a media processing job on the Railway worker.
 * Returns quickly with jobId and status: 'queued'.
 */
export async function createWorkerJob(params: CreateWorkerJobParams): Promise<{ jobId: string; status: string }> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    throw new Error('AUDIOX_WORKER_URL is not configured on this server.');
  }

  const res = await fetch(`${workerUrl}/jobs`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  if (!res.ok) {
    let errMsg = `Worker rejected job (status ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
    } catch {}
    throw new Error(errMsg);
  }

  return await res.json();
}

/**
 * Poll job status, authentic stages, and progress percentages from the worker.
 */
export async function getWorkerJob(jobId: string): Promise<WorkerJobStatus | null> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) return null;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to fetch job: HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`[worker-client] Error polling job ${jobId}:`, err);
    return null;
  }
}

/**
 * Cancel an active or queued job on the worker.
 */
export async function cancelWorkerJob(jobId: string): Promise<boolean> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) return false;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Re-queue a failed job in place on the worker.
 */
export async function retryWorkerJob(jobId: string): Promise<boolean> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) return false;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stream converted audio from the worker.
 * Validates download token directly with worker.
 */
export async function fetchWorkerDownload(jobId: string, token: string): Promise<Response> {
  const { workerUrl } = getWorkerConfig();
  if (!workerUrl) {
    throw new Error('AUDIOX_WORKER_URL is not configured.');
  }

  const query = new URLSearchParams({ token });
  return await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/download?${query.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
}
