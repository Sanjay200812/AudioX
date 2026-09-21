import { NextRequest, NextResponse } from 'next/server';
import { validateMediaUrl } from '@/lib/security/ssrf';
import { getProvider } from '@/lib/providers/registry';
import { analysisCache } from '@/lib/cache/analysis.cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[analyze:start] started at ${new Date().toISOString()}`);

  try {
    const body = await req.json();
    const { url, forcePlaylist } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Please enter a YouTube URL to analyze.' },
        { status: 400 }
      );
    }

    // 1. Stage: url-validation
    const tValStart = Date.now();
    const validation = validateMediaUrl(url);
    const valElapsed = Date.now() - tValStart;
    console.log(`[url-validation] completed in ${valElapsed}ms (valid: ${validation.isValid})`);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid or unsupported URL.' },
        { status: 400 }
      );
    }

    const sanitizedUrl = validation.sanitizedUrl || url.trim();

    // 2. Cache Check (Fast Return)
    const cacheKey = validation.playlistId || validation.sanitizedUrl || url.trim();
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult) {
      const cachedElapsed = Date.now() - startTime;
      console.log(`[analyze:cache-hit] returned cached metadata in ${cachedElapsed}ms`);
      return NextResponse.json({
        ...cachedResult,
        cached: true,
        supportedOutputOptions: ['mp3', 'm4a'],
        timingMs: cachedElapsed,
      });
    }

    // 3. Stage: playlist-detection
    const tDetectStart = Date.now();
    const isPlaylist = Boolean(validation.isPlaylist || validation.hasPlaylistParam);
    const detectElapsed = Date.now() - tDetectStart;
    console.log(
      `[playlist-detection] completed in ${detectElapsed}ms (isPlaylist: ${validation.isPlaylist}, hasPlaylistParam: ${validation.hasPlaylistParam})`
    );

    // 4. Stage: youtube-metadata:start & end
    const tMetaStart = Date.now();
    console.log(`[youtube-metadata:start] extracting metadata`);

    const provider = getProvider(sanitizedUrl);
    const result = await (provider as any).analyze(sanitizedUrl, !!forcePlaylist);

    const metaElapsed = Date.now() - tMetaStart;
    console.log(`[youtube-metadata:end] completed in ${metaElapsed}ms`);

    // Cache the analysis metadata
    analysisCache.set(cacheKey, result);
    if (result.single?.id) {
      analysisCache.set(result.single.id, result);
    }
    if (result.playlist?.id) {
      analysisCache.set(result.playlist.id, result);
    }

    // 5. Stage: analyze:end
    const totalElapsed = Date.now() - startTime;
    console.log(`[analyze:end] total duration: ${totalElapsed}ms`);

    return NextResponse.json({
      ...result,
      supportedOutputOptions: ['mp3', 'm4a'],
      timingMs: totalElapsed,
    });
  } catch (err: any) {
    const totalElapsed = Date.now() - startTime;
    console.error(`[analyze:end] failed after ${totalElapsed}ms:`, err?.message || err);
    return NextResponse.json(
      { error: err.message || 'Failed to analyze YouTube media. Please verify URL is accessible.' },
      { status: 500 }
    );
  }
}
