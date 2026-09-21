import path from 'path';
import fs from 'fs';
import { IMediaProvider, PreparedMedia, ProviderAnalysisResult } from './types';
import { spawn } from 'child_process';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export class LocalProvider implements IMediaProvider {
  name = 'LocalFile';

  canHandle(urlOrPath: string): boolean {
    if (!urlOrPath) return false;
    return urlOrPath.startsWith('local://') || fs.existsSync(urlOrPath);
  }

  async analyze(filePath: string): Promise<ProviderAnalysisResult> {
    const cleanPath = filePath.replace('local://', '');
    if (!fs.existsSync(cleanPath)) {
      throw new Error('Local file does not exist.');
    }

    const stats = fs.statSync(cleanPath);
    const fileName = path.basename(cleanPath);
    const ext = path.extname(cleanPath).replace('.', '').toUpperCase();

    // Probe duration using ffprobe
    const duration = await this.probeDuration(cleanPath);

    return {
      type: 'single',
      source: 'local',
      single: {
        id: `local-${Date.now()}`,
        url: `local://${cleanPath}`,
        title: path.parse(fileName).name,
        author: 'Local File',
        duration,
        durationFormatted: formatDuration(duration),
        thumbnail: '',
        source: 'local',
        estimatedSizeMp3: `~${((stats.size * 0.4) / (1024 * 1024)).toFixed(1)} MB`,
        estimatedSizeM4a: `~${((stats.size * 0.4) / (1024 * 1024)).toFixed(1)} MB`,
        isPlaylist: false,
      },
    };
  }

  async prepareMedia(
    filePath: string,
    outputDir: string,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<PreparedMedia> {
    const cleanPath = filePath.replace('local://', '');
    if (!fs.existsSync(cleanPath)) {
      throw new Error('Local source file was not found.');
    }

    onProgress?.('Preparing local media file', 30);

    return {
      sourceFilePath: cleanPath,
      title: path.parse(cleanPath).name,
      artist: 'Local',
    };
  }

  private probeDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);

      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        const parsed = parseFloat(out.trim());
        resolve(isNaN(parsed) ? 0 : Math.round(parsed));
      });
      proc.on('error', () => resolve(0));
    });
  }
}
