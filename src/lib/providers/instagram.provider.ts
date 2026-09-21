import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { IMediaProvider, PreparedMedia, ProviderAnalysisResult } from './types';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export class InstagramProvider implements IMediaProvider {
  name = 'Instagram';

  canHandle(urlOrPath: string): boolean {
    if (!urlOrPath) return false;
    const lower = urlOrPath.toLowerCase();
    return lower.includes('instagram.com/reel/') || lower.includes('instagram.com/p/') || lower.includes('instagram.com/reels/');
  }

  async analyze(url: string): Promise<ProviderAnalysisResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m',
        'yt_dlp',
        '--dump-single-json',
        '--skip-download',
        '--no-playlist',
        url,
      ];

      const proc = spawn('python', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('error', (err) => {
        reject(new Error(`Python or yt-dlp failed to execute: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(this.getInstagramErrorMessage(stderr)));
        }

        try {
          const data = JSON.parse(stdout);
          const duration = Math.round(data.duration || 0);

          resolve({
            type: 'single',
            source: 'instagram',
            single: {
              id: data.id || 'ig-post',
              url: data.webpage_url || url,
              title: data.title || (data.description ? data.description.slice(0, 60) : 'Instagram Audio'),
              author: data.uploader || data.channel || 'Instagram User',
              duration,
              durationFormatted: formatDuration(duration),
              thumbnail: data.thumbnail || '',
              source: 'instagram',
              estimatedSizeMp3: '~2.5 MB',
              estimatedSizeM4a: '~2.5 MB',
              isPlaylist: false,
            },
          });
        } catch {
          reject(new Error(this.getInstagramErrorMessage(stderr)));
        }
      });
    });
  }

  async prepareMedia(
    url: string,
    outputDir: string,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<PreparedMedia> {
    onProgress?.('Fetching Instagram media', 15);

    return new Promise((resolve, reject) => {
      const outputTemplate = path.join(outputDir, 'source.%(ext)s');
      const thumbnailTemplate = path.join(outputDir, 'cover.%(ext)s');

      const args = [
        '-m',
        'yt_dlp',
        '-f',
        'ba/b',
        '--no-playlist',
        '--write-thumbnail',
        '--convert-thumbnails',
        'jpg',
        '-o',
        outputTemplate,
        '-o',
        `thumbnail:${thumbnailTemplate}`,
        url,
      ];

      const proc = spawn('python', args);
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const match = text.match(/\[download\]\s+([\d\.]+)%/);
        if (match && onProgress) {
          const pct = Math.min(85, Math.floor(parseFloat(match[1]) * 0.8));
          onProgress('Downloading Instagram audio', pct);
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Media fetcher failed to start: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(this.getInstagramErrorMessage(stderr)));
        }

        const files = fs.readdirSync(outputDir);
        const sourceFile = files.find(
          (f) => f.startsWith('source.') && !f.endsWith('.tmp') && !f.endsWith('.part')
        );

        if (!sourceFile) {
          return reject(new Error('Unable to extract Instagram audio track.'));
        }

        const coverFile = files.find((f) => f.startsWith('cover.') && (f.endsWith('.jpg') || f.endsWith('.png')));

        resolve({
          sourceFilePath: path.join(outputDir, sourceFile),
          title: 'Instagram Audio',
          coverPath: coverFile ? path.join(outputDir, coverFile) : undefined,
        });
      });
    });
  }

  private getInstagramErrorMessage(stderr: string): string {
    return 'Unable to access this media. Possible reasons: private account, login required, unavailable post, geographic restriction, or unsupported media format.';
  }
}
