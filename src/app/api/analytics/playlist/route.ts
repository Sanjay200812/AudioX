import { NextRequest, NextResponse } from 'next/server';
import { recordSupabaseVisitor, recordSupabasePlaylistEvent, incrementSupabasePlaylistTrack } from '@/lib/supabase/server';
import { upsertVisitor, recordPlaylistEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      visitorId,
      playlistId,
      playlistTitle,
      action,
      totalTracks = 0,
      selectedTracks = 0,
      completedTracks = 0,
      failedTracks = 0,
      // Handle alias fields
      trackCount,
      selectedCount,
      completedCount,
      failedCount,
    } = body;

    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 32) {
      return NextResponse.json({ error: 'Invalid visitor ID' }, { status: 400 });
    }

    const cleanVisitorId = visitorId.trim();

    // Handle track completion or failure increment
    if (action === 'track_completed' && playlistId) {
      await incrementSupabasePlaylistTrack(cleanVisitorId, playlistId, 'completed').catch(() => {});
      return NextResponse.json({ success: true });
    }
    if (action === 'track_failed' && playlistId) {
      await incrementSupabasePlaylistTrack(cleanVisitorId, playlistId, 'failed').catch(() => {});
      return NextResponse.json({ success: true });
    }

    const cleanTitle = typeof playlistTitle === 'string' ? playlistTitle.slice(0, 255) : 'Untitled Playlist';
    const total = typeof totalTracks === 'number' ? totalTracks : (typeof trackCount === 'number' ? trackCount : 0);
    const selected = typeof selectedTracks === 'number' ? selectedTracks : (typeof selectedCount === 'number' ? selectedCount : 0);
    const completed = typeof completedTracks === 'number' ? completedTracks : (typeof completedCount === 'number' ? completedCount : 0);
    const failed = typeof failedTracks === 'number' ? failedTracks : (typeof failedCount === 'number' ? failedCount : 0);

    const playlistPayload = {
      visitorId: cleanVisitorId,
      playlistId: typeof playlistId === 'string' ? playlistId.slice(0, 64) : undefined,
      playlistTitle: cleanTitle,
      totalTracks: total,
      selectedTracks: selected,
      completedTracks: completed,
      failedTracks: failed,
    };

    // 1. Supabase ingestion
    recordSupabaseVisitor({ visitorId: cleanVisitorId }).catch(() => {});
    recordSupabasePlaylistEvent(playlistPayload).catch(() => {});

    // 2. Local fallback database ingestion
    try {
      upsertVisitor({ visitorId: cleanVisitorId });
      recordPlaylistEvent({
        visitorId: cleanVisitorId,
        playlistId: playlistPayload.playlistId,
        playlistTitle: cleanTitle,
        trackCount: total,
        selectedCount: selected,
        completedCount: completed,
        failedCount: failed,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Playlist analytics logging error:', err);
    return NextResponse.json({ success: true }); // Always non-blocking
  }
}
