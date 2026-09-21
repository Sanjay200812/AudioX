import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';

export async function GET(req: NextRequest) {
  const authenticated = isAuthenticatedAdmin(req);
  return NextResponse.json({ authenticated });
}
