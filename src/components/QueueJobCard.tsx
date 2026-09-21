'use client';

import React from 'react';
import Image from 'next/image';
import { ClientQueueJob } from '@/lib/types';
import { useAudioX } from '@/context/AudioXContext';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  RotateCcw,
  Music,
  CheckCircle,
  AlertCircle,
  Clock,
  Download,
  SkipForward,
} from 'lucide-react';

interface QueueJobCardProps {
  job: ClientQueueJob;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}

export function QueueJobCard({ job, index, isFirst, isLast }: QueueJobCardProps) {
  const { reorderJob, removeJob, retryJob, downloadTrackManually } = useAudioX();

  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isSkipped = job.status === 'skipped';
  const isQueued = job.status === 'queued';
  const isReady = job.status === 'ready';

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
        isFailed
          ? 'bg-red-500/[0.04] border-red-500/20'
          : isSkipped
          ? 'bg-amber-500/[0.03] border-amber-500/15'
          : isCompleted
          ? 'bg-emerald-500/[0.03] border-emerald-500/15 opacity-85'
          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
      }`}
    >
      {/* Reorder Buttons (Only for queued waiting jobs) */}
      {isQueued && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => reorderJob(job.id, 'up')}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Move Up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => reorderJob(job.id, 'down')}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Move Down"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {/* Track Position */}
      <span className="w-6 text-center text-xs font-mono text-zinc-500 shrink-0">
        {job.playlistIndex !== undefined
          ? (job.playlistIndex < 10 ? `0${job.playlistIndex}` : job.playlistIndex)
          : (index < 9 ? `0${index + 1}` : index + 1)}
      </span>

      {/* Thumbnail */}
      <div className="relative w-12 h-10 rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shrink-0">
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
            <Music size={16} />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <h4 className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
          {job.title}
        </h4>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
          <span className="font-mono text-zinc-300 font-medium">
            {job.format.toUpperCase()} • {job.quality}
          </span>
          {job.artist && <span className="truncate hidden sm:inline">• {job.artist}</span>}
          {job.error && (
            <span className="text-red-400 font-medium truncate flex items-center gap-1">
              <AlertCircle size={11} />
              {job.error}
            </span>
          )}
        </div>
      </div>

      {/* Status Badge & Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {isQueued && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 flex items-center gap-1">
            <Clock size={10} />
            Waiting
          </span>
        )}

        {isReady && (
          <button
            type="button"
            onClick={() => downloadTrackManually(job)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={12} />
            Download
          </button>
        )}

        {isCompleted && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle size={10} />
            Completed
          </span>
        )}

        {isSkipped && (
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20 flex items-center gap-1">
              <SkipForward size={10} />
              Skipped
            </span>
            <button
              type="button"
              onClick={() => retryJob(job.id)}
              className="px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-300 hover:text-white bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {isFailed && !['LOGIN_REQUIRED', 'AGE_RESTRICTED', 'PRIVATE_VIDEO', 'VIDEO_UNAVAILABLE'].includes(job.errorCode || '') && (
          <button
            type="button"
            onClick={() => retryJob(job.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={12} />
            Retry {job.retryCount > 0 ? `(Attempt ${job.retryCount + 1})` : ''}
          </button>
        )}

        {isFailed && ['LOGIN_REQUIRED', 'AGE_RESTRICTED', 'PRIVATE_VIDEO', 'VIDEO_UNAVAILABLE'].includes(job.errorCode || '') && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-300 border border-red-500/20">
            Access Restricted
          </span>
        )}

        {/* Remove Action */}
        <button
          type="button"
          onClick={() => removeJob(job.id)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          title="Remove"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
