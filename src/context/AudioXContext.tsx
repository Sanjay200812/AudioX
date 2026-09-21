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
  defaultFormat: 'mp3',
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

  // Track downloaded tokens to prevent duplicate auto-download loops
  const downloadedTokensRef = useRef<Set<string>>(new Set());

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

  // Load settings and history from IndexedDB and localStorage
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('audiox_settings');
      if (savedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      }

      // First load from IndexedDB
      getAllDownloadsFromIndexedDB().then((indexedItems) => {
        if (indexedItems && indexedItems.length > 0) {
          setHistory(indexedItems);
          try {
            localStorage.setItem('audiox_history', JSON.stringify(indexedItems.slice(0, 100)));
          } catch {}
        } else {
          // Fallback to localStorage if IndexedDB is empty
          const savedHistory = localStorage.getItem('audiox_history');
          if (savedHistory) {
            try {
              const parsed: DownloadHistoryItem[] = JSON.parse(savedHistory);
              setHistory(parsed);
              // Migrate localStorage items into IndexedDB
              parsed.forEach((item) => {
                saveDownloadToIndexedDB({
                  ...item,
                  mediaId: item.mediaId || item.id,
                }).catch(() => {});
              });
            } catch {}
          }
        }
      }).catch(() => {
        const savedHistory = localStorage.getItem('audiox_history');
        if (savedHistory) {
          try {
            setHistory(JSON.parse(savedHistory));
          } catch {}
        }
      });
    } catch {}
  }, []);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('audiox_settings', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    clearAllDownloadsFromIndexedDB().catch(() => {});
    try {
      localStorage.removeItem('audiox_history');
    } catch {}
    addToast('Download history cleared', 'info');
  }, [addToast]);

  const removeHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('audiox_history', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Trigger file download in browser
  const triggerBrowserDownload = useCallback((token: string, fileName?: string): boolean => {
    try {
      const link = document.createElement('a');
      link.href = `/api/download/${token}`;
      if (fileName) {
        link.setAttribute('download', fileName);
      }
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      }, 500);
      return true;
    } catch (err) {
      console.error('Download trigger error:', err);
      return false;
    }
  }, []);

  // Mark job completed on server & client
  const markJobDone = useCallback(async (job: ClientQueueJob) => {
    try {
      await fetch(`/api/jobs/${job.id}/complete`, { method: 'POST' });
    } catch {}

    // Save to persistent download history if enabled
    if (settings.saveHistory) {
      const newItem: DownloadHistoryItem = {
        id: job.id,
        mediaId: job.mediaId || job.id,
        playlistId: job.playlistId,
        title: job.title,
        artist: job.artist,
        thumbnail: job.thumbnail,
        source: job.source,
        format: job.format,
        quality: job.quality,
        fileName: job.fileName || `${job.title}.${job.format}`,
        fileSize: job.fileSize,
        fileSizeFormatted: job.fileSize ? `${(job.fileSize / (1024 * 1024)).toFixed(1)} MB` : undefined,
        downloadToken: job.downloadToken,
        completedAt: Date.now(),
      };

      // Persist to IndexedDB
      saveDownloadToIndexedDB(newItem).catch(() => {});

      setHistory((prev) => {
        const exists = prev.some((h) => h.id === job.id);
        if (exists) return prev;
        const updated = [newItem, ...prev];
        try {
          localStorage.setItem('audiox_history', JSON.stringify(updated.slice(0, 100)));
        } catch {}
        return updated;
      });
    }

    // Auto-remove completed item from queue if configured
    if (settings.autoRemoveCompleted === 'immediately') {
      setTimeout(() => {
        fetch(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
      }, 1000);
    } else if (settings.autoRemoveCompleted === '5min') {
      setTimeout(() => {
        fetch(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
      }, 5 * 60 * 1000);
    }
  }, [settings.saveHistory, settings.autoRemoveCompleted, history]);

  // Handle a newly ready job
  const handleJobReady = useCallback((job: ClientQueueJob) => {
    if (!job.downloadToken) return;

    if (downloadedTokensRef.current.has(job.downloadToken)) {
      return;
    }

    if (settings.autoDownload && settings.downloadMode === 'auto') {
      downloadedTokensRef.current.add(job.downloadToken);
      const success = triggerBrowserDownload(job.downloadToken, job.fileName);
      if (success) {
        addToast(`Downloaded: ${job.title}`, 'success');
        markJobDone(job);
      } else {
        setIsBrowserDownloadBlocked(true);
        addToast('Your browser blocked automatic multiple downloads. Allow downloads for AudioX to continue.', 'error');
      }
    } else {
      addToast(`Ready to download: ${job.title}`, 'info');
    }
  }, [settings.autoDownload, settings.downloadMode, triggerBrowserDownload, addToast, markJobDone]);

  // Manual download trigger
  const downloadTrackManually = useCallback((job: ClientQueueJob) => {
    if (!job.downloadToken) return;
    triggerBrowserDownload(job.downloadToken, job.fileName);
    addToast(`Downloading: ${job.title}`, 'success');
    markJobDone(job);
  }, [triggerBrowserDownload, addToast, markJobDone]);

  // SSE Subscription for live queue updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/jobs/stream');

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'init' && Array.isArray(data.jobs)) {
            setJobs(data.jobs);
          } else if (data.type === 'queue:updated' && Array.isArray(data.jobs)) {
            setJobs(data.jobs);
          } else if (data.job) {
            setJobs((prev) => {
              const idx = prev.findIndex((j) => j.id === data.job.id);
              if (idx === -1) {
                return [...prev, data.job];
              }
              const next = [...prev];
              next[idx] = data.job;
              return next;
            });

            if (data.type === 'job:ready') {
              handleJobReady(data.job);
            } else if (data.type === 'job:failed') {
              addToast(`Failed: ${data.job.title}`, 'error');
            } else if (data.type === 'job:skipped') {
              addToast(`Skipped: ${data.job.title}`, 'info');
            }
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        retryTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [handleJobReady, addToast]);

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
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        format: params.format || settings.defaultFormat,
        quality: params.quality || settings.defaultQuality,
        filenameFormat: settings.filenameFormat,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to queue media.');
    }

    const data = await res.json();
    addToast(`Added to queue: ${params.title}`, 'success');

    return data.job;
  }, [settings.defaultFormat, settings.defaultQuality, settings.filenameFormat, addToast]);

  const addPlaylistBatch = useCallback(async (params: {
    tracks: PlaylistTrack[];
    playlistId?: string;
    playlistTitle?: string;
    format?: AudioFormat;
    quality?: AudioQuality;
    startImmediately?: boolean;
  }) => {
    const validTracks = params.tracks.filter((t) => t.isAvailable !== false);
    if (validTracks.length === 0) {
      throw new Error('No available tracks to queue.');
    }

    const res = await fetch('/api/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        tracks: validTracks,
        format: params.format || settings.defaultFormat,
        quality: params.quality || settings.defaultQuality,
        filenameFormat: settings.filenameFormat,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to queue playlist tracks.');
    }

    const data = await res.json();
    addToast(`${validTracks.length} tracks added to queue`, 'success');
  }, [settings.defaultFormat, settings.defaultQuality, settings.filenameFormat, addToast]);

  const reorderJob = useCallback(async (id: string, direction: 'up' | 'down') => {
    const res = await fetch(`/api/jobs/${id}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) {
      const err = await res.json();
      addToast(err.error || 'Cannot reorder this item', 'error');
    }
  }, [addToast]);

  const skipJob = useCallback(async (id: string) => {
    await fetch(`/api/jobs/${id}/skip`, { method: 'POST' });
    addToast('Track skipped, advancing to next', 'info');
  }, [addToast]);

  const cancelJob = useCallback(async (id: string) => {
    await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
    addToast('Job cancelled', 'info');
  }, [addToast]);

  const removeJob = useCallback(async (id: string) => {
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    addToast('Item removed from queue', 'info');
  }, [addToast]);

  const retryJob = useCallback(async (id: string) => {
    const res = await fetch(`/api/jobs/${id}/retry`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      addToast(err.error || 'Failed to retry job', 'error');
    } else {
      addToast('Job re-queued for processing', 'info');
    }
  }, [addToast]);

  const clearPendingQueue = useCallback(async () => {
    for (const job of jobs) {
      if (job.status === 'queued') {
        await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      }
    }
    addToast('Pending queue cleared', 'info');
  }, [jobs, addToast]);

  // Derived job categories
  const activeJob = jobs.find(
    (j) => j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting' || j.status === 'ready'
  ) || null;

  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed');
  const skippedJobs = jobs.filter((j) => j.status === 'skipped');

  // Unfinished queue summary for session recovery
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
