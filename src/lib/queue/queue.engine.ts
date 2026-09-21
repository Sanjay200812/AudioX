import EventEmitter from 'events';
import crypto from 'crypto';
import { QueueJob, ClientQueueJob, AudioFormat, AudioQuality, MediaSource, FilenameFormat } from '../types';
import { cleanJobWorkspace, registerDownloadToken } from '../storage/temp';
import { sanitizeFileName, deduplicateFileName } from '../media/sanitizer';
import {
  isWorkerConfigured,
  createWorkerJob,
  getWorkerJob,
  cancelWorkerJob,
} from '../worker-client';

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

    cancelWorkerJob(id).catch(() => {});
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

    cancelWorkerJob(id).catch(() => {});
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

    console.log(`[queue:job:start] id=${nextJob.id} title="${nextJob.title}" format=${nextJob.format} quality=${nextJob.quality}`);
    this.emitEvent('job:started', nextJob);
    this.emitQueueUpdate();

    if (!isWorkerConfigured()) {
      const duration = nextJob.startedAt ? Date.now() - nextJob.startedAt : 0;
      console.warn(`[queue:job:error] id=${nextJob.id} duration=${duration}ms AUDIOX_WORKER_URL is not configured. Media processing worker required.`);
      nextJob.status = 'failed';
      nextJob.stage = 'idle';
      nextJob.error = 'Audio processing service is temporarily unavailable.';
      this.emitEvent('job:failed', nextJob);
      this.emitQueueUpdate();

      this.activeJobId = null;
      this.isProcessing = false;
      this.processNext();
      return;
    }

    try {
      console.log(`[queue:job:forward] id=${nextJob.id} url="${nextJob.sourceUrl}" format=${nextJob.format} quality=${nextJob.quality}`);
      const workerResponse = await createWorkerJob({
        id: nextJob.id,
        sourceUrl: nextJob.sourceUrl,
        format: nextJob.format,
        quality: nextJob.quality,
        title: nextJob.title,
        artist: nextJob.artist,
        thumbnail: nextJob.thumbnail,
        duration: nextJob.duration,
      });

      const remoteJobId = workerResponse.jobId || nextJob.id;

      let isDone = false;
      while (!isDone) {
        // Check if job was cancelled or skipped locally while processing
        const currentJob = this.jobs.get(nextJob.id);
        if (!currentJob || currentJob.status === 'cancelled' || currentJob.status === 'skipped') {
          await cancelWorkerJob(remoteJobId).catch(() => {});
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const workerJob = await getWorkerJob(remoteJobId);
        if (!workerJob) {
          continue;
        }

        // Pass through authentic stages and percentages from worker
        if (workerJob.status === 'fetching') {
          nextJob.status = 'fetching';
          nextJob.stage = 'fetching';
          nextJob.progress = workerJob.progress || 15;
          this.emitEvent('job:fetching', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'extracting') {
          nextJob.status = 'extracting';
          nextJob.stage = 'extracting';
          nextJob.progress = workerJob.progress || 40;
          this.emitEvent('job:progress', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'converting') {
          nextJob.status = 'converting';
          nextJob.stage = 'converting';
          nextJob.progress = workerJob.progress || 65;
          this.emitEvent('job:converting', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'finalizing') {
          nextJob.stage = 'finalizing';
          nextJob.progress = workerJob.progress || 90;
          this.emitEvent('job:progress', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'ready') {
          isDone = true;

          const title = nextJob.title || workerJob.title || 'Track';
          const artist = nextJob.artist || '';
          const rawFileName = sanitizeFileName(title, artist, nextJob.format);
          const cleanFileName = deduplicateFileName(rawFileName, this.existingFileNames);
          this.existingFileNames.add(cleanFileName);

          const mimeType = nextJob.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
          const downloadToken = registerDownloadToken({
            remoteJobId,
            fileName: cleanFileName,
            fileSize: workerJob.fileSize,
            mimeType: workerJob.mimeType || mimeType,
          });

          nextJob.status = 'ready';
          nextJob.stage = 'ready';
          nextJob.progress = 100;
          nextJob.downloadToken = downloadToken;
          nextJob.fileName = cleanFileName;
          nextJob.fileSize = workerJob.fileSize;

          const duration = nextJob.startedAt ? Date.now() - nextJob.startedAt : 0;
          console.log(`[queue:job:ready] id=${nextJob.id} remoteId=${remoteJobId} token=${downloadToken} size=${workerJob.fileSize} duration=${duration}ms`);

          this.emitEvent('job:ready', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'failed') {
          isDone = true;
          const duration = nextJob.startedAt ? Date.now() - nextJob.startedAt : 0;
          console.error(`[queue:job:failed] id=${nextJob.id} remoteId=${remoteJobId} duration=${duration}ms worker_error:`, workerJob.error);
          nextJob.status = 'failed';
          nextJob.stage = 'idle';
          nextJob.error = 'Audio processing service could not start.';
          this.emitEvent('job:failed', nextJob);
          this.emitQueueUpdate();
        } else if (workerJob.status === 'cancelled') {
          isDone = true;
          nextJob.status = 'cancelled';
          nextJob.stage = 'idle';
          this.emitEvent('job:cancelled', nextJob);
          this.emitQueueUpdate();
        }
      }
    } catch (err: any) {
      const duration = nextJob.startedAt ? Date.now() - nextJob.startedAt : 0;
      console.error(`[queue:job:failed] id=${nextJob.id} duration=${duration}ms error:`, err?.message || err);
      nextJob.status = 'failed';
      nextJob.stage = 'idle';
      const errMsg = (err?.message || '').toLowerCase();
      if (errMsg.includes('unavailable') || errMsg.includes('fetch') || errMsg.includes('econnrefused')) {
        nextJob.error = 'Audio processing service is temporarily unavailable.';
      } else {
        nextJob.error = 'Audio processing service could not start.';
      }
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
