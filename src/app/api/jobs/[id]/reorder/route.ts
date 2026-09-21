import { NextRequest, NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json();
  const { direction } = body;

  if (direction !== 'up' && direction !== 'down') {
    return NextResponse.json({ error: 'direction must be "up" or "down"' }, { status: 400 });
  }

  const success = queueEngine.reorderJob(id, direction);
  if (!success) {
    return NextResponse.json(
      { error: 'Cannot reorder this item. It might be currently processing or at the boundary.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: 'Job reordered' });
}
