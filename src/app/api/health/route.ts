import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'AudioX',
    runtime: 'vercel-native',
    architecture: 'serverless-stream',
    timestamp: new Date().toISOString(),
  }, {
    status: 200,
  });
}
