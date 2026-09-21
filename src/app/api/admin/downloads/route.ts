import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { getSupabaseDownloadEvents, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const range = searchParams.get('range') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        configured: false,
        error: 'Supabase analytics database not configured.',
        downloads: [],
        total: 0,
      });
    }

    const supabaseRes = await getSupabaseDownloadEvents({ range, status, search, limit, offset });
    if (!supabaseRes) {
      return NextResponse.json({
        configured: false,
        error: 'Failed to fetch downloads from Supabase database.',
        downloads: [],
        total: 0,
      });
    }

    return NextResponse.json({
      configured: true,
      downloads: supabaseRes.downloads || [],
      total: supabaseRes.total || 0,
    });
  } catch (err: any) {
    console.error('Admin downloads error:', err);
    return NextResponse.json({ error: 'Failed to fetch downloads' }, { status: 500 });
  }
}
