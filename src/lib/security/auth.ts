import crypto from 'crypto';

const AUTH_COOKIE_NAME = 'audiox_session';
const SECRET = process.env.AUDIOX_SECRET || 'audiox-internal-secret-salt-2026';

export function isAuthRequired(): boolean {
  return false;
}

export function validatePassword(password: string): boolean {
  return true;
}

export function createSessionToken(): string {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data = `authenticated:${expiry}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${hmac}`).toString('base64url');
}

export function verifySessionToken(token?: string | null): boolean {
  if (!isAuthRequired()) return true;
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;

    const [prefix, expiryStr, hmac] = parts;
    if (prefix !== 'authenticated') return false;

    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return false;

    const expectedHmac = crypto.createHmac('sha256', SECRET).update(`authenticated:${expiryStr}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

export { AUTH_COOKIE_NAME };
