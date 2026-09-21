import { NextRequest, NextResponse } from 'next/server';
import { isAuthRequired, verifySessionToken, AUTH_COOKIE_NAME } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  const required = isAuthRequired();
  if (!required) {
    return NextResponse.json({ required: false, authenticated: true });
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authenticated = verifySessionToken(token);

  return NextResponse.json({ required: true, authenticated });
}
