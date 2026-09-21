import { NextRequest, NextResponse } from 'next/server';
import { retryWorkerJob } from '@/lib/worker-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const retried = await retryWorkerJob(id);

  if (!retried) {
    return NextResponse.json(
      { error: 'Cannot retry job. Job not found or worker unreachable.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: 'Job re-queued for processing' });
}
