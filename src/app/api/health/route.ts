import { NextResponse } from 'next/server';
import { checkWorkerHealth, isWorkerConfigured } from '@/lib/worker-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const workerConfigured = isWorkerConfigured();
  const workerHealth = await checkWorkerHealth();

  const isOk = workerHealth.ok;

  return NextResponse.json({
    status: isOk ? 'ok' : 'degraded',
    service: 'AudioX',
    runtime: 'vercel-frontend',
    python: Boolean(workerHealth.python),
    ytdlp: Boolean(workerHealth.ytdlp),
    ffmpeg: Boolean(workerHealth.ffmpeg),
    queue: Boolean(workerHealth.queue),
    worker: workerConfigured ? workerHealth.status : 'unconfigured',
    timestamp: new Date().toISOString(),
  });
}
