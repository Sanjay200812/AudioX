'use client';

import React from 'react';
import Link from 'next/link';
import { useAudioX } from '@/context/AudioXContext';
import { RefreshCw, ListOrdered, Trash2, X } from 'lucide-react';

export function SessionRecoveryBanner() {
  const { unfinishedQueueSummary, dismissUnfinishedQueueBanner, clearPendingQueue } = useAudioX();

  if (!unfinishedQueueSummary) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mb-6 p-4 rounded-2xl glass-panel border border-indigo-500/30 bg-indigo-950/20 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <RefreshCw size={18} className="animate-spin-slow" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">
              You have an unfinished queue
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              <span className="font-semibold text-indigo-300">{unfinishedQueueSummary.completed}</span> of{' '}
              <span className="font-semibold text-white">{unfinishedQueueSummary.total}</span> tracks completed •{' '}
              <span className="text-zinc-300">{unfinishedQueueSummary.remaining} remaining</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissUnfinishedQueueBanner}
          className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            clearPendingQueue();
            dismissUnfinishedQueueBanner();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
          <span>Clear Queue</span>
        </button>

        <Link
          href="/queue"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer shadow-sm"
        >
          <ListOrdered size={14} />
          <span>View Queue</span>
        </Link>
      </div>
    </div>
  );
}
