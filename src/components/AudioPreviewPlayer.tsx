'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { getAudioBlobFromIndexedDB } from '@/lib/storage/indexeddb';

interface AudioPreviewPlayerProps {
  id?: string;
  token?: string;
  jobId?: string;
}

export function AudioPreviewPlayer({ id, token, jobId }: AudioPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isBlobSource, setIsBlobSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resolve audio source: IndexedDB blob first, then authorized worker stream
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function resolveSource() {
      setLoadError(null);

      // 1. Try local IndexedDB blob for true offline listening
      const lookupId = id || jobId;
      if (lookupId) {
        try {
          const blob = await getAudioBlobFromIndexedDB(lookupId);
          if (blob && active) {
            objectUrl = URL.createObjectURL(blob);
            setAudioSrc(objectUrl);
            setIsBlobSource(true);
            return;
          }
        } catch {}
      }

      // 2. Fall back to authorized remote proxy stream with both token and jobId
      if (token && jobId && active) {
        const streamUrl = `/api/download/${encodeURIComponent(token)}?jobId=${encodeURIComponent(jobId)}`;
        setAudioSrc(streamUrl);
        setIsBlobSource(false);
        return;
      }

      if (active) {
        setLoadError('Audio source expired or unavailable');
      }
    }

    resolveSource();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, token, jobId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setLoadError(null);
    };
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setIsPlaying(false);
      if (!isBlobSource) {
        setLoadError('Audio file has expired on worker');
      } else {
        setLoadError('Playback error');
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioSrc, isBlobSource]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const target = parseFloat(e.target.value);
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.06] text-[11px] text-zinc-500">
        <AlertCircle size={12} className="text-zinc-500 shrink-0" />
        <span className="truncate">{loadError}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-xl bg-black/50 border border-white/[0.08] w-full max-w-xs text-xs">
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}

      {/* Play/Pause */}
      <button
        type="button"
        disabled={!audioSrc}
        onClick={togglePlay}
        className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer shadow-sm"
        title={isPlaying ? 'Pause' : 'Play Preview'}
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
      </button>

      {/* Track progress bar */}
      <div className="flex-1 flex flex-col gap-0.5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Mute */}
      <button
        type="button"
        onClick={() => {
          if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
          }
        }}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
    </div>
  );
}
