'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  ClientQueueJob,
  UserSettings,
  DownloadHistoryItem,
  AudioFormat,
  AudioQuality,
  PlaylistTrack,
} from '@/lib/types';
import {
  saveDownloadToIndexedDB,
  getAllDownloadsFromIndexedDB,
  clearAllDownloadsFromIndexedDB,
  deleteDownloadFromIndexedDB,
  getAudioBlobFromIndexedDB,
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
  startQueue: () => void;
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

  // Client queue runner state
  const isProcessingRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const hasUserTriggeredRef = useRef(true);
  const retryingJobIdsRef = useRef<Set<string>>(new Set());

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
      const storedSettingsRaw = localStorage.getItem('audiox_settings');
      let currentSettings: UserSettings = { ...DEFAULT_SETTINGS };
      if (storedSettingsRaw) {
        currentSettings = { ...currentSettings, ...JSON.parse(storedSettingsRaw) };
      }

      // One-time local settings migration so old default M4A does not override MP3 default
      const migrationKey = 'audiox_default_format_migrated_v2';
      const hasMigrated = localStorage.getItem(migrationKey);

      if (!hasMigrated) {
        if (currentSettings.defaultFormat === 'm4a') {
          currentSettings.defaultFormat = 'mp3';
        }
        try {
          localStorage.setItem('audiox_settings', JSON.stringify(currentSettings));
          localStorage.setItem(migrationKey, 'true');
        } catch {}
      }

      setSettings(currentSettings);
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
    deleteDownloadFromIndexedDB(id).catch(() => {});
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('audiox_history', JSON.stringify(next));
      } catch {}
      return next;
    });
    addToast('Removed from history', 'info');
  }, [addToast]);

  // Start queue runner if autoStartQueue was disabled
  const startQueue = useCallback(() => {
    hasUserTriggeredRef.current = true;
    setJobs((prev) => [...prev]);
    addToast('Queue processing started', 'info');
  }, [addToast]);

  // Sequential Client-Side Queue Orchestrator (Concurrency = 1)
  // Each track independently invokes the native Vercel Python media processing function
  useEffect(() => {
    if (isProcessingRef.current) return;

    // Honor autoStartQueue setting
    if (!settings.autoStartQueue && !hasUserTriggeredRef.current) return;

    // If there is any job currently in 'ready' status in manual mode, pause queue until downloaded
    const hasReadyManualJob = jobs.some((j) => j.status === 'ready');
    if (hasReadyManualJob && settings.downloadMode === 'manual') {
      return;
    }

    // Pick next queued track in FIFO order
    const nextJob = jobs.find((j) => j.status === 'queued');
    if (!nextJob) return;

    isProcessingRef.current = true;
    activeJobIdRef.current = nextJob.id;

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    // 1. Transition track to resolving stage
    setJobs((prev) =>
      prev.map((j) =>
        j.id === nextJob.id
          ? {
              ...j,
              status: 'downloading' as const,
              stage: 'resolving' as const,
              progress: 10,
              startedAt: Date.now(),
              error: undefined,
              errorCode: undefined,
            }
          : j
      )
    );

    // Timeout safety: 120 seconds max per single track
    const timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, 120000);

    // Stage progression timers while server processes: resolving -> downloading -> converting -> finalizing
    const stageTimers: NodeJS.Timeout[] = [];
    stageTimers.push(
      setTimeout(() => {
        if (!controller.signal.aborted) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id && j.status === 'downloading' && j.stage === 'resolving'
                ? { ...j, stage: 'downloading' as const, progress: 30 }
                : j
            )
          );
        }
      }, 1500)
    );
    stageTimers.push(
      setTimeout(() => {
        if (!controller.signal.aborted) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id && j.status === 'downloading' && (j.stage === 'resolving' || j.stage === 'downloading')
                ? { ...j, stage: 'converting' as const, progress: 55 }
                : j
            )
          );
        }
      }, 4000)
    );
    stageTimers.push(
      setTimeout(() => {
        if (!controller.signal.aborted) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id && j.status === 'downloading' && ['resolving', 'downloading', 'converting'].includes(j.stage)
                ? { ...j, stage: 'finalizing' as const, progress: 75 }
                : j
            )
          );
        }
      }, 7000)
    );

    const clearTimers = () => {
      clearTimeout(timeoutId);
      stageTimers.forEach((t) => clearTimeout(t));
    };

    (async () => {
      try {
        const processRes = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: nextJob.sourceUrl,
            format: nextJob.format,
            quality: nextJob.quality,
            title: nextJob.title,
            artist: nextJob.artist,
          }),
          signal: controller.signal,
        });

        clearTimers();

        if (!processRes.ok) {
          let errData: any = {};
          try {
            errData = await processRes.json();
          } catch {}

          const rawDetail = typeof errData.detail === 'object' && errData.detail !== null ? errData.detail : {};
          const errorCode =
            errData.errorCode ||
            rawDetail.errorCode ||
            (processRes.status === 404 ? 'ENDPOINT_NOT_FOUND' : 'PROCESSING_FAILED');

          const backendMsg =
            errData.error ||
            rawDetail.error ||
            (typeof errData.detail === 'string' ? errData.detail : null);

          const isRestricted = ['LOGIN_REQUIRED', 'AGE_RESTRICTED', 'PRIVATE_VIDEO', 'VIDEO_UNAVAILABLE'].includes(errorCode);
          const errorMsg =
            backendMsg ||
            (isRestricted
              ? 'This video is restricted or requires authentication.'
              : processRes.status === 404
              ? 'Audio processing endpoint not found. Please ensure Vercel deployment has finished.'
              : `Audio processing error (${processRes.status}). Please retry.`);

          console.error('[AudioX] Processing request failed:', processRes.status, errData);

          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id
                ? { ...j, status: 'failed' as const, stage: 'idle' as const, error: errorMsg, errorCode }
                : j
            )
          );
          addToast(errorMsg, 'error');
          return;
        }

        // Advance to downloading file stage
        setJobs((prev) =>
          prev.map((j) =>
            j.id === nextJob.id
              ? { ...j, stage: 'downloading file' as const, progress: 85 }
              : j
          )
        );

        // Parse filename from Content-Disposition
        const disposition = processRes.headers.get('Content-Disposition') || '';
        let fileName = `${nextJob.title}.${nextJob.format}`;
        const matchUtf = disposition.match(/filename\*=UTF-8''([^";]+)/i);
        const matchRegular = disposition.match(/filename="?([^";]+)"?/i);
        if (matchUtf && matchUtf[1]) {
          try {
            fileName = decodeURIComponent(matchUtf[1]);
          } catch {
            fileName = matchUtf[1];
          }
        } else if (matchRegular && matchRegular[1]) {
          fileName = matchRegular[1].replace(/\\"/g, '"');
        }

        // Stream audio chunks in real-time
        const reader = processRes.body?.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;
        const totalBytes = Number(processRes.headers.get('Content-Length')) || 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedBytes += value.length;
              if (totalBytes > 0) {
                const streamProgress = Math.min(99, 85 + Math.floor((receivedBytes / totalBytes) * 14));
                setJobs((prev) =>
                  prev.map((j) => (j.id === nextJob.id ? { ...j, progress: streamProgress } : j))
                );
              }
            }
          }
        }

        const mimeType = nextJob.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
        const blob = new Blob(chunks as any, { type: mimeType });

        // Save to IndexedDB for offline playback & history
        if (settings.saveHistory) {
          const historyItem: DownloadHistoryItem = {
            id: nextJob.id,
            mediaId: nextJob.mediaId || nextJob.id,
            jobId: nextJob.id,
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
            hasAudioBlob: true,
          };
          saveDownloadToIndexedDB(historyItem, blob).catch(() => {});
          setHistory((prev) => [historyItem, ...prev.filter((h) => h.id !== nextJob.id)]);
        }

        const shouldAutoDownload = settings.autoDownload && settings.downloadMode !== 'manual';

        if (shouldAutoDownload) {
          // Automatic trigger browser download
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

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

          if (settings.autoRemoveCompleted === 'immediately') {
            setTimeout(() => {
              setJobs((prev) => prev.filter((j) => j.id !== nextJob.id));
            }, 1000);
          }
        } else {
          // Manual Mode
          const readyJob: ClientQueueJob = {
            ...nextJob,
            status: 'ready',
            stage: 'ready',
            progress: 100,
            fileName,
            fileSize: blob.size,
          };

          setJobs((prev) => prev.map((j) => (j.id === nextJob.id ? readyJob : j)));
          addToast(`Ready to download: ${nextJob.title}`, 'info');
        }
      } catch (err: any) {
        clearTimers();
        const isTimeout = controller.signal.aborted && controller.signal.reason === 'timeout';
        const isAbort = controller.signal.aborted;

        if (isTimeout) {
          const errorMsg = 'Audio processing timed out after 120 seconds.';
          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id
                ? { ...j, status: 'failed', stage: 'idle', error: errorMsg, errorCode: 'NETWORK_ERROR' }
                : j
            )
          );
          addToast(errorMsg, 'error');
        } else if (isAbort) {
          // Aborted by user
        } else {
          const errorMsg = err?.message || 'Unable to process this track.';
          setJobs((prev) =>
            prev.map((j) =>
              j.id === nextJob.id
                ? { ...j, status: 'failed', stage: 'idle', error: errorMsg, errorCode: 'PROCESSING_FAILED' }
                : j
            )
          );
          addToast(`Failed: ${nextJob.title}`, 'error');
        }
      } finally {
        clearTimers();
        isProcessingRef.current = false;
        activeJobIdRef.current = null;
        activeAbortControllerRef.current = null;
      }
    })();
  }, [jobs, settings.autoStartQueue, settings.autoDownload, settings.downloadMode, settings.autoRemoveCompleted, settings.saveHistory, addToast]);

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
      const existingIdx = prev.findIndex(
        (j) => (params.mediaId && j.mediaId === params.mediaId) || j.sourceUrl === params.sourceUrl
      );
      if (existingIdx !== -1) {
        const existing = prev[existingIdx];
        const updated: ClientQueueJob = {
          ...existing,
          format: params.format || existing.format,
          quality: params.quality || existing.quality,
          status: 'queued',
          stage: 'idle',
          progress: 0,
          error: undefined,
          retryCount: (existing.retryCount || 0) + 1,
        };
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      }

      if (params.startImmediately) {
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
    if (retryingJobIdsRef.current.has(id)) return;
    retryingJobIdsRef.current.add(id);

    try {
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
              errorCode: undefined,
              retryCount: (j.retryCount || 0) + 1,
            };
          }
          return j;
        })
      );
      addToast('Track re-queued for processing', 'info');
    } finally {
      setTimeout(() => {
        retryingJobIdsRef.current.delete(id);
      }, 600);
    }
  }, [addToast]);

  const clearPendingQueue = useCallback(async () => {
    setJobs((prev) => prev.filter((j) => j.status !== 'queued'));
    addToast('Pending queue cleared', 'info');
  }, [addToast]);

  const downloadTrackManually = useCallback(async (job: ClientQueueJob) => {
    try {
      // 1. Try local IndexedDB blob first for instant offline download
      const blob = await getAudioBlobFromIndexedDB(job.id);
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = job.fileName || `${job.title}.${job.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } else {
        // Re-process if blob is not in local cache
        addToast(`Re-processing download: ${job.title}`, 'info');
        retryJob(job.id);
        return;
      }

      // If job was in ready state waiting for user download, advance to completed
      if (job.status === 'ready') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: 'completed', completedAt: Date.now() } : j
          )
        );
      }
      addToast(`Downloaded: ${job.title}`, 'success');
    } catch {
      addToast('Failed to download track.', 'error');
    }
  }, [addToast, retryJob]);

  // Derived job lists
  const activeJob = jobs.find(
    (j) => j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting' || j.status === 'downloading' || j.status === 'ready'
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
        startQueue,
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
