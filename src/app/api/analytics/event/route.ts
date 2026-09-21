import { NextRequest, NextResponse } from 'next/server';
import { recordSupabaseVisitor, recordSupabaseDownloadEvent } from '@/lib/supabase/server';
import { upsertVisitor, recordDownloadEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      visitorId,
      deviceType,
      browser,
      status,
      videoId,
      title,
      creator,
      playlistId,
      playlistTitle,
      format = 'mp3',
      quality = 'high',
      filename,
      isRedownload = false,
      processingDurationMs = 0,
    } = body;

    // Basic payload sanity checks
    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 32) {
      return NextResponse.json({ error: 'Invalid visitor ID' }, { status: 400 });
    }

    const validStatuses = ['queued', 'processed', 'downloaded', 'failed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid event status' }, { status: 400 });
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // 1. Supabase Ingestion
    recordSupabaseVisitor({
      visitorId: visitorId.trim(),
      deviceType: typeof deviceType === 'string' ? deviceType.slice(0, 32) : 'Desktop',
      browser: typeof browser === 'string' ? browser.slice(0, 32) : 'Browser',
    }).catch(() => {});

    recordSupabaseDownloadEvent({
      visitorId: visitorId.trim(),
      videoId: typeof videoId === 'string' ? videoId.slice(0, 64) : undefined,
      title: title.slice(0, 255),
      creator: typeof creator === 'string' ? creator.slice(0, 255) : undefined,
      playlistId: typeof playlistId === 'string' ? playlistId.slice(0, 64) : undefined,
      playlistTitle: typeof playlistTitle === 'string' ? playlistTitle.slice(0, 255) : undefined,
      format: typeof format === 'string' ? format.slice(0, 16) : 'mp3',
      quality: typeof quality === 'string' ? quality.slice(0, 16) : 'high',
      status,
      filename: typeof filename === 'string' ? filename.slice(0, 255) : undefined,
      processingDurationMs: typeof processingDurationMs === 'number' ? Math.max(0, processingDurationMs) : 0,
      isRedownload: !!isRedownload,
    }).catch(() => {});

    // 2. Fallback Database Ingestion
    try {
      upsertVisitor({
        visitorId: visitorId.trim(),
        deviceType: typeof deviceType === 'string' ? deviceType.slice(0, 32) : 'Desktop',
        browser: typeof browser === 'string' ? browser.slice(0, 32) : 'Browser',
      });

      recordDownloadEvent({
        visitorId: visitorId.trim(),
        videoId: typeof videoId === 'string' ? videoId.slice(0, 64) : undefined,
        title: title.slice(0, 255),
        creator: typeof creator === 'string' ? creator.slice(0, 255) : undefined,
        playlistId: typeof playlistId === 'string' ? playlistId.slice(0, 64) : undefined,
        playlistTitle: typeof playlistTitle === 'string' ? playlistTitle.slice(0, 255) : undefined,
        format: typeof format === 'string' ? format.slice(0, 16) : 'mp3',
        quality: typeof quality === 'string' ? quality.slice(0, 16) : 'high',
        status,
        filename: typeof filename === 'string' ? filename.slice(0, 255) : undefined,
        processingDurationMs: typeof processingDurationMs === 'number' ? Math.max(0, processingDurationMs) : 0,
        isRedownload: !!isRedownload,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Analytics event logging error:', err);
    return NextResponse.json({ error: 'Event recorded partially' }, { status: 200 });
  }
}
