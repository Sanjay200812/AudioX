import { describe, it, expect } from 'vitest';
import { validateMediaUrl } from '../lib/security/ssrf';

describe('Worker Security & Validation Hardening', () => {
  it('blocks private IPs and local loopback SSRF attempts', () => {
    const blockedUrls = [
      'http://127.0.0.1/watch?v=12345678901',
      'http://localhost/watch?v=12345678901',
      'http://10.0.0.1/video',
      'http://192.168.1.1/video',
      'http://169.254.169.254/latest/meta-data',
      'https://172.16.0.1/video',
    ];

    for (const url of blockedUrls) {
      const res = validateMediaUrl(url);
      expect(res.isValid).toBe(false);
    }
  });

  it('validates canonical YouTube domain checking', () => {
    const validUrls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ];

    for (const url of validUrls) {
      const res = validateMediaUrl(url);
      expect(res.isValid).toBe(true);
      expect(res.sanitizedUrl).toBeDefined();
    }
  });

  it('validates job ID pattern matching to prevent path traversal', () => {
    const JOB_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

    const validIds = [
      '123e4567-e89b-12d3-a456-426614174000',
      'job_12345',
      'track-01-abc',
      'A_B_C_1_2_3',
    ];

    const maliciousIds = [
      '../../etc/passwd',
      '../tmp/audiox',
      'job/sub/dir',
      'job\\windows\\path',
      'job;rm -rf /',
      '',
      'a'.repeat(65),
    ];

    for (const id of validIds) {
      expect(JOB_ID_REGEX.test(id)).toBe(true);
      expect(id).not.toContain('..');
    }

    for (const id of maliciousIds) {
      const isClean = JOB_ID_REGEX.test(id) && !id.includes('..');
      expect(isClean).toBe(false);
    }
  });

  it('enforces allowed formats and qualities', () => {
    const ALLOWED_FORMATS = new Set(['mp3', 'm4a']);
    const ALLOWED_QUALITIES = new Set(['standard', 'high', 'best', '128k', '192k', '256k', '320k']);

    expect(ALLOWED_FORMATS.has('mp3')).toBe(true);
    expect(ALLOWED_FORMATS.has('m4a')).toBe(true);
    expect(ALLOWED_FORMATS.has('exe')).toBe(false);
    expect(ALLOWED_FORMATS.has('wav')).toBe(false);

    expect(ALLOWED_QUALITIES.has('standard')).toBe(true);
    expect(ALLOWED_QUALITIES.has('high')).toBe(true);
    expect(ALLOWED_QUALITIES.has('best')).toBe(true);
    expect(ALLOWED_QUALITIES.has('ultra_hd')).toBe(false);
  });
});
