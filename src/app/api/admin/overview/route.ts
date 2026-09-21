import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { getSupabaseOverviewStats, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        configured: false,
        supabaseConfigured: false,
        error: 'Supabase analytics is not configured. Please set SUPABASE_URL and SUPABASE_SECRET_KEY in environment variables.',
        totalVisitors: 0,
        visitorsToday: 0,
        totalDownloads: 0,
        downloadsToday: 0,
        downloadsThisWeek: 0,
        downloadsThisMonth: 0,
        successfulDownloads: 0,
        failedDownloads: 0,
        totalPlaylistSessions: 0,
        totalPlaylistTracksDownloaded: 0,
        redownloadCount: 0,
        singleVideoCount: 0,
        playlistTrackCount: 0,
        mp3Count: 0,
        m4aCount: 0,
        dailyTrend: [],
      });
    }

    const supabaseStats = await getSupabaseOverviewStats();
    if (!supabaseStats) {
      return NextResponse.json({
        configured: false,
        supabaseConfigured: true,
        error: 'Cannot reach Supabase database. Please verify your SUPABASE_URL and SUPABASE_SECRET_KEY.',
        totalVisitors: 0,
        visitorsToday: 0,
        totalDownloads: 0,
        downloadsToday: 0,
        downloadsThisWeek: 0,
        downloadsThisMonth: 0,
        successfulDownloads: 0,
        failedDownloads: 0,
        totalPlaylistSessions: 0,
        totalPlaylistTracksDownloaded: 0,
        redownloadCount: 0,
        singleVideoCount: 0,
        playlistTrackCount: 0,
        mp3Count: 0,
        m4aCount: 0,
        dailyTrend: [],
      });
    }

    return NextResponse.json({
      supabaseConfigured: true,
      source: 'supabase',
      ...supabaseStats,
    });
  } catch (err: any) {
    console.error('Admin overview error:', err);
    return NextResponse.json({ error: 'Failed to retrieve overview statistics' }, { status: 500 });
  }
}
