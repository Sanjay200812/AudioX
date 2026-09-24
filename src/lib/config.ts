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

/**
 * Returns true if Supabase project environment variables are present.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();
  return Boolean(url && anonKey);
}

/**
 * Retrieves Supabase URL.
 */
export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

/**
 * Retrieves Supabase anonymous public key.
 */
export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
}

/**
 * Retrieves Supabase service-role secret key (Server-only).
 */
export function getSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}
