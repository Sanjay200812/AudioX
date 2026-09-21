import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { getSupabaseActivity, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        configured: false,
        error: 'Supabase analytics is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in environment variables.',
        activity: [],
      });
    }

    const supabaseRes = await getSupabaseActivity(limit);
    if (!supabaseRes) {
      return NextResponse.json({
        configured: true,
        error: 'Failed to fetch activity feed from Supabase.',
        activity: [],
      });
    }

    return NextResponse.json(supabaseRes);
  } catch (err: any) {
    console.error('Admin activity error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 });
  }
}
