import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'disabled',
      message: 'Server-sent events stream is disabled. AudioX client uses status polling against the media processing service.',
    },
    { status: 410 }
  );
}
