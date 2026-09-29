/**
 * Centralized Application and Infrastructure Configuration for AudioX.
 * Normalizes local development (localhost) and production Vercel deployment.
 * Eliminates hardcoded URLs across components and routes.
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
