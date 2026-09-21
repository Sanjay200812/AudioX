import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AudioFormat, AudioQuality } from '../types';

export interface MetadataOptions {
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
  year?: string;
  coverPath?: string;
}

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  format: AudioFormat;
  quality: AudioQuality;
  metadata?: MetadataOptions;
  onProgress?: (progressPercent: number) => void;
}

export function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

function mapBitrate(quality: AudioQuality): string {
  switch (quality) {
    case 'standard':
      return '128k';
    case 'high':
      return '192k';
    case 'best':
      return '320k';
    default:
      return quality || '192k';
  }
}

/**
 * Convert audio or video input file to target audio format using FFmpeg.
 * All arguments are passed as an array to prevent command injection.
 */
export function convertAudio(options: ConvertOptions): Promise<{ outputPath: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const { inputPath, outputPath, format, quality, metadata, onProgress } = options;

    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    const bitrate = mapBitrate(quality);
    const args: string[] = ['-y', '-i', inputPath];

    // If artwork cover provided and output is MP3, attach cover
    let hasCover = false;
    if (metadata?.coverPath && fs.existsSync(metadata.coverPath) && format === 'mp3') {
      args.push('-i', metadata.coverPath);
      hasCover = true;
    }

    // Audio codec & bitrate selection
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
      if (hasCover) {
        args.push('-map', '0:a:0', '-map', '1:0', '-c:v', 'copy', '-id3v2_version', '3', '-metadata:s:v', 'title="Album cover"', '-metadata:s:v', 'comment="Cover (front)"');
      }
    } else {
      // m4a / aac
      args.push('-c:a', 'aac', '-b:a', bitrate);
    }

    // Attach metadata tags
    if (metadata?.title) {
      args.push('-metadata', `title=${metadata.title}`);
    }
    if (metadata?.artist) {
      args.push('-metadata', `artist=${metadata.artist}`);
    }
    if (metadata?.album) {
      args.push('-metadata', `album=${metadata.album}`);
    }
    if (metadata?.track !== undefined) {
      args.push('-metadata', `track=${metadata.track}`);
    }
    if (metadata?.year) {
      args.push('-metadata', `date=${metadata.year}`);
    }

    args.push(outputPath);

    const proc = spawn('ffmpeg', args);

    let errorLog = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorLog += text;

      // Simple time progression parsing if duration is present
      // Example ffmpeg output: time=00:01:23.45
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (timeMatch && onProgress) {
        const hours = parseFloat(timeMatch[1]);
        const minutes = parseFloat(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentSeconds = hours * 3600 + minutes * 60 + seconds;
        // If we know estimated duration, could compute percentage, else invoke callback
        if (currentSeconds > 0) {
          onProgress(Math.min(95, Math.floor(currentSeconds * 5))); // progressive estimate
        }
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg process failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg conversion failed (code ${code}): ${errorLog.slice(-500)}`));
      }

      if (!fs.existsSync(outputPath)) {
        return reject(new Error('FFmpeg completed but output file was not produced.'));
      }

      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        return reject(new Error('Produced audio file is empty.'));
      }

      resolve({
        outputPath,
        fileSize: stats.size,
      });
    });
  });
}
