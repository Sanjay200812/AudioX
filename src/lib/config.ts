/**
 * Centralized Application and Infrastructure Configuration for AudioX.
 * Normalizes local development (localhost) and production Vercel deployment.
 * Eliminates hardcoded URLs and secrets across components and routes.
 */

/**
 * Resolves the primary web application base URL.
 * Automatically handles local development, Vercel preview deployments, and custom production domains.
 */
export function getAppUrl(): string {
  // 1. Explicitly configured public app URL (custom domain)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, '');
  }

  // 2. Vercel deployment URL (system environment variable provided on Vercel)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, '')}`;
  }

  // 3. Browser runtime origin fallback
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // 4. Default local development URL
  return 'http://localhost:3000';
}

/**
 * Resolves the media processing worker URL.
 * In local development, defaults to the standard local worker port http://127.0.0.1:8000.
 * In production on Vercel, uses the configured AUDIOX_WORKER_URL.
 */
export function getWorkerUrl(): string {
  const envUrl = (process.env.AUDIOX_WORKER_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) {
    return envUrl;
  }

  // In local development or testing, fallback to standard local worker
  if (process.env.NODE_ENV !== 'production') {
    return 'http://127.0.0.1:8000';
  }

  return '';
}

/**
 * Retrieves the shared worker secret for server-to-worker authentication.
 * Kept strictly server-side (no NEXT_PUBLIC_ prefix).
 */
export function getWorkerSecret(): string {
  return (process.env.AUDIOX_WORKER_SECRET || '').trim();
}

/**
 * Returns true if the media worker is configured or running locally.
 */
export function isWorkerConfigured(): boolean {
  return Boolean(getWorkerUrl());
}

