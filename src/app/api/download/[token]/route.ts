import { NextRequest, NextResponse } from 'next/server';
import { fetchWorkerDownload, isWorkerConfigured } from '@/lib/worker-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (!token) {
    return NextResponse.json({ error: 'Download token is required.' }, { status: 400 });
  }

  if (!jobId) {
    return NextResponse.json({ error: 'jobId query parameter is required.' }, { status: 400 });
  }

  if (!isWorkerConfigured()) {
    return NextResponse.json(
      { error: 'Audio processing service is temporarily unavailable.' },
      { status: 503 }
    );
  }

  try {
    const workerRes = await fetchWorkerDownload(jobId, token);

    if (!workerRes.ok) {
      if (workerRes.status === 404 || workerRes.status === 410) {
        return NextResponse.json(
          { error: 'Audio download has expired or was cleaned up.' },
          { status: 410 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to retrieve audio from processing worker.' },
        { status: workerRes.status }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', workerRes.headers.get('Content-Type') || 'audio/mpeg');
    const contentLength = workerRes.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    const disposition = workerRes.headers.get('Content-Disposition');
    if (disposition) {
      headers.set('Content-Disposition', disposition);
    }
    headers.set('Cache-Control', 'no-store, max-age=0');

    return new Response(workerRes.body, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('[api/download] Download stream error:', err);
    return NextResponse.json(
      { error: 'Audio processing service is temporarily unavailable.' },
      { status: 503 }
    );
  }
}
