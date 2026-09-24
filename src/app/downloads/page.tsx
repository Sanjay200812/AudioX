'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAudioX } from '@/context/AudioXContext';
import { SourceBadge } from '@/components/SourceBadge';
import { AudioPreviewPlayer } from '@/components/AudioPreviewPlayer';
import { getAudioBlobFromIndexedDB } from '@/lib/storage/indexeddb';
import { DownloadHistoryItem } from '@/lib/types';
import {
  Download,
  Trash2,
  Music,
  HardDrive,
  Calendar,
  Disc3,
} from 'lucide-react';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DownloadsPage() {
  const { history, clearHistory, removeHistoryItem, addToast } = useAudioX();

  const handleDownloadAgain = async (item: DownloadHistoryItem) => {
    try {
      // 1. Try local IndexedDB blob first (instant offline download!)
      const blob = await getAudioBlobFromIndexedDB(item.id);
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = item.fileName || `${item.title}.${item.format}`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          if (link.parentNode) link.parentNode.removeChild(link);
        }, 1000);
        addToast(`Downloading ${item.fileName || 'audio'} (offline cache)`, 'success');
        return;
      }

      // 2. Fall back to remote worker authorized stream with both token and jobId
      const jobId = item.jobId || item.id;
      if (item.downloadToken && jobId) {
        const link = document.createElement('a');
        link.href = `/api/download/${encodeURIComponent(item.downloadToken)}?jobId=${encodeURIComponent(jobId)}`;
        link.download = item.fileName || `${item.title}.${item.format}`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
        }, 1000);
        addToast(`Downloading ${item.fileName || 'audio'}`, 'success');
        return;
      }

      addToast('Audio download has expired on worker. Please re-queue the track.', 'error');
    } catch {
      addToast('Failed to download audio file.', 'error');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Download className="text-indigo-400" size={28} />
            <span>Recently Processed</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Verify audio quality with instant preview before saving offline
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-red-400 hover:bg-white/[0.05] transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Trash2 size={14} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History List or Empty State */}
      {history.length === 0 ? (
        <div className="rounded-2xl glass-panel p-10 sm:p-16 border border-white/[0.08] flex flex-col items-center justify-center text-center my-6">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-500 mb-4">
            <Music size={32} />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Your completed tracks will appear here
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mt-1.5 mb-6 leading-relaxed">
            As your queued YouTube tracks finish conversion and download to your device, they will be logged here for audio verification.
          </p>
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white gradient-accent shadow-lg shadow-indigo-600/25 hover:opacity-95 transition-all"
          >
            <Disc3 size={16} />
            <span>Analyze YouTube Link</span>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 sm:p-4 rounded-xl glass-panel border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                {/* Thumbnail */}
                <div className="relative w-14 h-12 rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shrink-0">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <Music size={18} />
                    </div>
                  )}
                </div>

                {/* Title & Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <SourceBadge source={item.source} size="sm" />
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white/10 text-white">
                      {item.format.toUpperCase()}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-zinc-400 bg-white/5 capitalize">
                      {item.quality}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
                    {item.title}
                  </h4>

                  {item.artist && (
                    <p className="text-[11px] text-zinc-400 truncate">{item.artist}</p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                    {item.fileSizeFormatted && (
                      <span className="flex items-center gap-1 font-mono">
                        <HardDrive size={10} />
                        {item.fileSizeFormatted}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {formatDate(item.completedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Audio Player & Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                <AudioPreviewPlayer id={item.id} token={item.downloadToken} jobId={item.jobId || item.id} />

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => handleDownloadAgain(item)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeHistoryItem(item.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Remove from history"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
