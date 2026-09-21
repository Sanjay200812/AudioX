import { NextRequest, NextResponse } from 'next/server';
import { recordSupabaseVisitor } from '@/lib/supabase/server';
import { upsertVisitor } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { visitorId, deviceType, browser } = body;

    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 32) {
      return NextResponse.json({ error: 'Invalid visitor ID' }, { status: 400 });
    }

    const cleanVisitorId = visitorId.trim();
    const cleanDevice = typeof deviceType === 'string' ? deviceType.slice(0, 32) : 'Desktop';
    const cleanBrowser = typeof browser === 'string' ? browser.slice(0, 32) : 'Browser';

    // 1. Record to Supabase (primary)
    recordSupabaseVisitor({
      visitorId: cleanVisitorId,
      deviceType: cleanDevice,
      browser: cleanBrowser,
    }).catch(() => {});

    // 2. Also record to local fallback database
    try {
      upsertVisitor({
        visitorId: cleanVisitorId,
        deviceType: cleanDevice,
        browser: cleanBrowser,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Visit analytics endpoint error:', err);
    return NextResponse.json({ success: true }); // Always non-blocking
  }
}
