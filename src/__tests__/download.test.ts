import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerDownloadToken, getDownloadRecord, cleanJobWorkspace } from '../lib/storage/temp';

describe('Download Token & Retrieval Engine', () => {
  const testDir = path.join(os.tmpdir(), 'audiox_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const testAudioFile = path.join(testDir, 'test_song.mp3');
  fs.writeFileSync(testAudioFile, Buffer.from('FAKE_AUDIO_DATA_FOR_TESTING'));

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('generates a unique download token and verifies metadata', () => {
    const token = registerDownloadToken({
      filePath: testAudioFile,
      fileName: 'Artist - Track Name (Official).mp3',
      mimeType: 'audio/mpeg',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    const record = getDownloadRecord(token);
    expect(record).toBeDefined();
    expect(record?.fileName).toBe('Artist - Track Name (Official).mp3');
    expect(record?.mimeType).toBe('audio/mpeg');
    expect(record?.fileSize).toBe(fs.statSync(testAudioFile).size);
  });

  it('handles safe ASCII and RFC 5987 UTF-8 header encoding without crashing', () => {
    const fileName = 'Coldplay - Yellow (Official Video) [HQ] & More.mp3';
    const safeAsciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    const encodedFileName = encodeURIComponent(fileName)
      .replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/\*/g, '%2A');

    expect(safeAsciiName).not.toContain('"');
    expect(encodedFileName).not.toContain('(');
    expect(encodedFileName).not.toContain(')');

    // Ensure Uint8Array wrapping works with Response
    const buffer = fs.readFileSync(testAudioFile);
    const response = new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedFileName}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
  });

  it('returns null for non-existent or expired tokens', () => {
    const nonExistent = getDownloadRecord('non-existent-token-xyz');
    expect(nonExistent).toBeNull();
  });
});
