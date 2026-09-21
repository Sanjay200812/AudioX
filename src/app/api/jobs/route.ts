import { NextRequest, NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';
import { AudioFormat, AudioQuality, MediaSource } from '@/lib/types';

export async function GET() {
  const jobs = queueEngine.getJobs();
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      source,
      sourceUrl,
      mediaId,
      playlistId,
      playlistIndex,
      playlistTitle,
      title,
      artist,
      thumbnail,
      duration,
      format = 'mp3',
      quality = 'high',
    } = body;

    if (!sourceUrl || !title) {
      return NextResponse.json({ error: 'sourceUrl and title are required.' }, { status: 400 });
    }

    const validFormats: AudioFormat[] = ['mp3', 'm4a'];
    const validQualities: AudioQuality[] = ['standard', 'high', 'best', '128k', '192k', '256k', '320k'];

    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: 'Invalid audio format. Must be mp3 or m4a.' }, { status: 400 });
    }

    if (!validQualities.includes(quality)) {
      return NextResponse.json({ error: 'Invalid audio quality.' }, { status: 400 });
    }

    const job = queueEngine.createJob({
      source: (source as MediaSource) || 'youtube',
      sourceUrl,
      mediaId: mediaId || 'media',
      playlistId,
      playlistIndex,
      playlistTitle,
      title,
      artist,
      thumbnail,
      duration,
      format,
      quality,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err: any) {
    console.error('Job creation error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create job.' }, { status: 500 });
  }
}
