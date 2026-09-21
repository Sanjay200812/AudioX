'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  ClientQueueJob,
  UserSettings,
  DownloadHistoryItem,
  AudioFormat,
  AudioQuality,
  PlaylistTrack,
  FilenameFormat,
  AutoRemoveOption,
} from '@/lib/types';
import {
  saveDownloadToIndexedDB,
  getAllDownloadsFromIndexedDB,
  clearAllDownloadsFromIndexedDB,
} from '@/lib/storage/indexeddb';

interface AudioXContextType {
  jobs: ClientQueueJob[];
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  history: DownloadHistoryItem[];
  clearHistory: () => void;
  removeHistoryItem: (id: string) => void;
  activeJob: ClientQueueJob | null;
  queuedJobs: ClientQueueJob[];
  completedJobs: ClientQueueJob[];
  failedJobs: ClientQueueJob[];
  skippedJobs: ClientQueueJob[];
  isDownloadedSync: (mediaId: string, format?: AudioFormat) => boolean;
  isQueuedSync: (mediaId: string) => boolean;
  getDownloadedConflicts: (tracks: PlaylistTrack[], format?: AudioFormat) => PlaylistTrack[];
  getQueuedConflicts: (tracks: PlaylistTrack[]) => PlaylistTrack[];
  addSingleJob: (params: {
    sourceUrl: string;
    mediaId: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    format?: AudioFormat;
    quality?: AudioQuality;
    source?: 'youtube' | 'local';
    startImmediately?: boolean;
  }) => Promise<ClientQueueJob>;
  addPlaylistBatch: (params: {
    tracks: PlaylistTrack[];
    playlistId?: string;
    playlistTitle?: string;
    format?: AudioFormat;
    quality?: AudioQuality;
    startImmediately?: boolean;
  }) => Promise<void>;
  reorderJob: (id: string, direction: 'up' | 'down') => Promise<void>;
  skipJob: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  removeJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  clearPendingQueue: () => Promise<void>;
  downloadTrackManually: (job: ClientQueueJob) => void;
  isBrowserDownloadBlocked: boolean;
  clearBrowserBlockedNotice: () => void;
  toasts: Array<{ id: string; message: string; type?: 'info' | 'success' | 'error' }>;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: string) => void;
  unfinishedQueueSummary: { completed: number; total: number; remaining: number } | null;
  dismissUnfinishedQueueBanner: () => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultFormat: 'm4a',
  defaultQuality: 'high',
  filenameFormat: 'artist_title',
  autoStartQueue: true,
  autoDownload: true,
  downloadMode: 'auto',
  autoRemoveCompleted: 'never',
  saveHistory: true,
  theme: 'dark',
};

const AudioXContext = createContext<AudioXContextType | null>(null);

export function AudioXProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<ClientQueueJob[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [isBrowserDownloadBlocked, setIsBrowserDownloadBlocked] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'info' | 'success' | 'error' }>>([]);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);

  // Client queue runner state
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const hasUserTriggeredRef = useRef(true);

  const addToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load persistent settings & history & queue jobs on mount
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem('audiox_settings');
      if (storedSettings) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(storedSettings) }));
      }
    } catch {}

    try {
      const storedQueue = localStorage.getItem('audiox_queue_jobs');
      if (storedQueue) {
        const parsed: ClientQueueJob[] = JSON.parse(storedQueue);
        if (Array.isArray(parsed)) {
          // Reset any dangling active states from prior session
          const restored = parsed.map((j) => {
            if (['preparing', 'fetching', 'extracting', 'converting'].includes(j.status)) {
              return { ...j, status: 'queued' as const, stage: 'idle' as const, progress: 0 };
            }
            return j;
          });
          setJobs(restored);
        }
      }
    } catch {}

    // Load download history from IndexedDB with localStorage fallback
    getAllDownloadsFromIndexedDB()
      .then((items) => {
        if (items && items.length > 0) {
          setHistory(items);
        } else {
          try {
            const raw = localStorage.getItem('audiox_history');
            if (raw) setHistory(JSON.parse(raw));
          } catch {}
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem('audiox_history');
          if (raw) setHistory(JSON.parse(raw));
        } catch {}
      });
  }, []);

  // Save settings on change
  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('audiox_settings', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    addToast('Settings updated', 'success');
  }, [addToast]);

  // Persist queue jobs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('audiox_queue_jobs', JSON.stringify(jobs.slice(0, 100)));
    } catch {}
  }, [jobs]);

  // Clear & remove history
  const clearHistory = useCallback(async () => {
    await clearAllDownloadsFromIndexedDB().catch(() => {});
    try {
      localStorage.removeItem('audiox_history');
    } catch {}
    setHistory([]);
    addToast('Download history cleared', 'info');
  }, [addToast]);

  const removeHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('audiox_history', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Sequential Client-Side Queue Orchestrator (Concurrency = 1)
  useEffect(() => {
    if (isProcessingRef.current) return;
    if (!settings.autoStartQueue && !hasUserTriggeredRef.current) return;

    // Pick next queued track in FIFO order
    const nextJob = jobs.find((j) => j.status === 'queued');
    if (!nextJob) return;

    isProcessingRef.current = true;
    activeJobIdRef.current = nextJob.id;

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    // Transition track to active fetching stage
    setJobs((prev) =>
      prev.map((j) =>
        j.id === nextJob.id
          ? { ...j, status: 'fetching' as const, stage: 'fetching' as const, progress: 15, startedAt: Date.now(), error: undefined }
          : j
      )
    );

    // Timeout safety: 60s maxDuration for Vercel
    const timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, 60000);

    (async () => {
      let progressTimer: NodeJS.Timeout | null = null;
      try {
        // Smooth authentic progress updates while waiting for media
        progressTimer = setInterval(() => {
          setJobs((prev) =>
            prev.map((j) => {
              if (j.id !== nextJob.id) return j;
              if (j.progress < 50) return { ...j, progress: j.progress + 6 };
              if (j.progress < 85) return { ...j, stage: 'converting' as const, progress: j.progress + 4 };
              return j;
            })
          );
        }, 1200);

        const res = await fetch('/api/media/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: nextJob.sourceUrl,
            format: nextJob.format,
            quality: nextJob.quality,
            title: nextJob.title,
          }),
          signal: controller.signal,
        });

        if (progressTimer) clearInterval(progressTimer);
        clearTimeout(timeoutId);

        if (!res.ok) {
          let errMessage = 'Unable to process this track.';
          try {
            const data = await res.json();
            if (data.error) errMessage = data.error;
          } catch {}
          throw new Error(errMessage);
        }

        // Extract filename from response headers or fallback
        const disposition = res.headers.get('Content-Disposition') || '';
        let fileName = `${nextJob.title}.${nextJob.format}`;
        const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
        if (match && match[1]) {
          try {
            fileName = decodeURIComponent(match[1]);
          } catch {
            fileName = match[1];
          }
        }

        const blob = await res.blob();

        // Trigger immediate browser download
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

        // Mark complete and update state
        const completedJob: ClientQueueJob = {
          ...nextJob,
          status: 'completed',
          stage: 'ready',
          progress: 100,
          fileName,
          fileSize: blob.size,
          completedAt: Date.now(),
        };

        setJobs((prev) => prev.map((j) => (j.id === nextJob.id ? completedJob : j)));
        addToast(`Downloaded: ${nextJob.title}`, 'success');

        // Persist to download history
        if (settings.saveHistory) {
          const historyItem: DownloadHistoryItem = {
            id: nextJob.id,
            mediaId: nextJob.mediaId || nextJob.id,
            playlistId: nextJob.playlistId,
            title: nextJob.title,
            artist: nextJob.artist,
            thumbnail: nextJob.thumbnail,
            source: nextJob.source,
            format: nextJob.format,
            quality: nextJob.quality,
            fileName,
            fileSize: blob.size,
            fileSizeFormatted: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
            completedAt: Date.now(),
          };
          saveDownloadToIndexedDB(historyItem).catch(() => {});
          setHistory((prev) => [historyItem, ...prev.filter((h) => h.id !== nextJob.id)]);
        }
      } catch (err: any) {
        if (progressTimer) clearInterval(progressTimer);
        clearTimeout(timeoutId);

        const isTimeout = controller.signal.aborted && controller.signal.reason === 'timeout';
        const isAbort = controller.signal.aborted;

        if (isTimeout) {
          const errorMsg = 'This media took too long to process.';
          setJobs((prev) =>
            prev.map((j) => (j.id === nextJob.id ? { ...j, status: 'failed', stage: 'idle', error: errorMsg } : j))
          );
          addToast(errorMsg, 'error');
        } else if (isAbort) {
          // Handled via user cancel or skip
        } else {
          const errorMsg = err.message || 'Unable to process this track.';
          setJobs((prev) =>
            prev.map((j) => (j.id === nextJob.id ? { ...j, status: 'failed', stage: 'idle', error: errorMsg } : j))
          );
          addToast(`Failed: ${nextJob.title}`, 'error');
        }
      } finally {
        isProcessingRef.current = false;
        activeJobIdRef.current = null;
        activeAbortControllerRef.current = null;
      }
    })();
  }, [jobs, settings.autoStartQueue, settings.saveHistory, addToast]);

  const isDownloadedSync = useCallback(
    (mediaId: string, format?: AudioFormat): boolean => {
      if (!mediaId) return false;
      return history.some(
        (h) =>
          (h.mediaId === mediaId || h.id === mediaId) &&
          (!format || h.format === format)
      );
    },
    [history]
  );

  const isQueuedSync = useCallback(
    (mediaId: string): boolean => {
      if (!mediaId) return false;
      return jobs.some(
        (j) =>
          (j.mediaId === mediaId || j.sourceUrl.includes(mediaId)) &&
          ['queued', 'preparing', 'fetching', 'extracting', 'converting', 'ready', 'downloading'].includes(j.status)
      );
    },
    [jobs]
  );

  const getDownloadedConflicts = useCallback(
    (tracks: PlaylistTrack[], format?: AudioFormat): PlaylistTrack[] => {
      return tracks.filter((t) => isDownloadedSync(t.id, format));
    },
    [isDownloadedSync]
  );

  const getQueuedConflicts = useCallback(
    (tracks: PlaylistTrack[]): PlaylistTrack[] => {
      return tracks.filter((t) => isQueuedSync(t.id));
    },
    [isQueuedSync]
  );

  const addSingleJob = useCallback(async (params: {
    sourceUrl: string;
    mediaId: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    format?: AudioFormat;
    quality?: AudioQuality;
    source?: 'youtube' | 'local';
    startImmediately?: boolean;
  }) => {
    hasUserTriggeredRef.current = true;
    const newJob: ClientQueueJob = {
      id: crypto.randomUUID(),
      source: params.source || 'youtube',
      sourceUrl: params.sourceUrl,
      mediaId: params.mediaId,
      title: params.title,
      artist: params.artist,
      thumbnail: params.thumbnail || '',
      duration: params.duration || 0,
      format: params.format || settings.defaultFormat,
      quality: params.quality || settings.defaultQuality,
      status: 'queued',
      stage: 'idle',
      progress: 0,
      createdAt: Date.now(),
      retryCount: 0,
    };

    setJobs((prev) => {
      if (params.startImmediately) {
        // Place at front of queued items
        const activeOrDone = prev.filter((j) => j.status !== 'queued');
        const queued = prev.filter((j) => j.status === 'queued');
        return [...activeOrDone, newJob, ...queued];
      }
      return [...prev, newJob];
    });

    addToast(`Added to queue: ${params.title}`, 'success');
    return newJob;
  }, [settings.defaultFormat, settings.defaultQuality, addToast]);

  const addPlaylistBatch = useCallback(async (params: {
    tracks: PlaylistTrack[];
    playlistId?: string;
    playlistTitle?: string;
    format?: AudioFormat;
    quality?: AudioQuality;
    startImmediately?: boolean;
  }) => {
    hasUserTriggeredRef.current = true;
    const validTracks = params.tracks.filter((t) => t.isAvailable !== false);
    if (validTracks.length === 0) {
      throw new Error('No available tracks to queue.');
    }

    const fmt = params.format || settings.defaultFormat;
    const q = params.quality || settings.defaultQuality;

    const newJobs: ClientQueueJob[] = validTracks.map((t, idx) => ({
      id: crypto.randomUUID(),
      source: 'youtube_playlist',
      sourceUrl: t.url,
      mediaId: t.id,
      playlistId: params.playlistId,
      playlistIndex: t.index || idx + 1,
      playlistTitle: params.playlistTitle,
      title: t.title,
      artist: t.author,
      thumbnail: t.thumbnail || '',
      duration: t.duration || 0,
      format: fmt,
      quality: q,
      status: 'queued',
      stage: 'idle',
      progress: 0,
      createdAt: Date.now() + idx,
      retryCount: 0,
    }));

    setJobs((prev) => [...prev, ...newJobs]);
    addToast(`${validTracks.length} tracks added to queue`, 'success');
  }, [settings.defaultFormat, settings.defaultQuality, addToast]);

  const reorderJob = useCallback(async (id: string, direction: 'up' | 'down') => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      if (prev[idx].status !== 'queued' || prev[targetIdx].status !== 'queued') return prev;

      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  }, []);

  const skipJob = useCallback(async (id: string) => {
    if (activeJobIdRef.current === id) {
      activeAbortControllerRef.current?.abort();
    }
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'skipped', stage: 'idle', error: undefined } : j))
    );
    addToast('Track skipped, advancing to next', 'info');
  }, [addToast]);

  const cancelJob = useCallback(async (id: string) => {
    if (activeJobIdRef.current === id) {
      activeAbortControllerRef.current?.abort();
    }
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'cancelled', stage: 'idle' } : j))
    );
    addToast('Job cancelled', 'info');
  }, [addToast]);

  const removeJob = useCallback(async (id: string) => {
    if (activeJobIdRef.current === id) {
      activeAbortControllerRef.current?.abort();
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
    addToast('Item removed from queue', 'info');
  }, [addToast]);

  const retryJob = useCallback(async (id: string) => {
    hasUserTriggeredRef.current = true;
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === id) {
          return {
            ...j,
            status: 'queued',
            stage: 'idle',
            progress: 0,
            error: undefined,
            retryCount: (j.retryCount || 0) + 1,
          };
        }
        return j;
      })
    );
    addToast('Job re-queued for processing', 'info');
  }, [addToast]);

  const clearPendingQueue = useCallback(async () => {
    setJobs((prev) => prev.filter((j) => j.status !== 'queued'));
    addToast('Pending queue cleared', 'info');
  }, [addToast]);

  const downloadTrackManually = useCallback((job: ClientQueueJob) => {
    // Re-trigger download for completed job
    addToast(`Re-processing download: ${job.title}`, 'info');
    retryJob(job.id);
  }, [addToast, retryJob]);

  // Derived job lists
  const activeJob = jobs.find(
    (j) => j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting' || j.status === 'downloading'
  ) || null;

  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed');
  const skippedJobs = jobs.filter((j) => j.status === 'skipped');

  // Session recovery summary
  const unfinishedQueueSummary = (!dismissedRecovery && jobs.length > 0 && (queuedJobs.length > 0 || activeJob))
    ? {
        completed: completedJobs.length,
        total: jobs.length,
        remaining: queuedJobs.length + (activeJob ? 1 : 0),
      }
    : null;

  return (
    <AudioXContext.Provider
      value={{
        jobs,
        settings,
        updateSettings,
        history,
        clearHistory,
        removeHistoryItem,
        activeJob,
        queuedJobs,
        completedJobs,
        failedJobs,
        skippedJobs,
        isDownloadedSync,
        isQueuedSync,
        getDownloadedConflicts,
        getQueuedConflicts,
        addSingleJob,
        addPlaylistBatch,
        reorderJob,
        skipJob,
        cancelJob,
        removeJob,
        retryJob,
        clearPendingQueue,
        downloadTrackManually,
        isBrowserDownloadBlocked,
        clearBrowserBlockedNotice: () => setIsBrowserDownloadBlocked(false),
        toasts,
        addToast,
        removeToast,
        unfinishedQueueSummary,
        dismissUnfinishedQueueBanner: () => setDismissedRecovery(true),
      }}
    >
      {children}
    </AudioXContext.Provider>
  );
}

export function useAudioX() {
  const ctx = useContext(AudioXContext);
  if (!ctx) {
    throw new Error('useAudioX must be used within an AudioXProvider');
  }
  return ctx;
}
