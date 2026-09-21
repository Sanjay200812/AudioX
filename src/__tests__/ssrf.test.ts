import { describe, it, expect } from 'vitest';
import { validateMediaUrl } from '../lib/security/ssrf';

describe('SSRF & URL Security Validator (YouTube V1)', () => {
  it('rejects invalid or empty inputs', () => {
    expect(validateMediaUrl('').isValid).toBe(false);
    expect(validateMediaUrl('not-a-url').isValid).toBe(false);
  });

  it('rejects non-http/https protocols', () => {
    expect(validateMediaUrl('file:///etc/passwd').isValid).toBe(false);
    expect(validateMediaUrl('ftp://example.com/audio.mp3').isValid).toBe(false);
    expect(validateMediaUrl('javascript:alert(1)').isValid).toBe(false);
  });

  it('rejects localhost, private IP spaces, and link-local metadata endpoints', () => {
    expect(validateMediaUrl('http://localhost/watch?v=123').isValid).toBe(false);
    expect(validateMediaUrl('http://127.0.0.1:8000').isValid).toBe(false);
    expect(validateMediaUrl('http://192.168.1.1/video').isValid).toBe(false);
    expect(validateMediaUrl('http://10.0.0.1/video').isValid).toBe(false);
    expect(validateMediaUrl('http://172.16.0.1/video').isValid).toBe(false);
    expect(validateMediaUrl('http://169.254.169.254/latest/meta-data/').isValid).toBe(false);
  });

  it('rejects unsupported domains (including postponed platforms)', () => {
    expect(validateMediaUrl('https://evil.com/video').isValid).toBe(false);
    expect(validateMediaUrl('https://google.com').isValid).toBe(false);
    expect(validateMediaUrl('https://www.instagram.com/reel/C123/').isValid).toBe(false);
  });

  it('accepts valid YouTube single video URLs', () => {
    const res1 = validateMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res1.isValid).toBe(true);
    expect(res1.source).toBe('youtube');
    expect(res1.isPlaylist).toBe(false);

    const res2 = validateMediaUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(res2.isValid).toBe(true);
    expect(res2.source).toBe('youtube');
  });

  it('accepts YouTube Shorts URLs', () => {
    const res = validateMediaUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(res.isValid).toBe(true);
    expect(res.source).toBe('youtube');
    expect(res.isPlaylist).toBe(false);
  });

  it('detects YouTube direct playlist URLs', () => {
    const res = validateMediaUrl('https://www.youtube.com/playlist?list=PL123456789');
    expect(res.isValid).toBe(true);
    expect(res.source).toBe('youtube_playlist');
    expect(res.isPlaylist).toBe(true);
  });

  it('detects YouTube video with playlist parameter (hasPlaylistParam)', () => {
    const res = validateMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123456789');
    expect(res.isValid).toBe(true);
    expect(res.source).toBe('youtube');
    expect(res.isPlaylist).toBe(false);
    expect(res.hasPlaylistParam).toBe(true);
    expect(res.playlistId).toBe('PL123456789');
  });
});
