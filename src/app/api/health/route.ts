import { NextResponse } from 'next/server';
import { isFfmpegAvailable } from '@/lib/media/ffmpeg';
import { getBaseTempDir } from '@/lib/storage/temp';
import { queueEngine } from '@/lib/queue/queue.engine';
import fs from 'fs';

export async function GET() {
  const ffmpegOk = await isFfmpegAvailable();

  let storageWritable = false;
  try {
    const testDir = getBaseTempDir();
    const testFile = `${testDir}/health_check.tmp`;
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  const jobs = queueEngine.getJobs();
  const activeJobs = jobs.filter((j) => j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting');
  const queuedJobs = jobs.filter((j) => j.status === 'queued');

  return NextResponse.json({
    status: ffmpegOk && storageWritable ? 'healthy' : 'degraded',
    service: 'AudioX',
    timestamp: new Date().toISOString(),
    ffmpeg: ffmpegOk ? 'available' : 'unavailable',
    storage: storageWritable ? 'writable' : 'read-only/error',
    queue: {
      concurrency: 1,
      total: jobs.length,
      active: activeJobs.length,
      queued: queuedJobs.length,
    },
  });
}
