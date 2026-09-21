import { NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';
import { checkWorkerHealth, isWorkerConfigured } from '@/lib/worker-client';

export async function GET() {
  const workerConfigured = isWorkerConfigured();
  const workerHealth = await checkWorkerHealth();

  const isOk = workerHealth.ok;

  const jobs = queueEngine.getJobs();
  const activeJobs = jobs.filter((j) => j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting');
  const queuedJobs = jobs.filter((j) => j.status === 'queued');

  return NextResponse.json({
    status: isOk ? 'ok' : 'degraded',
    python: Boolean(workerHealth.python),
    ytdlp: Boolean(workerHealth.ytdlp),
    ffmpeg: Boolean(workerHealth.ffmpeg),
    worker: workerConfigured ? workerHealth.status : 'unconfigured',
    queue: {
      concurrency: 1,
      total: jobs.length,
      active: activeJobs.length,
      queued: queuedJobs.length,
    },
  });
}

