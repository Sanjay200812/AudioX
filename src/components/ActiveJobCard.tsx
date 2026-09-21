'use client';

import React from 'react';
import Image from 'next/image';
import { ClientQueueJob } from '@/lib/types';
import { SourceBadge } from './SourceBadge';
import { useAudioX } from '@/context/AudioXContext';
import {
  Music,
  Download,
  XCircle,
  SkipForward,
  CheckCircle2,
} from 'lucide-react';

interface ActiveJobCardProps {
  job: ClientQueueJob;
  totalInPlaylist?: number;
}

export function ActiveJobCard({ job, totalInPlaylist }: ActiveJobCardProps) {
  const { cancelJob, skipJob, downloadTrackManually } = useAudioX();

  const getStageLabel = () => {
    switch (job.stage) {
      case 'preparing':
        return 'Preparing job workspace...';
      case 'fetching':
        return 'Fetching media stream...';
      case 'extracting':
        return 'Extracting source audio...';
      case 'converting':
        return `Converting to ${job.format.toUpperCase()} (${job.quality})...`;
      case 'metadata':
      case 'finalizing':
        return 'Embedding metadata & artwork...';
      case 'ready':
        return 'Ready to download';
      default:
        return 'Processing audio...';
    }
  };

  const isReady = job.status === 'ready';

  return (
    <div className="w-full rounded-2xl glass-panel p-5 sm:p-6 border border-indigo-500/30 shadow-[0_0_40px_-10px_rgba(99,102,241,0.25)] relative overflow-hidden">
      {/* Background glow gradient */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start gap-4 relative z-10">
        {/* Thumbnail with status indicator */}
        <div className="relative w-full sm:w-44 h-36 sm:h-28 rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.08] shrink-0">
          {job.thumbnail ? (
            <Image
              src={job.thumbnail}
              alt={job.title}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Music size={32} />
            </div>
          )}

          <div className="absolute top-2 left-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/80 backdrop-blur-md text-indigo-300 border border-indigo-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
              Active
            </span>
          </div>
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <SourceBadge source={job.source} isPlaylist={!!job.playlistId} size="sm" />
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white/10 text-white">
              {job.format.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-white/5 capitalize">
              {job.quality}
            </span>

            {job.playlistIndex && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/20">
                Track {job.playlistIndex}{totalInPlaylist ? ` of ${totalInPlaylist}` : ''}
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">
            {job.title}
          </h3>

          {job.artist && (
            <p className="text-xs text-zinc-400 mt-1 font-medium line-clamp-1">{job.artist}</p>
          )}

          {job.playlistTitle && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Playlist: <span className="text-zinc-400">{job.playlistTitle}</span>
            </p>
          )}
        </div>
      </div>

      {/* Live Progress Section */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] relative z-10">
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            {isReady ? (
              <CheckCircle2 size={15} className="text-emerald-400" />
            ) : (
              <div className="flex items-center gap-1 h-3">
                <span className="w-1 bg-indigo-400 rounded-full animate-[waveBar_0.8s_infinite_ease-in-out]" />
                <span className="w-1 bg-indigo-400 rounded-full animate-[waveBar_0.8s_infinite_0.2s_ease-in-out]" />
                <span className="w-1 bg-indigo-400 rounded-full animate-[waveBar_0.8s_infinite_0.4s_ease-in-out]" />
              </div>
            )}
            <span>{getStageLabel()}</span>
          </div>
          <span className="font-mono font-bold text-sm text-white">{job.progress}%</span>
        </div>

        {/* Smooth Animated Progress Bar */}
        <div className="w-full h-2 rounded-full bg-black/60 border border-white/5 overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              isReady
                ? 'bg-emerald-500'
                : 'gradient-accent shadow-[0_0_12px_rgba(99,102,241,0.6)]'
            }`}
            style={{ width: `${Math.max(5, job.progress)}%` }}
          />
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex items-center justify-between gap-2">
          {/* Left: Skip button */}
          <button
            type="button"
            onClick={() => skipJob(job.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Skip this track and process the next one"
          >
            <SkipForward size={14} />
            <span>Skip</span>
          </button>

          {/* Right: Cancel or Download & Continue */}
          <div className="flex items-center gap-2">
            {isReady ? (
              <button
                type="button"
                onClick={() => downloadTrackManually(job)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Download size={14} />
                <span>Download & Continue</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => cancelJob(job.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <XCircle size={14} />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
