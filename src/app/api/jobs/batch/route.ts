import { NextRequest, NextResponse } from 'next/server';
import { queueEngine } from '@/lib/queue/queue.engine';
import { AudioFormat, AudioQuality } from '@/lib/types';

/**
 * Batch Playlist Job Creation.
 * STRICT POLICY: NEVER create ZIP archives.
 * Each track in the batch is enqueued as an independent single-track job in selected order.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tracks,
      playlistId,
      playlistTitle,
      format = 'mp3',
      quality = 'high',
    } = body;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: 'Tracks array is required.' }, { status: 400 });
    }

    const validFormats: AudioFormat[] = ['mp3', 'm4a'];
    const validQualities: AudioQuality[] = ['standard', 'high', 'best', '128k', '192k', '256k', '320k'];

    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: 'Invalid audio format.' }, { status: 400 });
    }

    if (!validQualities.includes(quality)) {
      return NextResponse.json({ error: 'Invalid audio quality.' }, { status: 400 });
    }

    const jobInputs = tracks.map((track: any, idx: number) => ({
      source: 'youtube_playlist' as const,
      sourceUrl: track.url,
      mediaId: track.id,
      playlistId,
      playlistIndex: track.index || idx + 1,
      playlistTitle,
      title: track.title,
      artist: track.author,
      thumbnail: track.thumbnail,
      duration: track.duration,
    }));

    // Creates independent individual jobs in strict sequence
    const createdJobs = queueEngine.createBatchJobs(jobInputs, format, quality);

    return NextResponse.json({
      message: `${createdJobs.length} tracks added to queue.`,
      jobs: createdJobs,
    });
  } catch (err: any) {
    console.error('Batch jobs creation error:', err);
    return NextResponse.json({ error: err.message || 'Failed to queue batch.' }, { status: 500 });
  }
}
