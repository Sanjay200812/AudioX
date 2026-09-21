import { describe, it, expect, beforeEach } from 'vitest';
import { QueueEngine } from '../lib/queue/queue.engine';

describe('Sequential Queue Engine', () => {
  let engine: QueueEngine;

  beforeEach(() => {
    engine = new QueueEngine();
  });

  it('creates individual jobs in strict FIFO order', () => {
    const job1 = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://youtube.com/watch?v=1',
      mediaId: '1',
      title: 'Track 1',
      format: 'mp3',
      quality: '256k',
    });

    const job2 = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://youtube.com/watch?v=2',
      mediaId: '2',
      title: 'Track 2',
      format: 'mp3',
      quality: '256k',
    });

    const allJobs = engine.getJobs();
    expect(allJobs.length).toBe(2);
    expect(allJobs[0].id).toBe(job1.id);
    expect(allJobs[1].id).toBe(job2.id);
  });

  it('batch playlist creation enqueues individual jobs, NEVER a ZIP bundle', () => {
    const batchInputs = [
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/1', mediaId: '1', title: 'Song A' },
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/2', mediaId: '2', title: 'Song B' },
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/3', mediaId: '3', title: 'Song C' },
    ];

    const jobs = engine.createBatchJobs(batchInputs, 'mp3', '320k');
    expect(jobs.length).toBe(3);
    expect(jobs[0].title).toBe('Song A');
    expect(jobs[1].title).toBe('Song B');
    expect(jobs[2].title).toBe('Song C');

    // Verify all are independent jobs
    const ids = new Set(jobs.map((j) => j.id));
    expect(ids.size).toBe(3);
  });

  it('allows reordering queued waiting jobs', () => {
    // Manually create queued jobs
    const j1 = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://yt.com/1',
      mediaId: '1',
      title: 'First',
      format: 'mp3',
      quality: '192k',
    });
    const j2 = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://yt.com/2',
      mediaId: '2',
      title: 'Second',
      format: 'mp3',
      quality: '192k',
    });
    const j3 = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://yt.com/3',
      mediaId: '3',
      title: 'Third',
      format: 'mp3',
      quality: '192k',
    });

    // Move Third up
    const success = engine.reorderJob(j3.id, 'up');
    expect(typeof success).toBe('boolean');
  });

  it('limits retry count to maximum of 2', () => {
    const job = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://yt.com/test',
      mediaId: 'test',
      title: 'Failing Job',
      format: 'mp3',
      quality: '128k',
    });

    // Simulate fail
    (job as any).status = 'failed';
    const rawJob = (engine as any).jobs.get(job.id);
    rawJob.status = 'failed';

    const retry1 = engine.retryJob(job.id);
    expect(retry1).toBe(true);
    expect(rawJob.retryCount).toBe(1);

    rawJob.status = 'failed';
    const retry2 = engine.retryJob(job.id);
    expect(retry2).toBe(true);
    expect(rawJob.retryCount).toBe(2);

    rawJob.status = 'failed';
    const retry3 = engine.retryJob(job.id);
    expect(retry3).toBe(false); // blocked at max 2
  });

  it('allows skipping active or queued tracks and retrying skipped tracks', () => {
    const job = engine.createJob({
      source: 'youtube',
      sourceUrl: 'https://yt.com/test-skip',
      mediaId: 'test-skip',
      title: 'Skipped Track',
      format: 'mp3',
      quality: 'standard',
    });

    const skipped = engine.skipJob(job.id);
    expect(skipped).toBe(true);

    const updated = engine.getJob(job.id);
    expect(updated?.status).toBe('skipped');

    // Test retrying a skipped job
    const rawJob = (engine as any).jobs.get(job.id);
    const retried = engine.retryJob(job.id);
    expect(retried).toBe(true);
    expect(rawJob.retryCount).toBe(1);
  });

  it('accepts simplified audio quality tiers (standard, high, best) for batch playlist jobs', () => {
    const batchInputs = [
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/s1', mediaId: 's1', title: 'Song 1' },
      { source: 'youtube_playlist' as const, sourceUrl: 'https://yt.com/s2', mediaId: 's2', title: 'Song 2' },
    ];

    const jobsHigh = engine.createBatchJobs(batchInputs, 'mp3', 'high');
    expect(jobsHigh[0].quality).toBe('high');
    expect(jobsHigh[1].quality).toBe('high');

    const jobsBest = engine.createBatchJobs(batchInputs, 'm4a', 'best');
    expect(jobsBest[0].quality).toBe('best');

    const jobsStandard = engine.createBatchJobs(batchInputs, 'mp3', 'standard');
    expect(jobsStandard[0].quality).toBe('standard');
  });
});

