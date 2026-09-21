import { NextRequest, NextResponse } from 'next/server';
import { cancelWorkerJob, getWorkerJob } from '@/lib/worker-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = await getWorkerJob(id);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cancelled = await cancelWorkerJob(id);

  if (!cancelled) {
    return NextResponse.json({ error: 'Job could not be cancelled or not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Job cancelled successfully' });
}
