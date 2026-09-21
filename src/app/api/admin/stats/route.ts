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
        error: 'Supabase analytics is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in environment variables.',
        totalVisitors: 0,
        totalDownloads: 0,
        downloadsToday: 0,
      });
    }

    const stats = await getSupabaseOverviewStats();
    if (!stats) {
      return NextResponse.json({
        configured: true,
        error: 'Failed to fetch statistics from Supabase.',
        totalVisitors: 0,
        totalDownloads: 0,
        downloadsToday: 0,
      });
    }

    return NextResponse.json(stats);
  } catch (err: any) {
    console.error('Admin stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}
