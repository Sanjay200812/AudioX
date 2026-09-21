import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { getSupabasePlaylists, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        configured: false,
        error: 'Supabase analytics is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in environment variables.',
        playlists: [],
        total: 0,
      });
    }

    const result = await getSupabasePlaylists(limit, offset);
    if (!result) {
      return NextResponse.json({
        configured: true,
        error: 'Failed to fetch playlist analytics from Supabase.',
        playlists: [],
        total: 0,
      });
    }

    return NextResponse.json({
      ...result,
    });
  } catch (err: any) {
    console.error('Admin playlists route error:', err);
    return NextResponse.json({ error: 'Failed to fetch playlist analytics' }, { status: 500 });
  }
}
