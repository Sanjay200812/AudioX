import 'server-only';
import { getWorkerUrl, getWorkerSecret, isWorkerConfigured } from '@/lib/config';

/**
 * AudioX Server-Only Media Worker Client.
 * Communicates securely with the media processing worker.
 * Enforces bounded timeouts, sanitized error responses, and strict server boundary.
 */

export { isWorkerConfigured };

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

const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const HEALTH_FETCH_TIMEOUT_MS = 8000;
const DOWNLOAD_FETCH_TIMEOUT_MS = 45000;

function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const workerSecret = getWorkerSecret();
  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (workerSecret) {
    headers['Authorization'] = `Bearer ${workerSecret}`;
  }
  return headers;
}

/**
 * Health check on media worker with truthful status reporting.
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
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    return { ok: false, status: 'unconfigured', error: 'AUDIOX_WORKER_URL is not set' };
  }

  try {
    const res = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ok: false, status: `HTTP ${res.status}`, error: 'Worker returned degraded/non-200' };
    }

    const data = await res.json();
    return {
      ok: data.status === 'ok',
      status: data.status || 'unknown',
      python: Boolean(data.python),
      ytdlp: Boolean(data.ytdlp),
      ffmpeg: Boolean(data.ffmpeg),
      queue: Boolean(data.queue),
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      ok: false,
      status: 'unreachable',
      error: isTimeout ? 'Worker connection timed out' : 'Worker connection failed',
    };
  }
}

/**
 * Enqueue a media processing job on the worker.
 * Returns quickly with jobId and status: 'queued'.
 */
export async function createWorkerJob(params: CreateWorkerJobParams): Promise<{ jobId: string; status: string }> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Audio processing worker URL is not configured on this server.');
  }

  let res: Response;
  try {
    res = await fetch(`${workerUrl}/jobs`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('Worker request timed out. Please try again.');
    }
    throw new Error('Audio processing worker is unreachable.');
  }

  if (!res.ok) {
    let errMsg = `Worker rejected job (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {}
    throw new Error(errMsg);
  }

  return await res.json();
}

/**
 * Poll job status, authentic stages, and progress percentages from the worker.
 */
export async function getWorkerJob(jobId: string): Promise<WorkerJobStatus | null> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return null;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Worker returned status ${res.status}`);
    }

    return await res.json();
  } catch (err: any) {
    console.error(`[worker-client] Polling error for job ${jobId}:`, err?.message || err);
    return null;
  }
}

/**
 * Cancel an active or queued job on the worker.
 */
export async function cancelWorkerJob(jobId: string): Promise<boolean> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return false;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
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
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return false;

  try {
    const res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
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
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Audio processing worker URL is not configured.');
  }

  const query = new URLSearchParams({ token });
  try {
    return await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}/download?${query.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(DOWNLOAD_FETCH_TIMEOUT_MS),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('Audio download streaming timed out.');
    }
    throw new Error('Failed to connect to audio worker for download.');
  }
}
