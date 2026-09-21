import { describe, it, expect } from 'vitest';
import { sanitizeFileName, deduplicateFileName } from '../lib/media/sanitizer';

describe('Filename Sanitizer & Configurable Patterns', () => {
  it('sanitizes illegal Windows and Unix filesystem characters', () => {
    const raw = 'My Song / "Track" : Live * 2026? <Exclusive> | Track\\One';
    const clean = sanitizeFileName(raw, undefined, 'mp3');
    expect(clean).not.toMatch(/[\\/:*?"<>|]/);
    expect(clean).toBe('My Song Track Live 2026 Exclusive TrackOne.mp3');
  });

  it('formats filename with Artist - Title by default', () => {
    const clean = sanitizeFileName('Never Gonna Give You Up', 'Rick Astley', 'mp3', {
      format: 'artist_title',
    });
    expect(clean).toBe('Rick Astley - Never Gonna Give You Up.mp3');
  });

  it('formats filename with Title Only', () => {
    const clean = sanitizeFileName('Bohemian Rhapsody', 'Queen', 'mp3', {
      format: 'title',
    });
    expect(clean).toBe('Bohemian Rhapsody.mp3');
  });

  it('formats filename with Index - Artist - Title', () => {
    const clean = sanitizeFileName('Bohemian Rhapsody', 'Queen', 'mp3', {
      format: 'index_artist_title',
      trackIndex: 7,
    });
    expect(clean).toBe('07 - Queen - Bohemian Rhapsody.mp3');
  });

  it('formats filename with Playlist - Index - Title', () => {
    const clean = sanitizeFileName('Bohemian Rhapsody', 'Queen', 'mp3', {
      format: 'playlist_index_title',
      playlistTitle: 'Rock Classics',
      trackIndex: 7,
    });
    expect(clean).toBe('Rock Classics - 07 - Bohemian Rhapsody.mp3');
  });

  it('deduplicates existing filenames cleanly', () => {
    const existing = new Set(['Song.mp3', 'Song (2).mp3']);
    const deduped1 = deduplicateFileName('Song.mp3', existing);
    expect(deduped1).toBe('Song (3).mp3');

    const dedupedNew = deduplicateFileName('Another.mp3', existing);
    expect(dedupedNew).toBe('Another.mp3');
  });
});
