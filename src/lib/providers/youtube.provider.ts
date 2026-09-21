import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { IMediaProvider, PreparedMedia, ProviderAnalysisResult } from './types';
import { PlaylistTrack } from '../types';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function estimateAudioSize(seconds: number, bitrateKbps: number): string {
  if (!seconds) return '—';
  const bytes = (seconds * bitrateKbps * 1000) / 8;
  const mb = bytes / (1024 * 1024);
  return `~${mb.toFixed(1)} MB`;
}

export class YouTubeProvider implements IMediaProvider {
  name = 'YouTube';

  canHandle(urlOrPath: string): boolean {
    if (!urlOrPath) return false;
    const lower = urlOrPath.toLowerCase();
    return (
      lower.includes('youtube.com/') ||
      lower.includes('youtu.be/') ||
      lower.includes('music.youtube.com/')
    );
  }

  async analyze(url: string, forcePlaylist = false): Promise<ProviderAnalysisResult> {
    const isDirectPlaylist = url.includes('/playlist') && url.includes('list=');
    const isVideoWithPlaylist = (url.includes('watch?v=') || url.includes('youtu.be/')) && url.includes('list=');

    // If explicit /playlist URL, extract playlist
    if (isDirectPlaylist) {
      return this.extractPlaylistMetadata(url);
    }

    // If video with playlist parameter, extract playlist as primary, with single video metadata attached
    if (isVideoWithPlaylist) {
      try {
        const [playlistRes, singleRes] = await Promise.all([
          this.extractPlaylistMetadata(url),
          this.extractSingleMetadata(url).catch(() => null),
        ]);

        return {
          type: 'playlist',
          source: 'youtube_playlist',
          playlist: playlistRes.playlist,
          single: singleRes?.single,
        };
      } catch {
        // Fallback to single video if playlist extraction fails
        const singleResult = await this.extractSingleMetadata(url);
        return singleResult;
      }
    }

    // Normal single video
    return this.extractSingleMetadata(url);
  }

  private async extractSingleMetadata(url: string): Promise<ProviderAnalysisResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m',
        'yt_dlp',
        '--dump-single-json',
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=web,default',
        url,
      ];

      const proc = spawn('python', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(this.cleanErrorMessage(stderr) || 'Could not access YouTube media.'));
        }

        try {
          const data = JSON.parse(stdout);

          // Check for live stream
          if (data.is_live || data.live_status === 'is_live') {
            return reject(new Error('Live streams are not supported in AudioX V1.'));
          }

          const duration = Math.round(data.duration || 0);

          resolve({
            type: 'single',
            source: 'youtube',
            single: {
              id: data.id || 'video',
              url: data.webpage_url || url,
              title: data.title || 'Unknown Title',
              author: data.uploader || data.channel || 'Unknown Creator',
              duration,
              durationFormatted: formatDuration(duration),
              thumbnail: data.thumbnail || '',
              source: 'youtube',
              estimatedSizeMp3: estimateAudioSize(duration, 192),
              estimatedSizeM4a: estimateAudioSize(duration, 192),
              isPlaylist: false,
            },
          });
        } catch {
          reject(new Error('Failed to parse YouTube metadata.'));
        }
      });
    });
  }

  public async extractPlaylistMetadata(url: string): Promise<ProviderAnalysisResult> {
    let targetUrl = url;
    try {
      const parsed = new URL(url);
      const listId = parsed.searchParams.get('list');
      if (listId) {
        targetUrl = `https://www.youtube.com/playlist?list=${listId}`;
      }
    } catch {}

    return new Promise((resolve, reject) => {
      const args = [
        '-m',
        'yt_dlp',
        '--dump-single-json',
        '--flat-playlist',
        '--skip-download',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=web,default',
        targetUrl,
      ];

      const proc = spawn('python', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(this.cleanErrorMessage(stderr) || 'Could not access YouTube playlist.'));
        }

        try {
          const data = JSON.parse(stdout);
          const entries = Array.isArray(data.entries) ? data.entries : [];
          let totalDuration = 0;

          const tracks: PlaylistTrack[] = entries.map((item: any, idx: number) => {
            const dur = Math.round(item.duration || 0);
            if (dur > 0) {
              totalDuration += dur;
            }
            const title = item.title || `Track ${idx + 1}`;
            const isUnavailable =
              !item.id ||
              title === '[Deleted video]' ||
              title === '[Private video]' ||
              title === '[Unavailable video]' ||
              item.is_unavailable === true;

            return {
              index: idx + 1,
              id: item.id || `track-${idx + 1}`,
              url: item.url
                ? (item.url.startsWith('http') ? item.url : `https://www.youtube.com/watch?v=${item.id}`)
                : `https://www.youtube.com/watch?v=${item.id}`,
              title,
              duration: dur,
              durationFormatted: formatDuration(dur),
              thumbnail: item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url) || '',
              author: item.uploader || item.channel || data.uploader || '',
              isAvailable: !isUnavailable,
            };
          });

          const availableTrackCount = tracks.filter((t) => t.isAvailable).length;

          resolve({
            type: 'playlist',
            source: 'youtube_playlist',
            playlist: {
              id: data.id || 'playlist',
              url: data.webpage_url || url,
              title: data.title || 'YouTube Playlist',
              author: data.uploader || data.channel || 'Unknown Creator',
              trackCount: tracks.length,
              availableTrackCount,
              totalDuration,
              totalDurationFormatted: formatDuration(totalDuration),
              thumbnail: data.thumbnail || (tracks[0]?.thumbnail) || '',
              tracks,
            },
          });
        } catch {
          reject(new Error('Failed to parse YouTube playlist metadata.'));
        }
      });
    });
  }

  async prepareMedia(
    url: string,
    outputDir: string,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<PreparedMedia> {
    onProgress?.('Fetching media stream', 10);

    return new Promise((resolve, reject) => {
      const outputTemplate = path.join(outputDir, 'source.%(ext)s');
      const thumbnailTemplate = path.join(outputDir, 'cover.%(ext)s');

      const args = [
        '-m',
        'yt_dlp',
        '-f',
        'ba/b',
        '--no-playlist',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,web',
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
          onProgress('Downloading source stream', pct);
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(this.cleanErrorMessage(stderr) || 'Failed to download YouTube audio stream.'));
        }

        const files = fs.readdirSync(outputDir);
        const sourceFile = files.find(
          (f) => f.startsWith('source.') && !f.endsWith('.tmp') && !f.endsWith('.part')
        );

        if (!sourceFile) {
          return reject(new Error('Source media file was not downloaded.'));
        }

        const coverFile = files.find(
          (f) => f.startsWith('cover.') && (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp'))
        );

        resolve({
          sourceFilePath: path.join(outputDir, sourceFile),
          title: 'YouTube Audio',
          coverPath: coverFile ? path.join(outputDir, coverFile) : undefined,
        });
      });
    });
  }

  private cleanErrorMessage(raw: string): string {
    if (!raw) return '';
    if (raw.includes('is a live stream') || raw.includes('live stream')) {
      return 'Live streams are not supported in AudioX V1.';
    }
    if (raw.includes('Private video')) return 'This YouTube video is private.';
    if (raw.includes('Sign in to confirm your age')) return 'This video requires age confirmation / sign-in.';
    if (raw.includes('Video unavailable')) return 'This video is unavailable.';
    if (raw.includes('This playlist is private')) return 'This YouTube playlist is private.';
    if (raw.includes('The playlist does not exist')) return 'This YouTube playlist is unavailable.';
    if (raw.includes('geographic restriction')) return 'This media has geographic restrictions.';
    const lines = raw.split('\n').filter((l) => l.startsWith('ERROR:'));
    return lines.length > 0 ? lines[0].replace('ERROR:', '').trim() : raw.slice(-200).trim();
  }
}
