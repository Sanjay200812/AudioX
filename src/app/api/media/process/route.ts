import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { convertAudio, checkFfmpegHealth } from '@/lib/media/ffmpeg';
import { AudioFormat, AudioQuality } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ._\-()[\]'"]/g, '').trim();
  return cleaned || 'audio_track';
}

function getRawApiUrl(req: NextRequest, targetUrl: string, targetFormat: string, videoId?: string): string {
  const query = new URLSearchParams();
  if (targetUrl) query.set('url', targetUrl);
  if (targetFormat) query.set('format', targetFormat);
  if (videoId) query.set('videoId', videoId);

  if (process.env.NODE_ENV === 'development') {
    return `http://127.0.0.1:8000/api/raw?${query.toString()}`;
  }

  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    process.env.VERCEL_URL ||
    'localhost:3000';

  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${host}/api/raw?${query.toString()}`;
}

async function handleProcessRequest(req: NextRequest, params: {
  url: string;
  videoId?: string;
  format?: string;
  quality?: string;
  title?: string;
  artist?: string;
  duration?: number;
}) {
  const { url, videoId } = params;
  if (!url && !videoId) {
    return NextResponse.json({ error: 'Media URL or videoId is required.' }, { status: 400 });
  }

  const format: AudioFormat = params.format?.toLowerCase() === 'm4a' ? 'm4a' : 'mp3';
  const quality: AudioQuality = (params.quality?.toLowerCase() as AudioQuality) || 'high';
  const customTitle = params.title;
  const customArtist = params.artist;

  // FFmpeg health verification before conversion
  if (format === 'mp3') {
    const health = checkFfmpegHealth();
    if (!health.versionOk) {
      return NextResponse.json(
        { error: 'MP3 processing is temporarily unavailable.' },
        { status: 503 }
      );
    }
  }

  const jobId = crypto.randomUUID();
  let inPath: string | null = null;
  let outPath: string | null = null;

  try {
    // 1. Resolve raw audio source from Python extractor
    const rawApiUrl = getRawApiUrl(req, url, format, videoId);
    console.log(`[media-process] Fetching raw media from extractor: ${rawApiUrl}`);

    const rawRes = await fetch(rawApiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': req.headers.get('user-agent') || 'AudioX/1.0',
        ...(req.headers.get('cookie') ? { Cookie: req.headers.get('cookie')! } : {}),
        ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
        ...(req.headers.get('x-vercel-protection-bypass')
          ? { 'x-vercel-protection-bypass': req.headers.get('x-vercel-protection-bypass')! }
          : {}),
      },
      cache: 'no-store',
    });

    if (!rawRes.ok) {
      let errorMessage = 'Unable to extract audio from source.';
      try {
        const errorJson = await rawRes.json();
        if (errorJson?.error) errorMessage = errorJson.error;
      } catch {}
      console.error(`[media-process] Extractor returned HTTP ${rawRes.status}: ${errorMessage}`);
      return NextResponse.json({ error: errorMessage }, { status: rawRes.status });
    }

    // Extract metadata from response headers
    const rawExt = (rawRes.headers.get('X-Audio-Ext') || 'm4a').toLowerCase();
    const rawTitleEncoded = rawRes.headers.get('X-Audio-Title') || '';
    const rawArtistEncoded = rawRes.headers.get('X-Audio-Artist') || '';
    const rawTitle = rawTitleEncoded ? decodeURIComponent(rawTitleEncoded) : 'Audio Track';
    const rawArtist = rawArtistEncoded ? decodeURIComponent(rawArtistEncoded) : '';

    // 2. Save raw stream to ephemeral /tmp directory
    inPath = path.join(os.tmpdir(), `audiox_in_${jobId}.${rawExt}`);
    const inBuffer = Buffer.from(await rawRes.arrayBuffer());
    fs.writeFileSync(inPath, inBuffer);

    let finalFilePath: string;
    let finalMimeType: string;

    // 3. Conversion or Direct Stream Decision
    if (format === 'm4a' && rawExt === 'm4a') {
      // Direct stream: source is already clean M4A/AAC, bypass FFmpeg transcoding!
      console.log('[media-process] Direct M4A stream selected - bypassing FFmpeg');
      finalFilePath = inPath;
      finalMimeType = 'audio/mp4';
    } else {
      // FFmpeg conversion required (for MP3 or WebM->M4A remuxing)
      outPath = path.join(os.tmpdir(), `audiox_out_${jobId}.${format}`);
      console.log(`[media-process] Converting ${rawExt} -> ${format} (${quality}) via bundled FFmpeg`);

      await convertAudio({
        inputPath: inPath,
        outputPath: outPath,
        format,
        quality,
        metadata: {
          title: customTitle || rawTitle,
          artist: customArtist || rawArtist,
        },
      });

      finalFilePath = outPath;
      finalMimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    }

    if (!fs.existsSync(/*turbopackIgnore: true*/ finalFilePath)) {
      throw new Error('Processed audio file was not generated.');
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ finalFilePath);
    const resolvedTitle = customTitle || rawTitle;
    const resolvedArtist = customArtist || rawArtist;
    const fullFileName =
      resolvedArtist && !resolvedTitle.includes(resolvedArtist)
        ? `${resolvedArtist} - ${resolvedTitle}`
        : resolvedTitle;
    const cleanName = `${sanitizeFilename(fullFileName)}.${format}`;

    const safeAsciiName = cleanName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    const encodedName = encodeURIComponent(cleanName)
      .replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/\*/g, '%2A');

    const fileStream = fs.readFileSync(/*turbopackIgnore: true*/ finalFilePath);

    return new Response(new Uint8Array(fileStream), {
      status: 200,
      headers: {
        'Content-Type': finalMimeType,
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('[media-process] Processing error:', err?.message || err, err?.cause);
    const userMessage =
      format === 'mp3'
        ? 'MP3 conversion failed. Please try again or download as M4A.'
        : 'Unable to process this track.';
    return NextResponse.json({ error: userMessage }, { status: 500 });
  } finally {
    // Immediate ephemeral cleanup: remove all temporary files
    if (inPath && fs.existsSync(inPath)) {
      try {
        fs.unlinkSync(inPath);
      } catch {}
    }
    if (outPath && fs.existsSync(outPath)) {
      try {
        fs.unlinkSync(outPath);
      } catch {}
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return handleProcessRequest(req, {
      url: body.url || body.sourceUrl,
      videoId: body.videoId || body.mediaId,
      format: body.format,
      quality: body.quality,
      title: body.title,
      artist: body.artist,
      duration: body.duration,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handleProcessRequest(req, {
    url: searchParams.get('url') || '',
    videoId: searchParams.get('videoId') || searchParams.get('mediaId') || undefined,
    format: searchParams.get('format') || undefined,
    quality: searchParams.get('quality') || undefined,
    title: searchParams.get('title') || undefined,
    artist: searchParams.get('artist') || undefined,
  });
}
