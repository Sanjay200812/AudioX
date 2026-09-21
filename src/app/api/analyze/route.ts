import { NextRequest, NextResponse } from 'next/server';
import { validateMediaUrl } from '@/lib/security/ssrf';
import { getProvider } from '@/lib/providers/registry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, forcePlaylist } = body;

    if (!url) {
      return NextResponse.json({ error: 'Please enter a YouTube URL to analyze.' }, { status: 400 });
    }

    const validation = validateMediaUrl(url);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error || 'Invalid or unsupported URL.' }, { status: 400 });
    }

    const provider = getProvider(validation.sanitizedUrl || url);

    // If provider is YouTubeProvider, pass forcePlaylist flag
    const result = (provider as any).analyze(
      validation.sanitizedUrl || url,
      !!forcePlaylist
    );

    const resolved = await result;

    return NextResponse.json(resolved);
  } catch (err: any) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to analyze media link. Please verify URL is accessible.' },
      { status: 500 }
    );
  }
}
