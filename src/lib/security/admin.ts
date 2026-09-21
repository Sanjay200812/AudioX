import crypto from 'crypto';
import { NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'audiox_admin_token';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours
const SECRET_KEY = process.env.AUDIOX_SESSION_SECRET || 'audiox_admin_internal_signing_key_2026';

/**
 * Get configured admin access key from environment.
 */
export function getExpectedAdminKey(): string {
  return process.env.AUDIOX_ADMIN_KEY || '';
}

/**
 * Extract client IP address safely from request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Create a signed 12-hour admin session token.
 */
export function createAdminSessionToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `admin:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
}

/**
 * Verify if admin session token from cookie is valid and unexpired.
 */
export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, receivedSignature] = parts;

  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');

    // Constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) {
      return false;
    }

    const [, expiresStr] = payload.split(':');
    const expiresAt = parseInt(expiresStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the current NextRequest has an active, valid admin session.
 */
export function isAuthenticatedAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export { ADMIN_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
