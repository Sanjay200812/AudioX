'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, X, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { validateMediaUrl } from '@/lib/security/ssrf';
import { SourceBadge } from './SourceBadge';

interface URLInputProps {
  onAnalyze: (url: string) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

export function URLInput({ onAnalyze, isLoading, error }: URLInputProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [detectedType, setDetectedType] = useState<'youtube' | 'youtube_playlist' | null>(null);
  const [hasPlaylistParam, setHasPlaylistParam] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  const loadingMessages = [
    'Analyzing YouTube media stream...',
    'Fetching audio metadata...',
    'Preparing audio presets...',
    'Checking track availability...',
  ];

  useEffect(() => {
    if (!isLoading) {
      setLoadingTextIndex(0);
      setIsTakingLonger(false);
      return;
    }

    // Message cycler
    const interval = setInterval(() => {
      setLoadingTextIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 1800);

    // Timeout notice after 6 seconds
    const longTimer = setTimeout(() => {
      setIsTakingLonger(true);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(longTimer);
    };
  }, [isLoading, loadingMessages.length]);

  // Real-time URL format & source detection
  useEffect(() => {
    if (!inputUrl.trim()) {
      setDetectedType(null);
      setHasPlaylistParam(false);
      return;
    }
    const validation = validateMediaUrl(inputUrl);
    if (validation.isValid && validation.source && validation.source !== 'local') {
      setDetectedType(validation.source);
      setHasPlaylistParam(!!validation.hasPlaylistParam);
    } else {
      setDetectedType(null);
      setHasPlaylistParam(false);
    }
  }, [inputUrl]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUrl.trim()) return;
    onAnalyze(inputUrl.trim());
  };

  const handleRetry = () => {
    if (!inputUrl.trim()) return;
    onAnalyze(inputUrl.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
      }
    } catch {}
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2 p-2 rounded-2xl bg-zinc-900/70 border border-white/[0.1] shadow-2xl backdrop-blur-2xl transition-all duration-300 focus-within:border-indigo-500/60 focus-within:shadow-[0_0_30px_-5px_rgba(99,102,241,0.25)]">
          {/* Input field */}
          <div className="relative flex-1 flex items-center min-w-0 pl-3">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste YouTube video or playlist URL..."
              disabled={isLoading}
              className="w-full bg-transparent text-white placeholder-zinc-500 text-sm sm:text-base outline-none pr-8 py-2 disabled:opacity-50"
            />

            {/* Clear or Paste Button */}
            {inputUrl ? (
              <button
                type="button"
                onClick={() => setInputUrl('')}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Clear input"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePaste}
                className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-white px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/10 border border-white/5 transition-all"
              >
                Paste
              </button>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="submit"
            disabled={!inputUrl.trim() || isLoading}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white gradient-accent hover:opacity-95 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-indigo-600/25"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 h-4">
                  <span className="w-1 bg-white rounded-full animate-[waveBar_0.8s_infinite_ease-in-out]" />
                  <span className="w-1 bg-white rounded-full animate-[waveBar_0.8s_infinite_0.2s_ease-in-out]" />
                  <span className="w-1 bg-white rounded-full animate-[waveBar_0.8s_infinite_0.4s_ease-in-out]" />
                </div>
                <span>Analyzing...</span>
              </div>
            ) : (
              <>
                <span>Analyze</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Live Detected Source Badge */}
        {detectedType && !isLoading && (
          <div className="mt-2.5 flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles size={13} className="text-indigo-400" />
              <span>Detected:</span>
              <SourceBadge source={detectedType} size="sm" />
              {hasPlaylistParam && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  + Playlist attached
                </span>
              )}
            </div>
            <span className="text-[11px] text-zinc-500">Press Enter to analyze</span>
          </div>
        )}

        {/* Loading Animated Spectrum */}
        {isLoading && (
          <div className="mt-4 p-4 rounded-xl glass-panel border border-indigo-500/20 flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-1.5 h-7">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-violet-500 to-indigo-400"
                  style={{
                    animation: `waveBar 1s infinite ease-in-out ${i * 0.12}s`,
                    height: `${10 + (i % 4) * 6}px`,
                  }}
                />
              ))}
            </div>
            <p className="text-xs font-medium text-zinc-300 tracking-wide">
              {loadingMessages[loadingTextIndex]}
            </p>

            {/* Taking longer than expected notice + Retry option */}
            {isTakingLonger && (
              <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 w-full max-w-md animate-in fade-in duration-300">
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <Clock size={15} className="shrink-0 text-amber-400" />
                  <span>Analysis is taking longer than expected.</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors border border-amber-500/30"
                >
                  <RefreshCw size={12} />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message with Retry button */}
        {error && !isLoading && (
          <div className="mt-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3 text-xs text-red-300">
            <div className="flex items-start gap-2.5 flex-1 leading-relaxed">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-red-200">Unable to analyze media: </span>
                {error}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-medium text-xs border border-red-500/30 transition-colors shrink-0"
            >
              <RefreshCw size={12} />
              <span>Retry</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
