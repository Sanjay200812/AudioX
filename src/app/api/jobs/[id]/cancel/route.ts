import { NextRequest, NextResponse } from 'next/server';
import { cancelWorkerJob } from '@/lib/worker-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cancelled = await cancelWorkerJob(id);

  return NextResponse.json({
    success: true,
    message: cancelled ? 'Job cancelled' : 'Job already completed or cancelled',
  });
}
