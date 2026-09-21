import { NextRequest, NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const skipped = queueEngine.skipJob(id);

  if (!skipped) {
    return NextResponse.json({ error: 'Job not found or already finished' }, { status: 400 });
  }

  return NextResponse.json({ message: 'Job skipped and advanced to next queue item' });
}
