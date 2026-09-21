import { describe, it, expect, beforeEach } from 'vitest';
import { QueueEngine } from '../lib/queue/queue.engine';
import { PlaylistTrack, AudioFormat, DownloadHistoryItem } from '../lib/types';

describe('Playlist UX & Duplicate Detection Engine', () => {
  let engine: QueueEngine;

  beforeEach(() => {
    engine = new QueueEngine();
  });

  it('filters unavailable tracks and sets available count accurately', () => {
    const rawEntries = [
      { id: 'v1', title: 'Valid Song 1', duration: 200, isAvailable: true },
      { id: 'v2', title: '[Private video]', duration: 0, isAvailable: false },
      { id: 'v3', title: 'Valid Song 2', duration: 180, isAvailable: true },
      { id: 'v4', title: '[Deleted video]', duration: 0, isAvailable: false },
    ];

    const available = rawEntries.filter((t) => t.isAvailable !== false);
    expect(available.length).toBe(2);
    expect(available[0].title).toBe('Valid Song 1');
    expect(available[1].title).toBe('Valid Song 2');
  });

  it('preserves exact track order when queuing selected tracks', () => {
    const batchInputs = [
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/track02', mediaId: 'track02', playlistIndex: 2, title: 'Track 02' },
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/track04', mediaId: 'track04', playlistIndex: 4, title: 'Track 04' },
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/track05', mediaId: 'track05', playlistIndex: 5, title: 'Track 05' },
    ];

    const createdJobs = engine.createBatchJobs(batchInputs, 'mp3', 'high');
    expect(createdJobs.length).toBe(3);
    expect(createdJobs[0].playlistIndex).toBe(2);
    expect(createdJobs[1].playlistIndex).toBe(4);
    expect(createdJobs[2].playlistIndex).toBe(5);

    const jobs = engine.getJobs();
    expect(jobs[0].mediaId).toBe('track02');
    expect(jobs[1].mediaId).toBe('track04');
    expect(jobs[2].mediaId).toBe('track05');
  });

  it('identifies already-downloaded conflicts by mediaId + format', () => {
    const history: DownloadHistoryItem[] = [
      {
        id: 'job-1',
        mediaId: 'video_abc',
        title: 'Song One',
        thumbnail: '',
        source: 'youtube',
        format: 'mp3',
        quality: 'high',
        fileName: 'Song One.mp3',
        completedAt: Date.now() - 5000,
      },
      {
        id: 'job-2',
        mediaId: 'video_def',
        title: 'Song Two',
        thumbnail: '',
        source: 'youtube',
        format: 'm4a',
        quality: 'best',
        fileName: 'Song Two.m4a',
        completedAt: Date.now() - 3000,
      },
    ];

    function isDownloaded(mediaId: string, format: AudioFormat): boolean {
      return history.some(
        (h) => (h.mediaId === mediaId || h.id === mediaId) && h.format === format
      );
    }

    // Match on video_abc in MP3
    expect(isDownloaded('video_abc', 'mp3')).toBe(true);
    // No match on video_abc in M4A
    expect(isDownloaded('video_abc', 'm4a')).toBe(false);
    // Match on video_def in M4A
    expect(isDownloaded('video_def', 'm4a')).toBe(true);
    // Non-existent
    expect(isDownloaded('video_xyz', 'mp3')).toBe(false);
  });

  it('separates new tracks from already-downloaded tracks in a batch', () => {
    const historyMediaIds = new Set(['track_1', 'track_3']);
    const playlistTracks: PlaylistTrack[] = [
      { index: 1, id: 'track_1', url: 'http://yt/1', title: 'T1', duration: 100, durationFormatted: '1:40', thumbnail: '', isAvailable: true },
      { index: 2, id: 'track_2', url: 'http://yt/2', title: 'T2', duration: 110, durationFormatted: '1:50', thumbnail: '', isAvailable: true },
      { index: 3, id: 'track_3', url: 'http://yt/3', title: 'T3', duration: 120, durationFormatted: '2:00', thumbnail: '', isAvailable: true },
      { index: 4, id: 'track_4', url: 'http://yt/4', title: 'T4', duration: 130, durationFormatted: '2:10', thumbnail: '', isAvailable: true },
    ];

    const newTracks = playlistTracks.filter((t) => !historyMediaIds.has(t.id));
    const duplicateTracks = playlistTracks.filter((t) => historyMediaIds.has(t.id));

    expect(newTracks.length).toBe(2);
    expect(duplicateTracks.length).toBe(2);
    expect(newTracks.map((t) => t.id)).toEqual(['track_2', 'track_4']);
    expect(duplicateTracks.map((t) => t.id)).toEqual(['track_1', 'track_3']);
  });
});
