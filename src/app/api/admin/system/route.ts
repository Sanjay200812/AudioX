import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { isFfmpegAvailable } from '@/lib/media/ffmpeg';
import { queueEngine } from '@/lib/queue/queue.engine';
import { getBaseTempDir } from '@/lib/storage/temp';
import { getDashboardStats } from '@/lib/db/database';
import { getSupabaseHealthStatus } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [ffmpegOk, dbStats, supabaseHealth] = await Promise.all([
      isFfmpegAvailable().catch(() => false),
      Promise.resolve().then(() => {
        try {
          return getDashboardStats();
        } catch {
          return null;
        }
      }),
      getSupabaseHealthStatus().catch(() => 'Unavailable' as const),
    ]);

    // Check temp storage writability
    let tempStorageWritable = false;
    try {
      const tempDir = getBaseTempDir();
      const testFile = path.join(tempDir, `.test_write_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      tempStorageWritable = true;
    } catch {
      tempStorageWritable = false;
    }

    const jobs = queueEngine.getJobs();
    const queuedCount = jobs.filter((j) => j.status === 'queued' || j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting').length;
    const failedTodayCount = dbStats?.failedDownloads ?? 0;

    return NextResponse.json({
      webApp: 'Online',
      worker: 'Online',
      ffmpeg: ffmpegOk ? 'Available' : 'Unavailable (Check PATH)',
      queue: 'Connected',
      redis: process.env.REDIS_URL ? 'Connected' : 'Not Configured (Using In-Memory)',
      database: dbStats ? 'Connected (SQLite WAL)' : 'Error Connecting',
      supabaseDatabase: supabaseHealth,
      temporaryStorage: tempStorageWritable ? 'Writable' : 'Read-Only / Unwritable',
      currentQueue: queuedCount,
      failedJobsToday: failedTodayCount,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
    });
  } catch (err: any) {
    console.error('Admin system status error:', err);
    return NextResponse.json({ error: 'Failed to retrieve system status' }, { status: 500 });
  }
}
