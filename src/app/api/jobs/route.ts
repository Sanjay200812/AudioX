import { NextRequest, NextResponse } from 'next/server';
import { createWorkerJob, isWorkerConfigured } from '@/lib/worker-client';
import { AudioFormat, AudioQuality } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    workerConfigured: isWorkerConfigured(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      sourceUrl,
      url,
      mediaId,
      videoId,
      title,
      artist,
      creator,
      thumbnail,
      duration,
      format = 'mp3',
      quality = 'high',
    } = body;

    const targetUrl = sourceUrl || url || mediaId || videoId;
    if (!targetUrl) {
      return NextResponse.json({ error: 'sourceUrl, url, or videoId is required.' }, { status: 400 });
    }

    const validFormats: AudioFormat[] = ['mp3', 'm4a'];
    const validQualities: AudioQuality[] = ['standard', 'high', 'best', '128k', '192k', '256k', '320k'];

    if (!validFormats.includes(format.toLowerCase() as AudioFormat)) {
      return NextResponse.json({ error: 'Invalid audio format. Must be mp3 or m4a.' }, { status: 400 });
    }

    if (!validQualities.includes(quality.toLowerCase() as AudioQuality)) {
      return NextResponse.json({ error: 'Invalid audio quality.' }, { status: 400 });
    }

    if (!isWorkerConfigured()) {
      const isLocalhost =
        process.env.NODE_ENV !== 'production' ||
        (process.env.AUDIOX_WORKER_URL || '').includes('127.0.0.1') ||
        (process.env.AUDIOX_WORKER_URL || '').includes('localhost');
      return NextResponse.json(
        {
          error: isLocalhost
            ? 'Local AudioX worker is offline. Start the worker on 127.0.0.1:8000.'
            : 'Audio processing service is temporarily unavailable.',
          errorCode: 'WORKER_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    const result = await createWorkerJob({
      id,
      sourceUrl: targetUrl,
      videoId: videoId || mediaId,
      format,
      quality,
      title,
      artist: artist || creator,
      creator: creator || artist,
      thumbnail,
      duration,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('[api/jobs] Job creation error:', err?.message || err);
    const rawMsg = err?.message || '';
    const errLower = rawMsg.toLowerCase();
    const isOffline =
      errLower.includes('offline') ||
      errLower.includes('unreachable') ||
      errLower.includes('fetch') ||
      errLower.includes('econnrefused') ||
      errLower.includes('unavailable');
    const isLocalhost =
      process.env.NODE_ENV !== 'production' ||
      (process.env.AUDIOX_WORKER_URL || '').includes('127.0.0.1') ||
      (process.env.AUDIOX_WORKER_URL || '').includes('localhost');

    let userError = rawMsg || 'Failed to submit processing job.';
    if (isOffline && isLocalhost) {
      userError = 'Local AudioX worker is offline. Start the worker on 127.0.0.1:8000.';
    } else if (isOffline) {
      userError = 'Audio processing service is temporarily unavailable.';
    }

    return NextResponse.json(
      {
        error: userError,
        errorCode: isOffline ? 'WORKER_UNAVAILABLE' : 'JOB_CREATION_FAILED',
      },
      { status: isOffline ? 503 : 400 }
    );
  }
}
