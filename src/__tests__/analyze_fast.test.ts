import { describe, it, expect, beforeEach } from 'vitest';
import { extractVideoId, extractPlaylistId } from '../lib/providers/youtube.provider';
import { analysisCache } from '../lib/cache/analysis.cache';
import { ProviderAnalysisResult } from '../lib/providers/types';

describe('Fast Analyze & Metadata Architecture', () => {
  beforeEach(() => {
    analysisCache.clear();
  });

  describe('URL & Identifier Extraction', () => {
    it('extracts video ID correctly from standard watch URLs', () => {
      const id = extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(id).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from shortened youtu.be URLs', () => {
      const id = extractVideoId('https://youtu.be/dQw4w9WgXcQ');
      expect(id).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from shorts URLs', () => {
      const id = extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(id).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID when playlist param is also attached', () => {
      const id = extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345');
      expect(id).toBe('dQw4w9WgXcQ');
    });

    it('extracts playlist ID from playlist and watch URLs', () => {
      const p1 = extractPlaylistId('https://www.youtube.com/playlist?list=PL1234567890');
      expect(p1).toBe('PL1234567890');

      const p2 = extractPlaylistId('https://www.youtube.com/watch?v=abc&list=PL9876543210');
      expect(p2).toBe('PL9876543210');
    });
  });

  describe('Analysis Metadata In-Memory Cache', () => {
    const mockResult: ProviderAnalysisResult = {
      type: 'single',
      source: 'youtube',
      single: {
        id: 'test_vid_123',
        url: 'https://www.youtube.com/watch?v=test_vid_123',
        title: 'Test Song Title',
        author: 'Test Artist',
        duration: 210,
        durationFormatted: '3:30',
        thumbnail: 'https://i.ytimg.com/vi/test_vid_123/hqdefault.jpg',
        source: 'youtube',
        estimatedSizeMp3: '~5.0 MB',
        estimatedSizeM4a: '~5.0 MB',
        isPlaylist: false,
      },
    };

    it('stores and retrieves metadata by key without latency', () => {
      analysisCache.set('test_vid_123', mockResult);
      expect(analysisCache.has('test_vid_123')).toBe(true);

      const cached = analysisCache.get('test_vid_123');
      expect(cached).toBeDefined();
      expect(cached?.single?.title).toBe('Test Song Title');
      expect(cached?.single?.duration).toBe(210);
    });

    it('returns null for expired cache entries', async () => {
      // Set with 10ms TTL
      analysisCache.set('short_lived', mockResult, 10);
      expect(analysisCache.has('short_lived')).toBe(true);

      // Wait 25ms for expiration
      await new Promise((r) => setTimeout(r, 25));
      expect(analysisCache.get('short_lived')).toBeNull();
      expect(analysisCache.has('short_lived')).toBe(false);
    });

    it('does not store raw media files or audio streams in cache', () => {
      analysisCache.set('test_vid_123', mockResult);
      const cached = analysisCache.get('test_vid_123');
      // Verify no binary buffers or file paths
      expect((cached as any)?.sourceFilePath).toBeUndefined();
      expect((cached as any)?.buffer).toBeUndefined();
    });
  });

  describe('Lightweight Output Contract', () => {
    it('ensures single metadata adheres to minimal required fields', () => {
      const sampleSingle: ProviderAnalysisResult = {
        type: 'single',
        source: 'youtube',
        single: {
          id: 'v123',
          url: 'https://yt/v123',
          title: 'Sample Track',
          author: 'Creator',
          duration: 180,
          durationFormatted: '3:00',
          thumbnail: 'https://thumb.jpg',
          source: 'youtube',
          estimatedSizeMp3: '~4.3 MB',
          estimatedSizeM4a: '~4.3 MB',
          isPlaylist: false,
        },
      };

      expect(sampleSingle.single).toHaveProperty('id');
      expect(sampleSingle.single).toHaveProperty('title');
      expect(sampleSingle.single).toHaveProperty('author');
      expect(sampleSingle.single).toHaveProperty('thumbnail');
      expect(sampleSingle.single).toHaveProperty('duration');
    });
  });

  describe('Live Performance Benchmark', () => {
    it('measures single YouTube video metadata extraction latency', async () => {
      const { YouTubeProvider } = await import('../lib/providers/youtube.provider');
      const provider = new YouTubeProvider();
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const t0 = Date.now();
      const result = await provider.analyze(testUrl);
      const elapsedMs = Date.now() - t0;

      console.log(`\n[PERFORMANCE] YouTube metadata fetched in ${elapsedMs}ms:`, {
        title: result.single?.title,
        author: result.single?.author,
        duration: result.single?.duration,
      });

      expect(result.type).toBe('single');
      expect(result.single?.title).toBeDefined();
      expect(result.single?.duration).toBeGreaterThan(0);
      // Fast target: under 4000ms even on first cold request across network
      expect(elapsedMs).toBeLessThan(4500);
    }, 10000);
  });
});
