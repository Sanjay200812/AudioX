import { NextRequest, NextResponse } from 'next/server';
import { validatePassword, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!validatePassword(password)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const token = createSessionToken();
    const response = NextResponse.json({ success: true, message: 'Authenticated' });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
