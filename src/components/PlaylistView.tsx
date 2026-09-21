'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { PlaylistMetadata, AudioFormat, AudioQuality } from '@/lib/types';
import { SourceBadge } from './SourceBadge';
import { FormatSelector } from './FormatSelector';
import { QualitySelector } from './QualitySelector';
import { useAudioX } from '@/context/AudioXContext';
import { useRouter } from 'next/navigation';
import {
  ListMusic,
  Clock,
  Search,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  CheckCircle2,
  Download,
} from 'lucide-react';

interface PlaylistViewProps {
  playlist: PlaylistMetadata;
  onDone?: () => void;
}

export function PlaylistView({ playlist, onDone }: PlaylistViewProps) {
  const { settings, addPlaylistBatch, jobs } = useAudioX();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(playlist.tracks.map((t) => t.index))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'selected'>('all');
  const [format, setFormat] = useState<AudioFormat>(settings.defaultFormat);
  const [quality, setQuality] = useState<AudioQuality>(settings.defaultQuality);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Set of track URLs or titles already in the queue
  const queuedTrackIds = useMemo(() => {
    return new Set(jobs.map((j) => j.mediaId));
  }, [jobs]);

  // Filtered tracks list
  const filteredTracks = useMemo(() => {
    return playlist.tracks.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.author && t.author.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesFilter =
        filterMode === 'all' || (filterMode === 'selected' && selectedIndices.has(t.index));

      return matchesSearch && matchesFilter;
    });
  }, [playlist.tracks, searchQuery, filterMode, selectedIndices]);

  const toggleSelectAll = () => {
    if (selectedIndices.size === playlist.tracks.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(playlist.tracks.map((t) => t.index)));
    }
  };

  const toggleTrack = (index: number) => {
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

  const router = useRouter();

  const handleDownloadSelected = async () => {
    const selectedTracks = playlist.tracks.filter((t) => selectedIndices.has(t.index));
    if (selectedTracks.length === 0) return;

    setIsSubmitting(true);
    try {
      await addPlaylistBatch({
        tracks: selectedTracks,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        format,
        quality,
        startImmediately: true,
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        router.push('/queue');
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueueSelected = async () => {
    const selectedTracks = playlist.tracks.filter((t) => selectedIndices.has(t.index));
    if (selectedTracks.length === 0) return;

    setIsSubmitting(true);
    try {
      await addPlaylistBatch({
        tracks: selectedTracks,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        format,
        quality,
        startImmediately: false,
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onDone?.();
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      {/* Playlist Header Card */}
      <div className="rounded-2xl glass-panel p-5 sm:p-6 border border-white/[0.08] shadow-2xl flex flex-col sm:flex-row items-start gap-5">
        <div className="relative w-full sm:w-44 h-40 sm:h-36 rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.08] shrink-0">
          {playlist.thumbnail ? (
            <Image
              src={playlist.thumbnail}
              alt={playlist.title}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900">
              <ListMusic size={36} />
            </div>
          )}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-semibold text-white">
            {playlist.trackCount} Tracks
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <SourceBadge source="youtube_playlist" size="sm" />
            <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
              <Clock size={12} />
              {playlist.totalDurationFormatted} total
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {playlist.title}
          </h2>

          {playlist.author && (
            <p className="text-xs text-zinc-400 mt-1 font-medium">{playlist.author}</p>
          )}

          <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
            Playlist tracks will be queued individually and processed sequentially. Each track is downloaded as an independent audio file (No ZIP).
          </p>
        </div>
      </div>

      {/* Track List Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/[0.06]">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks in playlist..."
            className="w-full bg-black/40 border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Filter Pills and Select All */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 transition-colors cursor-pointer"
          >
            {selectedIndices.size === playlist.tracks.length ? (
              <>
                <CheckSquare size={14} className="text-indigo-400" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square size={14} className="text-zinc-500" />
                <span>Select All</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                filterMode === 'all' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({playlist.tracks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('selected')}
              className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                filterMode === 'selected' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Selected ({selectedIndices.size})
            </button>
          </div>
        </div>
      </div>

      {/* Tracks Container */}
      <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
        {filteredTracks.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-white/[0.02] rounded-xl border border-white/[0.04]">
            No matching tracks found.
          </div>
        ) : (
          filteredTracks.map((track) => {
            const isSelected = selectedIndices.has(track.index);
            const isAlreadyQueued = queuedTrackIds.has(track.id);

            return (
              <div
                key={track.id || track.index}
                onClick={() => toggleTrack(track.index)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                  isSelected
                    ? 'bg-white/[0.06] border-indigo-500/30 shadow-sm'
                    : 'bg-white/[0.02] border-white/[0.04] opacity-75 hover:opacity-100 hover:bg-white/[0.04]'
                }`}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  aria-label={`Select track ${track.index}`}
                  className="shrink-0 p-1 text-zinc-400"
                >
                  {isSelected ? (
                    <CheckSquare size={17} className="text-indigo-400" />
                  ) : (
                    <Square size={17} className="text-zinc-600" />
                  )}
                </button>

                {/* Index */}
                <span className="w-6 text-center text-xs font-mono text-zinc-500 shrink-0">
                  {track.index < 10 ? `0${track.index}` : track.index}
                </span>

                {/* Thumbnail */}
                <div className="relative w-12 h-9 rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/5">
                  {track.thumbnail ? (
                    <Image
                      src={track.thumbnail}
                      alt={track.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <ListMusic size={14} />
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
                    {track.title}
                  </h4>
                  {track.author && (
                    <p className="text-[11px] text-zinc-400 truncate">{track.author}</p>
                  )}
                </div>

                {/* Duration */}
                <span className="text-xs font-mono text-zinc-400 shrink-0">
                  {track.durationFormatted}
                </span>

                {/* Queue status if already in queue */}
                {isAlreadyQueued && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-zinc-300 shrink-0">
                    Queued
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-20 md:bottom-6 z-30 p-3.5 sm:p-4 rounded-2xl glass-dropdown border border-white/[0.12] shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between sm:justify-start gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">
              {selectedIndices.size}
            </span>
            <span className="text-xs text-zinc-400">tracks selected</span>
          </div>

          <div className="flex items-center gap-2">
            <FormatSelector value={format} onChange={setFormat} size="sm" />
            <QualitySelector value={quality} onChange={setQuality} size="sm" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedIndices.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIndices(new Set())}
              className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadSelected}
            disabled={selectedIndices.size === 0 || isSubmitting || isSuccess}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white transition-all duration-200 cursor-pointer shadow-lg disabled:opacity-40 disabled:pointer-events-none ${
              isSuccess
                ? 'bg-emerald-500'
                : 'gradient-accent hover:opacity-95 active:scale-[0.98] shadow-indigo-600/25'
            }`}
          >
            {isSuccess ? (
              <>
                <CheckCircle2 size={16} />
                <span>Downloading Tracks...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>
                  {selectedIndices.size === playlist.tracks.length
                    ? `Download All ${playlist.tracks.length}`
                    : `Download ${selectedIndices.size}`}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleQueueSelected}
            disabled={selectedIndices.size === 0 || isSubmitting || isSuccess}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-zinc-200 bg-white/[0.08] hover:bg-white/[0.14] hover:text-white border border-white/[0.1] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <Plus size={16} />
            <span>
              {selectedIndices.size === playlist.tracks.length
                ? `Add ${playlist.tracks.length} Tracks to Queue`
                : `Add ${selectedIndices.size} to Queue`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
