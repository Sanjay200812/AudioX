import { NextRequest } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial queue snapshot
      const initialJobs = queueEngine.getJobs();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'init', jobs: initialJobs })}\n\n`)
      );

      // 2. Event listener for queue engine
      const onEvent = (payload: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const onQueueUpdated = (jobs: any) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'queue:updated', jobs })}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      queueEngine.on('event', onEvent);
      queueEngine.on('queue:updated', onQueueUpdated);

      // Heartbeat ping every 15s to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(pingInterval);
        queueEngine.off('event', onEvent);
        queueEngine.off('queue:updated', onQueueUpdated);
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
