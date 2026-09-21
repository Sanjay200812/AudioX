'use client';

import React from 'react';
import { useAudioX } from '@/context/AudioXContext';
import { AlertTriangle, X } from 'lucide-react';

export function BrowserBlockedNotice() {
  const { isBrowserDownloadBlocked, clearBrowserBlockedNotice } = useAudioX();

  if (!isBrowserDownloadBlocked) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs text-amber-200 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={18} className="text-amber-400 shrink-0" />
        <div>
          <span className="font-semibold text-white">Browser blocked automatic downloads: </span>
          <span>Please click the lock/shield icon in your browser address bar and enable automatic downloads for AudioX.</span>
        </div>
      </div>

      <button
        type="button"
        onClick={clearBrowserBlockedNotice}
        className="p-1 rounded-md text-amber-400 hover:text-white hover:bg-amber-500/20"
      >
        <X size={14} />
      </button>
    </div>
  );
}
