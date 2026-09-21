import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
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

export function resolveFfmpegBinary(): string | null {
  // 1. Direct path check if ffmpegPath is already valid on disk
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  const isWin = process.platform === 'win32';
  const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  // 2. Resolve relative to process.cwd() (handles Next.js Turbopack / Webpack \ROOT\ mock)
  const candidatePaths = [
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', binaryName),
    typeof ffmpegPath === 'string'
      ? ffmpegPath.replace(/^[\\/]ROOT[\\/]/, `${process.cwd()}${path.sep}`).replace(/^[\\/]ROOT/, process.cwd())
      : '',
    path.join(process.cwd(), '.next', 'server', 'node_modules', 'ffmpeg-static', binaryName),
    path.join('/var/task', 'node_modules', 'ffmpeg-static', binaryName),
    path.join(os.tmpdir(), binaryName),
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      return candidate;
    }
  }

  return null;
}

export interface FfmpegHealth {
  resolved: boolean;
  pathExists: boolean;
  versionOk: boolean;
  binaryPath?: string;
  error?: string;
}

/**
 * Validates the bundled static FFmpeg binary and performs an execution health check.
 * Logs exact diagnostic flags:
 * FFmpeg resolved: true/false
 * FFmpeg path exists: true/false
 */
export function checkFfmpegHealth(): FfmpegHealth {
  const binary = resolveFfmpegBinary();
  const resolved = Boolean(binary);
  const pathExists = Boolean(binary && fs.existsSync(/*turbopackIgnore: true*/ binary));

  console.log(`FFmpeg resolved: ${resolved}`);
  console.log(`FFmpeg path exists: ${pathExists}`);

  if (!resolved || !pathExists || !binary) {
    console.error('FFMPEG_BINARY_MISSING');
    return { resolved, pathExists, versionOk: false, error: 'FFMPEG_BINARY_MISSING' };
  }

  // Ensure execution permissions on Unix/Linux
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(/*turbopackIgnore: true*/ binary, 0o755);
    } catch {}
  }

  try {
    const res = spawnSync(/*turbopackIgnore: true*/ binary, ['-version'], {
      encoding: 'utf8',
      timeout: 4000,
    });
    const versionOk = res.status === 0;
    if (!versionOk) {
      console.error('FFMPEG_BINARY_MISSING: version check returned non-zero code', res.status);
      return { resolved, pathExists, versionOk: false, binaryPath: binary, error: 'FFMPEG_BINARY_MISSING' };
    }
    return { resolved, pathExists, versionOk: true, binaryPath: binary };
  } catch (err: any) {
    console.error('FFMPEG_BINARY_MISSING: spawn failed', err?.message);
    return { resolved, pathExists, versionOk: false, binaryPath: binary, error: 'FFMPEG_BINARY_MISSING' };
  }
}

/**
 * Resolves the bundled ffmpeg-static binary path.
 */
export function getFfmpegPath(): string {
  const health = checkFfmpegHealth();
  if (!health.versionOk || !health.binaryPath) {
    throw new Error('FFMPEG_BINARY_MISSING');
  }
  return health.binaryPath;
}

/**
 * Checks whether the bundled FFmpeg binary is accessible and executable.
 */
export function isFfmpegAvailable(): Promise<boolean> {
  const health = checkFfmpegHealth();
  return Promise.resolve(health.versionOk);
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
 * Convert audio or video input file to target audio format using bundled FFmpeg.
 * All arguments are passed as an array to prevent command injection.
 */
export function convertAudio(options: ConvertOptions): Promise<{ outputPath: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const { inputPath, outputPath, format, quality, metadata, onProgress } = options;

    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    let bin: string;
    try {
      bin = getFfmpegPath();
    } catch (err: any) {
      return reject(err);
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
        args.push(
          '-map', '0:a:0',
          '-map', '1:0',
          '-c:v', 'copy',
          '-id3v2_version', '3',
          '-metadata:s:v', 'title="Album cover"',
          '-metadata:s:v', 'comment="Cover (front)"'
        );
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

    const proc = spawn(/*turbopackIgnore: true*/ bin, args);

    let errorLog = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorLog += text;

      // Simple time progression parsing if duration is present
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (timeMatch && onProgress) {
        const hours = parseFloat(timeMatch[1]);
        const minutes = parseFloat(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentSeconds = hours * 3600 + minutes * 60 + seconds;
        if (currentSeconds > 0) {
          onProgress(Math.min(95, Math.floor(currentSeconds * 5)));
        }
      }
    });

    proc.on('error', (err) => {
      console.error('[ffmpeg] spawn error:', err);
      reject(new Error(`FFmpeg process failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[ffmpeg] process exited with code', code, 'stderr:', errorLog.slice(-500));
        return reject(new Error(`FFmpeg conversion failed (code ${code})`));
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
