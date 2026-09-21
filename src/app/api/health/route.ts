import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'AudioX',
    runtime: 'vercel-serverless',
    timestamp: new Date().toISOString(),
  });
}
