import EventEmitter from 'events';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { QueueJob, ClientQueueJob, AudioFormat, AudioQuality, MediaSource, FilenameFormat } from '../types';
import { getProvider } from '../providers/registry';
import { convertAudio } from '../media/ffmpeg';
import { createJobWorkspace, cleanJobWorkspace, registerDownloadToken } from '../storage/temp';
import { sanitizeFileName, deduplicateFileName } from '../media/sanitizer';

export interface CreateJobInput {
  source: MediaSource;
  sourceUrl: string;
  mediaId: string;
  playlistId?: string;
  playlistIndex?: number;
  playlistTitle?: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  format: AudioFormat;
  quality: AudioQuality;
  filenameFormat?: FilenameFormat;
}

export type QueueEventType =
  | 'job:queued'
  | 'job:started'
  | 'job:fetching'
  | 'job:converting'
  | 'job:progress'
  | 'job:ready'
  | 'job:completed'
  | 'job:failed'
  | 'job:skipped'
  | 'job:cancelled'
  | 'queue:updated';

export class QueueEngine extends EventEmitter {
  private jobs: Map<string, QueueJob> = new Map();
  private isProcessing = false;
  private activeJobId: string | null = null;
  private existingFileNames: Set<string> = new Set();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public getJobs(): ClientQueueJob[] {
    return Array.from(this.jobs.values()).map(this.toClientJob);
  }

  public getJob(id: string): ClientQueueJob | null {
    const job = this.jobs.get(id);
    return job ? this.toClientJob(job) : null;
  }

  public createJob(input: CreateJobInput): ClientQueueJob {
    const id = crypto.randomUUID();
    const job: QueueJob = {
      id,
      source: input.source,
      sourceUrl: input.sourceUrl,
      mediaId: input.mediaId,
      playlistId: input.playlistId,
      playlistIndex: input.playlistIndex,
      playlistTitle: input.playlistTitle,
      title: input.title,
      artist: input.artist,
      thumbnail: input.thumbnail || '',
      duration: input.duration || 0,
      format: input.format,
      quality: input.quality,
      status: 'queued',
      stage: 'idle',
      progress: 0,
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.jobs.set(id, job);
    this.emitEvent('job:queued', job);
    this.emitQueueUpdate();

    // Trigger processing if idle
    this.processNext();

    return this.toClientJob(job);
  }

  public createBatchJobs(
    inputs: Array<Omit<CreateJobInput, 'format' | 'quality'>>,
    format: AudioFormat,
    quality: AudioQuality
  ): ClientQueueJob[] {
    const createdJobs: ClientQueueJob[] = [];

    for (const input of inputs) {
      const job = this.createJob({
        ...input,
        format,
        quality,
      });
      createdJobs.push(job);
    }

    return createdJobs;
  }

  public reorderJob(id: string, direction: 'up' | 'down'): boolean {
    const jobList = Array.from(this.jobs.values());
    const index = jobList.findIndex((j) => j.id === id);

    if (index === -1) return false;

    // Cannot reorder the currently active running job
    if (jobList[index].id === this.activeJobId) {
      return false;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= jobList.length) return false;

    // Cannot swap with the currently active running job
    if (jobList[targetIndex].id === this.activeJobId) return false;

    // Swap in Map
    const itemA = jobList[index];
    const itemB = jobList[targetIndex];
    jobList[index] = itemB;
    jobList[targetIndex] = itemA;

    this.jobs.clear();
    for (const j of jobList) {
      this.jobs.set(j.id, j);
    }

    this.emitQueueUpdate();
    return true;
  }

  public removeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (this.activeJobId === id) {
      this.cancelJob(id);
    }

    cleanJobWorkspace(id);
    this.jobs.delete(id);
    this.emitQueueUpdate();
    return true;
  }

  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'completed') return false;

    job.status = 'cancelled';
    job.stage = 'idle';
    this.emitEvent('job:cancelled', job);

    cleanJobWorkspace(id);

    if (this.activeJobId === id) {
      this.activeJobId = null;
      this.isProcessing = false;
      this.processNext();
    }

    this.emitQueueUpdate();
    return true;
  }

  public skipJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'completed') return false;

    job.status = 'skipped';
    job.stage = 'idle';
    this.emitEvent('job:skipped', job);

    cleanJobWorkspace(id);

    if (this.activeJobId === id) {
      this.activeJobId = null;
      this.isProcessing = false;
      this.processNext();
    }

    this.emitQueueUpdate();
    return true;
  }

  public retryJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'failed' && job.status !== 'skipped')) return false;

    if (job.retryCount >= 2) {
      return false; // Max 2 retries reached
    }

    cleanJobWorkspace(id);

    job.retryCount += 1;
    job.status = 'queued';
    job.stage = 'idle';
    job.progress = 0;
    job.error = undefined;
    job.downloadToken = undefined;

    this.emitEvent('job:queued', job);
    this.emitQueueUpdate();

    this.processNext();
    return true;
  }

  public clearPending(): void {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'queued') {
        cleanJobWorkspace(id);
        this.jobs.delete(id);
      }
    }
    this.emitQueueUpdate();
  }

  public clearAllCompleted(): void {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        this.jobs.delete(id);
      }
    }
    this.emitQueueUpdate();
  }

  public markJobCompleted(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.completedAt = Date.now();
      this.emitEvent('job:completed', job);
      this.emitQueueUpdate();
    }
  }

  /**
   * Strictly Sequential Execution Loop (Concurrency = 1)
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    // Find next queued job in FIFO order
    let nextJob: QueueJob | null = null;
    for (const job of this.jobs.values()) {
      if (job.status === 'queued') {
        nextJob = job;
        break;
      }
    }

    if (!nextJob) {
      this.activeJobId = null;
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    this.activeJobId = nextJob.id;
    nextJob.status = 'preparing';
    nextJob.stage = 'preparing';
    nextJob.startedAt = Date.now();
    nextJob.progress = 5;

    this.emitEvent('job:started', nextJob);
    this.emitQueueUpdate();

    const workspace = createJobWorkspace(nextJob.id);

    try {
      // 1. Resolve Provider
      const provider = getProvider(nextJob.sourceUrl);

      // 2. Fetch/Prepare media
      nextJob.status = 'fetching';
      nextJob.stage = 'fetching';
      nextJob.progress = 15;
      this.emitEvent('job:fetching', nextJob);

      const prepared = await provider.prepareMedia(
        nextJob.sourceUrl,
        workspace,
        (stageDesc, pct) => {
          if (nextJob && nextJob.status === 'fetching') {
            nextJob.progress = Math.max(nextJob.progress, pct);
            this.emitEvent('job:progress', nextJob);
          }
        }
      );

      // 3. Audio Conversion
      nextJob.status = 'converting';
      nextJob.stage = 'converting';
      nextJob.progress = 50;
      this.emitEvent('job:converting', nextJob);

      // Generate clean sanitized filename
      const title = nextJob.title || prepared.title || 'Track';
      const artist = nextJob.artist || prepared.artist || '';
      const rawFileName = sanitizeFileName(title, artist, nextJob.format);
      const cleanFileName = deduplicateFileName(rawFileName, this.existingFileNames);
      this.existingFileNames.add(cleanFileName);

      const outputFileName = `converted.${nextJob.format}`;
      const finalOutputPath = path.join(workspace, outputFileName);

      await convertAudio({
        inputPath: prepared.sourceFilePath,
        outputPath: finalOutputPath,
        format: nextJob.format,
        quality: nextJob.quality,
        metadata: {
          title,
          artist,
          album: nextJob.playlistTitle || prepared.album,
          track: nextJob.playlistIndex,
          coverPath: prepared.coverPath,
        },
        onProgress: (pct) => {
          if (nextJob && nextJob.status === 'converting') {
            nextJob.progress = Math.min(95, 50 + Math.floor(pct * 0.45));
            this.emitEvent('job:progress', nextJob);
          }
        },
      });

      // 4. Finalize and register download token
      nextJob.stage = 'finalizing';
      nextJob.progress = 98;
      this.emitEvent('job:progress', nextJob);

      const stats = fs.statSync(finalOutputPath);
      const mimeType = nextJob.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';

      const downloadToken = registerDownloadToken({
        filePath: finalOutputPath,
        fileName: cleanFileName,
        mimeType,
      });

      // Clean source raw files to save disk immediately, keep only converted audio
      try {
        if (prepared.sourceFilePath !== finalOutputPath && fs.existsSync(prepared.sourceFilePath)) {
          fs.unlinkSync(prepared.sourceFilePath);
        }
      } catch {}

      nextJob.status = 'ready';
      nextJob.stage = 'ready';
      nextJob.progress = 100;
      nextJob.downloadToken = downloadToken;
      nextJob.fileName = cleanFileName;
      nextJob.fileSize = stats.size;
      nextJob.temporaryFilePath = finalOutputPath;

      this.emitEvent('job:ready', nextJob);
      this.emitQueueUpdate();
    } catch (err: any) {
      console.error(`Job ${nextJob.id} failed:`, err);
      nextJob.status = 'failed';
      nextJob.stage = 'idle';
      nextJob.error = err?.message || 'Processing failed.';
      this.emitEvent('job:failed', nextJob);
      this.emitQueueUpdate();
    } finally {
      this.activeJobId = null;
      this.isProcessing = false;

      // Sequential: advance immediately to the next job in queue!
      this.processNext();
    }
  }

  private emitEvent(type: QueueEventType, job: QueueJob): void {
    const clientJob = this.toClientJob(job);
    this.emit(type, clientJob);
    this.emit('event', { type, job: clientJob });
  }

  private emitQueueUpdate(): void {
    this.emit('queue:updated', this.getJobs());
  }

  private toClientJob(job: QueueJob): ClientQueueJob {
    return {
      id: job.id,
      source: job.source,
      sourceUrl: job.sourceUrl,
      mediaId: job.mediaId,
      playlistId: job.playlistId,
      playlistIndex: job.playlistIndex,
      playlistTitle: job.playlistTitle,
      title: job.title,
      artist: job.artist,
      thumbnail: job.thumbnail,
      duration: job.duration,
      format: job.format,
      quality: job.quality,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      retryCount: job.retryCount,
      downloadToken: job.downloadToken,
      fileName: job.fileName,
      fileSize: job.fileSize,
    };
  }
}

// Global singleton for Next.js hot-reloading dev mode
declare global {
  // eslint-disable-next-line no-var
  var __audiox_queue_engine__: QueueEngine | undefined;
}

export const queueEngine = globalThis.__audiox_queue_engine__ ?? new QueueEngine();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__audiox_queue_engine__ = queueEngine;
}
