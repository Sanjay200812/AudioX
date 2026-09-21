import { NextRequest, NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const retried = queueEngine.retryJob(id);

  if (!retried) {
    return NextResponse.json(
      { error: 'Cannot retry job. Max retries (2) exceeded or job is not in failed state.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: 'Job re-queued for processing' });
}
