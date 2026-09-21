import { NextRequest, NextResponse } from 'next/server';
import { recordSupabaseVisitor, recordSupabaseDownloadEvent } from '@/lib/supabase/server';
import { upsertVisitor, recordDownloadEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      visitorId,
      deviceType,
      browser,
      videoId,
      title,
      creator,
      playlistId,
      playlistTitle,
      format = 'mp3',
      quality = 'high',
      status = 'downloaded',
      filename,
      processingDurationMs = 0,
      isRedownload = false,
    } = body;

    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 32) {
      return NextResponse.json({ error: 'Invalid visitor ID' }, { status: 400 });
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const cleanVisitorId = visitorId.trim();
    const cleanDevice = typeof deviceType === 'string' ? deviceType.slice(0, 32) : 'Desktop';
    const cleanBrowser = typeof browser === 'string' ? browser.slice(0, 32) : 'Browser';

    const validStatuses = ['queued', 'processed', 'downloaded', 'failed', 'cancelled', 'skipped'];
    const cleanStatus = validStatuses.includes(status) ? status : 'downloaded';

    const downloadPayload = {
      visitorId: cleanVisitorId,
      videoId: typeof videoId === 'string' ? videoId.slice(0, 64) : undefined,
      title: title.slice(0, 255),
      creator: typeof creator === 'string' ? creator.slice(0, 255) : undefined,
      playlistId: typeof playlistId === 'string' ? playlistId.slice(0, 64) : undefined,
      playlistTitle: typeof playlistTitle === 'string' ? playlistTitle.slice(0, 255) : undefined,
      format: typeof format === 'string' ? format.slice(0, 16) : 'mp3',
      quality: typeof quality === 'string' ? quality.slice(0, 16) : 'high',
      status: cleanStatus,
      filename: typeof filename === 'string' ? filename.slice(0, 255) : undefined,
      processingDurationMs: typeof processingDurationMs === 'number' ? Math.max(0, processingDurationMs) : 0,
      isRedownload: Boolean(isRedownload),
    };

    // 1. Supabase ingestion (Primary)
    recordSupabaseVisitor({
      visitorId: cleanVisitorId,
      deviceType: cleanDevice,
      browser: cleanBrowser,
    }).catch(() => {});

    recordSupabaseDownloadEvent(downloadPayload).catch(() => {});

    // 2. Local fallback database ingestion
    try {
      upsertVisitor({
        visitorId: cleanVisitorId,
        deviceType: cleanDevice,
        browser: cleanBrowser,
      });

      recordDownloadEvent({
        ...downloadPayload,
        status: cleanStatus as any,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Download analytics endpoint error:', err);
    return NextResponse.json({ success: true }); // Always non-blocking
  }
}
