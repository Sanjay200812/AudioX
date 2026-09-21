import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedAdmin } from '@/lib/security/admin';
import { getSupabaseVisitorDetails, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAuthenticatedAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Visitor ID required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase analytics is not configured' }, { status: 503 });
    }

    const details = await getSupabaseVisitorDetails(id);
    if (!details) {
      return NextResponse.json({ error: 'Visitor not found' }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (err: any) {
    console.error('Admin visitor details error:', err);
    return NextResponse.json({ error: 'Failed to fetch visitor details' }, { status: 500 });
  }
}
