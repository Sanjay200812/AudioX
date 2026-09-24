'use client';

import React, { useState } from 'react';
import { URLInput } from '@/components/URLInput';
import { MediaResultCard } from '@/components/MediaResultCard';
import { BrowserBlockedNotice } from '@/components/BrowserBlockedNotice';
import { SessionRecoveryBanner } from '@/components/SessionRecoveryBanner';
import { SingleMediaMetadata, PlaylistMetadata } from '@/lib/types';
import { Shield } from 'lucide-react';
import { YouTubeIcon } from '@/components/BrandIcons';

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<SingleMediaMetadata | null>(null);
  const [playlistResult, setPlaylistResult] = useState<PlaylistMetadata | null>(null);

  const handleAnalyze = async (url: string, forcePlaylist = false) => {
    setIsLoading(true);
    setError(null);
    setSingleResult(null);
    setPlaylistResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, forcePlaylist }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze YouTube link.');
      }

      if (data.type === 'playlist' && data.playlist) {
        setPlaylistResult(data.playlist);
        setSingleResult(data.single || null);
      } else if (data.single) {
        setSingleResult(data.single);
        setPlaylistResult(null);
      } else {
        throw new Error('No audio tracks detected at this link.');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('Analysis timed out. Please check your connection or link and retry.');
      } else {
        setError(err.message || 'An unexpected error occurred while analyzing URL.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSingleResult(null);
    setPlaylistResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center justify-center py-4 sm:py-8">
      <BrowserBlockedNotice />
      <SessionRecoveryBanner />

      {/* Hero Section */}
      {!singleResult && !playlistResult && (
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10 animate-in fade-in slide-in-from-bottom-3 duration-500">
          {/* Subtle Accent Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-400 mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
            <span>Private Personal Media Utility</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Turn YouTube media into <span className="gradient-accent-text">offline audio</span>
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            For media you own, have permission to use, or are otherwise legally permitted to download.
          </p>
        </div>
      )}

      {/* Main Interactive Work Area */}
      <div className="w-full">
        {playlistResult || singleResult ? (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className="mb-4 flex items-center justify-between max-w-2xl mx-auto px-1">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                ← Analyze another YouTube URL
              </button>
            </div>
            <MediaResultCard
              metadata={singleResult}
              playlist={playlistResult}
              onDone={handleReset}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <URLInput onAnalyze={(url) => handleAnalyze(url)} isLoading={isLoading} error={error} />

            {/* Supported platforms strip: YouTube videos, shorts & playlists */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500">
              <span className="flex items-center gap-2">
                <YouTubeIcon size={16} className="text-red-400/80" />
                <span>YouTube Single Videos, Shorts & Playlists</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Compliance & Privacy Footer Notice */}
      <div className="mt-16 sm:mt-24 text-center max-w-md mx-auto text-xs text-zinc-500 leading-relaxed border-t border-white/[0.04] pt-6 flex flex-col items-center gap-1.5">
        <Shield size={14} className="text-zinc-600" />
        <p>
          AudioX is intended for media you own, have permission to use, or are otherwise legally permitted to download. All media is processed strictly in temporary storage.
        </p>
      </div>
    </div>
  );
}
