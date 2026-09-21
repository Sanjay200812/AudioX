import { NextRequest, NextResponse } from 'next/server';
import {
  getExpectedAdminKey,
  getClientIp,
  createAdminSessionToken,
  ADMIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/security/admin';
import { checkAdminRateLimit, recordAdminFailedAttempt, resetAdminRateLimit } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. Rate limit check (max 5 failed attempts in 15 mins)
    const rateLimit = checkAdminRateLimit(ip);
    if (rateLimit.blocked) {
      const waitMinutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
      return NextResponse.json(
        { error: `Temporarily locked. Try again after ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accessKey = body?.accessKey;

    if (!accessKey || typeof accessKey !== 'string') {
      recordAdminFailedAttempt(ip);
      return NextResponse.json({ error: 'Access key is required.' }, { status: 400 });
    }

    // 2. Validate key against environment variable AUDIOX_ADMIN_KEY
    const expectedKey = getExpectedAdminKey();
    if (accessKey !== expectedKey) {
      const updatedLimit = recordAdminFailedAttempt(ip);
      if (updatedLimit.blocked) {
        return NextResponse.json(
          { error: 'Temporarily locked due to too many failed attempts. Try again later.' },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: 'Invalid access key.' }, { status: 401 });
    }

    // 3. Reset rate limit counter on success
    resetAdminRateLimit(ip);

    // 4. Generate 12-hour signed session token
    const token = createAdminSessionToken();

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err: any) {
    console.error('Admin login error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
