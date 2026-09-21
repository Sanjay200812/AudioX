'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  SingleMediaMetadata,
  PlaylistMetadata,
  PlaylistTrack,
  AudioFormat,
  AudioQuality,
} from '@/lib/types';
import { SourceBadge } from './SourceBadge';
import { FormatSelector } from './FormatSelector';
import { QualitySelector } from './QualitySelector';
import { useAudioX } from '@/context/AudioXContext';
import {
  Clock,
  Plus,
  Download,
  Music,
  CheckCircle2,
  ListMusic,
  ChevronDown,
  ChevronUp,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  X,
  Sparkles,
} from 'lucide-react';

interface MediaResultCardProps {
  metadata?: SingleMediaMetadata | null;
  playlist?: PlaylistMetadata | null;
  onDone?: () => void;
}

export function MediaResultCard({ metadata, playlist, onDone }: MediaResultCardProps) {
  const router = useRouter();
  const {
    settings,
    addSingleJob,
    addPlaylistBatch,
    isDownloadedSync,
    isQueuedSync,
    getDownloadedConflicts,
    getQueuedConflicts,
    addToast,
  } = useAudioX();

  const [format, setFormat] = useState<AudioFormat>(settings.defaultFormat);
  const [quality, setQuality] = useState<AudioQuality>(settings.defaultQuality);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successText, setSuccessText] = useState('Added to Queue');

  // Confirmation Modals State
  const [singleDuplicateModal, setSingleDuplicateModal] = useState<{
    open: boolean;
    action: 'queue' | 'download';
  } | null>(null);

  const [playlistConflictModal, setPlaylistConflictModal] = useState<{
    open: boolean;
    conflicts: PlaylistTrack[];
    action: 'queue' | 'download';
    tracksToQueue: PlaylistTrack[];
  } | null>(null);

  const [playlistQueuedModal, setPlaylistQueuedModal] = useState<{
    open: boolean;
    conflicts: PlaylistTrack[];
    action: 'queue' | 'download';
    tracksToQueue: PlaylistTrack[];
  } | null>(null);

  // Available tracks (excluding deleted or private videos)
  const isPlaylist = !!playlist && Array.isArray(playlist.tracks) && playlist.tracks.length > 0;
  const availableTracks = useMemo(() => {
    if (!isPlaylist || !playlist) return [];
    return playlist.tracks.filter((t) => t.isAvailable !== false);
  }, [isPlaylist, playlist]);

  const unavailableCount = useMemo(() => {
    if (!isPlaylist || !playlist) return 0;
    return playlist.tracks.length - availableTracks.length;
  }, [isPlaylist, playlist, availableTracks]);

  // Track selection state (defaults to all available tracks selected)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => {
    return new Set(availableTracks.map((t) => t.index));
  });

  // Filtered tracks for inline search
  const filteredTracks = useMemo(() => {
    if (!isPlaylist) return [];
    return availableTracks.filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.author && t.author.toLowerCase().includes(q)) ||
        t.index.toString() === q
      );
    });
  }, [isPlaylist, availableTracks, searchQuery]);

  const selectedTracks = useMemo(() => {
    return availableTracks.filter((t) => selectedIndices.has(t.index));
  }, [availableTracks, selectedIndices]);

  const selectedCount = selectedTracks.length;

  // Toggle selection
  const handleToggleAll = () => {
    if (selectedIndices.size === availableTracks.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(availableTracks.map((t) => t.index)));
    }
  };

  const handleToggleTrack = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // --- Handlers ---

  // 1. Single Video Handlers
  const executeSingleJob = async (action: 'queue' | 'download') => {
    if (!metadata || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addSingleJob({
        sourceUrl: metadata.url,
        mediaId: metadata.id,
        title: metadata.title,
        artist: metadata.author,
        thumbnail: metadata.thumbnail,
        duration: metadata.duration,
        format,
        quality,
        source: metadata.source === 'local' ? 'local' : 'youtube',
        startImmediately: action === 'download',
      });
      setIsSuccess(true);
      setSuccessText(action === 'download' ? 'Processing Download...' : 'Added to Queue');
      setTimeout(() => {
        setIsSuccess(false);
        if (action === 'download') {
          router.push('/queue');
        } else {
          onDone?.();
        }
      }, 1200);
    } catch (err: any) {
      addToast(err.message || 'Failed to queue single track', 'error');
    } finally {
      setIsSubmitting(false);
      setSingleDuplicateModal(null);
    }
  };

  // 1. Single Video Explicit Handlers
  const handleDownloadSingleNow = () => {
    if (!metadata) return;
    if (isDownloadedSync(metadata.id, format)) {
      setSingleDuplicateModal({ open: true, action: 'download' });
      return;
    }
    executeSingleJob('download');
  };

  const handleAddSingleToQueue = () => {
    if (!metadata) return;
    if (isDownloadedSync(metadata.id, format)) {
      setSingleDuplicateModal({ open: true, action: 'queue' });
      return;
    }
    executeSingleJob('queue');
  };

  // 2. Playlist / Selected Tracks Batch Processing
  const executePlaylistBatch = async (tracksToProcess: PlaylistTrack[], action: 'queue' | 'download') => {
    if (!playlist || isSubmitting || tracksToProcess.length === 0) return;
    setIsSubmitting(true);
    try {
      await addPlaylistBatch({
        tracks: tracksToProcess,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        format,
        quality,
        startImmediately: action === 'download',
      });
      setIsSuccess(true);
      setSuccessText(
        action === 'download'
          ? `Downloading ${tracksToProcess.length} Tracks...`
          : `${tracksToProcess.length} Tracks Queued`
      );
      setTimeout(() => {
        setIsSuccess(false);
        if (action === 'download') {
          router.push('/queue');
        } else {
          onDone?.();
        }
      }, 1200);
    } catch (err: any) {
      addToast(err.message || 'Failed to process playlist batch', 'error');
    } finally {
      setIsSubmitting(false);
      setPlaylistConflictModal(null);
      setPlaylistQueuedModal(null);
    }
  };

  const initiatePlaylistProcessing = (tracksToProcess: PlaylistTrack[], action: 'queue' | 'download') => {
    if (tracksToProcess.length === 0) {
      addToast('Please select at least one track', 'error');
      return;
    }

    // Check for already downloaded conflicts
    const downloadedConflicts = getDownloadedConflicts(tracksToProcess, format);
    if (downloadedConflicts.length > 0) {
      setPlaylistConflictModal({
        open: true,
        conflicts: downloadedConflicts,
        action,
        tracksToQueue: tracksToProcess,
      });
      return;
    }

    // Check for already queued conflicts
    const queuedConflicts = getQueuedConflicts(tracksToProcess);
    if (queuedConflicts.length > 0) {
      setPlaylistQueuedModal({
        open: true,
        conflicts: queuedConflicts,
        action,
        tracksToQueue: tracksToProcess,
      });
      return;
    }

    executePlaylistBatch(tracksToProcess, action);
  };

  // 3. Full Playlist Explicit Handlers
  const handleDownloadPlaylistAll = () => {
    initiatePlaylistProcessing(availableTracks, 'download');
  };

  const handleAddPlaylistAllToQueue = () => {
    initiatePlaylistProcessing(availableTracks, 'queue');
  };

  // 4. Selected Tracks Explicit Handlers
  const handleDownloadSelectedTracks = () => {
    if (selectedTracks.length === 0) {
      addToast('Please select at least one track to download', 'error');
      return;
    }
    initiatePlaylistProcessing(selectedTracks, 'download');
  };

  const handleAddSelectedTracksToQueue = () => {
    if (selectedTracks.length === 0) {
      addToast('Please select at least one track to queue', 'error');
      return;
    }
    initiatePlaylistProcessing(selectedTracks, 'queue');
  };

  // Thumbnail & Title resolution
  const title = isPlaylist ? playlist.title : metadata?.title || 'Unknown Audio';
  const author = isPlaylist ? playlist.author : metadata?.author;
  const thumbnail = (isPlaylist ? playlist.thumbnail : metadata?.thumbnail) || metadata?.thumbnail || '';

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl glass-panel p-5 sm:p-6 shadow-2xl border border-white/[0.08] transition-all duration-300">
      {/* Playlist Notification Banner */}
      {isPlaylist && (
        <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-200">
                Playlist detected • {availableTracks.length} tracks
              </span>
              {unavailableCount > 0 && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  ({unavailableCount} unavailable excluded)
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              All tracks will be added unless you choose specific songs.
            </p>
          </div>
        </div>
      )}

      {/* Main Header / Artwork & Details */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* Artwork */}
        <div className="relative w-full sm:w-44 h-36 sm:h-28 rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.08] shrink-0">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={title}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900">
              {isPlaylist ? <ListMusic size={32} /> : <Music size={32} />}
            </div>
          )}
          {isPlaylist ? (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[11px] font-mono font-medium text-white flex items-center gap-1">
              <ListMusic size={10} />
              {playlist.trackCount} Tracks
            </div>
          ) : (
            metadata?.durationFormatted && (
              <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[11px] font-mono font-medium text-white flex items-center gap-1">
                <Clock size={10} />
                {metadata.durationFormatted}
              </div>
            )
          )}
        </div>

        {/* Info Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <SourceBadge source={isPlaylist ? 'youtube_playlist' : (metadata?.source || 'youtube')} size="sm" />
            {isPlaylist && playlist.totalDurationFormatted && (
              <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                <Clock size={10} />
                {playlist.totalDurationFormatted}
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">
            {title}
          </h3>

          {author && (
            <p className="text-xs text-zinc-400 mt-1 font-medium line-clamp-1">
              {author}
            </p>
          )}

          {isPlaylist && (
            <p className="text-[11px] text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
              Sequential processing active: tracks will be downloaded individually as independent audio files. Zero ZIP generation.
            </p>
          )}
        </div>
      </div>

      {/* Preset Selectors */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium">Format:</span>
          <FormatSelector value={format} onChange={setFormat} size="sm" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium">Quality:</span>
          <QualitySelector value={quality} onChange={setQuality} size="sm" showHelpText />
        </div>
      </div>

      {/* Primary Action Buttons: LEFT is Download Now, RIGHT is Add to Queue */}
      <div className="mt-5 flex items-center gap-3">
        {/* LEFT BUTTON: Download Now / Download All N / Download X */}
        <button
          type="button"
          onClick={() => {
            if (!isPlaylist) {
              handleDownloadSingleNow();
            } else if (selectedCount === availableTracks.length) {
              handleDownloadPlaylistAll();
            } else {
              handleDownloadSelectedTracks();
            }
          }}
          disabled={isSubmitting || isSuccess || (isPlaylist && selectedCount === 0)}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer shadow-lg ${
            isSuccess
              ? 'bg-emerald-500 text-white'
              : 'gradient-accent text-white hover:opacity-95 active:scale-[0.98] shadow-indigo-600/25 disabled:opacity-40 disabled:pointer-events-none'
          }`}
          title={isPlaylist ? `Download ${selectedCount} tracks sequentially` : 'Download audio now'}
        >
          {isSuccess ? (
            <>
              <CheckCircle2 size={16} />
              <span>{successText}</span>
            </>
          ) : (
            <>
              <Download size={16} />
              <span>
                {isPlaylist
                  ? selectedCount === availableTracks.length
                    ? `Download All ${availableTracks.length}`
                    : `Download ${selectedCount}`
                  : 'Download Now'}
              </span>
            </>
          )}
        </button>

        {/* RIGHT BUTTON: Add to Queue / Add N Tracks to Queue / Add X to Queue */}
        <button
          type="button"
          onClick={() => {
            if (!isPlaylist) {
              handleAddSingleToQueue();
            } else if (selectedCount === availableTracks.length) {
              handleAddPlaylistAllToQueue();
            } else {
              handleAddSelectedTracksToQueue();
            }
          }}
          disabled={isSubmitting || isSuccess || (isPlaylist && selectedCount === 0)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm text-zinc-200 bg-white/[0.08] hover:bg-white/[0.14] hover:text-white border border-white/[0.1] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-sm"
          title={isPlaylist ? `Add ${selectedCount} tracks to queue` : 'Add track to queue'}
        >
          <Plus size={16} />
          <span>
            {isPlaylist
              ? selectedCount === availableTracks.length
                ? `Add ${availableTracks.length} Tracks to Queue`
                : `Add ${selectedCount} to Queue`
              : 'Add to Queue'}
          </span>
        </button>
      </div>

      {/* 1. MAKE "CHOOSE SPECIFIC SONGS" MUCH MORE VISIBLE: Full-width 64-72px Expandable Action Card */}
      {isPlaylist && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className={`w-full min-h-[68px] sm:min-h-[72px] px-4 sm:px-5 py-3 rounded-2xl flex items-center justify-between text-left transition-all duration-200 cursor-pointer border ${
              isExpanded
                ? 'bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-indigo-600/20 border-indigo-500/50 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                : 'bg-gradient-to-r from-indigo-500/[0.08] via-purple-500/[0.06] to-indigo-500/[0.08] hover:from-indigo-500/[0.14] hover:to-purple-500/[0.12] border-indigo-500/25 hover:border-indigo-500/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isExpanded
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
                }`}
              >
                <ListMusic size={22} className="sm:w-6 sm:h-6" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight flex items-center gap-2">
                  <span>Choose Specific Songs</span>
                  {selectedCount < availableTracks.length && (
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {selectedCount} of {availableTracks.length}
                    </span>
                  )}
                </h4>
                <p className="text-xs text-zinc-400 mt-1">
                  {isExpanded
                    ? 'Select tracks below'
                    : 'Select only the tracks you want from this playlist.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  isExpanded ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
              </div>
            </div>
          </button>

          {metadata && (
            <div className="text-right px-1">
              <button
                type="button"
                onClick={() => executeSingleJob('download')}
                disabled={isSubmitting}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 underline transition-colors cursor-pointer"
              >
                Download Current Video Only
              </button>
            </div>
          )}
        </div>
      )}

      {/* Expanded Inline Song Selection Section */}
      {isPlaylist && isExpanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.08] flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Choose Songs</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                {selectedIndices.size === availableTracks.length ? (
                  <>
                    <Square size={13} />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <CheckSquare size={13} />
                    <span>Select All ({availableTracks.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs in playlist..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Track List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.03]">
            {filteredTracks.map((track) => {
              const isSelected = selectedIndices.has(track.index);
              const isDownloaded = isDownloadedSync(track.id, format);
              const isQueued = isQueuedSync(track.id);

              return (
                <div
                  key={track.id}
                  onClick={() => handleToggleTrack(track.index)}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'opacity-60 hover:opacity-90'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 bg-black/40 border-white/20 cursor-pointer"
                  />

                  <span className="text-[11px] font-mono text-zinc-500 w-5 shrink-0">
                    {track.index.toString().padStart(2, '0')}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{track.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {track.author && (
                        <span className="text-[10px] text-zinc-400 truncate">{track.author}</span>
                      )}
                      {isDownloaded && (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                          ✓ Downloaded
                        </span>
                      )}
                      {isQueued && (
                        <span className="text-[10px] text-indigo-300 font-semibold">
                          • In Queue
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                    {track.durationFormatted}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Selection Controls */}
          <div className="sticky bottom-0 pt-3 pb-1 bg-zinc-950/90 backdrop-blur-md border-t border-white/[0.06] flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-300 font-medium">
              <strong className="text-white font-bold">{selectedCount}</strong> selected
            </span>

            <div className="flex items-center gap-2">
              {/* LEFT: Download */}
              <button
                type="button"
                onClick={selectedCount === availableTracks.length ? handleDownloadPlaylistAll : handleDownloadSelectedTracks}
                disabled={isSubmitting || selectedCount === 0}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold gradient-accent text-white hover:opacity-95 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>
                  {selectedCount === availableTracks.length
                    ? `Download All ${availableTracks.length}`
                    : `Download ${selectedCount}`}
                </span>
              </button>

              {/* RIGHT: Add to Queue */}
              <button
                type="button"
                onClick={selectedCount === availableTracks.length ? handleAddPlaylistAllToQueue : handleAddSelectedTracksToQueue}
                disabled={isSubmitting || selectedCount === 0}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 hover:text-white border border-white/[0.08] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>
                  {selectedCount === availableTracks.length
                    ? `Add ${availableTracks.length} to Queue`
                    : `Add ${selectedCount} to Queue`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODALS --- */}

      {/* 1. Single Track Duplicate Confirmation Modal */}
      {singleDuplicateModal?.open && metadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 border border-white/[0.1] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-base text-white">Already downloaded</h3>
              </div>
              <button
                type="button"
                onClick={() => setSingleDuplicateModal(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <strong className="text-white">&ldquo;{metadata.title}&rdquo;</strong> has already been downloaded in {format.toUpperCase()} format.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setSingleDuplicateModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSingleJob(singleDuplicateModal.action)}
                className="px-4 py-2 rounded-xl text-xs font-semibold gradient-accent text-white hover:opacity-95 transition-opacity cursor-pointer shadow-md"
              >
                {singleDuplicateModal.action === 'download' ? 'Download Again' : 'Add Again'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Playlist Previously Downloaded Batch Modal */}
      {playlistConflictModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 border border-white/[0.1] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-base text-white">Previously Downloaded Tracks</h3>
              </div>
              <button
                type="button"
                onClick={() => setPlaylistConflictModal(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <strong className="text-amber-300">{playlistConflictModal.conflicts.length}</strong> of these{' '}
              {playlistConflictModal.tracksToQueue.length} tracks were already downloaded in {format.toUpperCase()} format.
              What would you like to do?
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const newTracks = playlistConflictModal.tracksToQueue.filter(
                    (t) => !isDownloadedSync(t.id, format)
                  );
                  executePlaylistBatch(newTracks, playlistConflictModal.action);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer text-center shadow-md"
              >
                {playlistConflictModal.action === 'download'
                  ? `Download Only New Tracks (${playlistConflictModal.tracksToQueue.length - playlistConflictModal.conflicts.length})`
                  : `Add Only New Tracks (${playlistConflictModal.tracksToQueue.length - playlistConflictModal.conflicts.length})`}
              </button>

              <button
                type="button"
                onClick={() => {
                  executePlaylistBatch(playlistConflictModal.tracksToQueue, playlistConflictModal.action);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 transition-colors cursor-pointer text-center"
              >
                {playlistConflictModal.action === 'download'
                  ? `Download All ${playlistConflictModal.tracksToQueue.length} Again`
                  : `Add All ${playlistConflictModal.tracksToQueue.length} Again`}
              </button>

              <button
                type="button"
                onClick={() => setPlaylistConflictModal(null)}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Playlist Already in Queue Batch Modal */}
      {playlistQueuedModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 border border-white/[0.1] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-indigo-400">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-base text-white">Tracks Already in Queue</h3>
              </div>
              <button
                type="button"
                onClick={() => setPlaylistQueuedModal(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <strong className="text-indigo-300">{playlistQueuedModal.conflicts.length}</strong> tracks are already in your active queue.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const remaining = playlistQueuedModal.tracksToQueue.filter(
                    (t) => !isQueuedSync(t.id)
                  );
                  executePlaylistBatch(remaining, playlistQueuedModal.action);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer text-center shadow-md"
              >
                Add Remaining {playlistQueuedModal.tracksToQueue.length - playlistQueuedModal.conflicts.length}
              </button>

              <button
                type="button"
                onClick={() => {
                  executePlaylistBatch(playlistQueuedModal.tracksToQueue, playlistQueuedModal.action);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 transition-colors cursor-pointer text-center"
              >
                Add All {playlistQueuedModal.tracksToQueue.length} Again
              </button>

              <button
                type="button"
                onClick={() => setPlaylistQueuedModal(null)}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
