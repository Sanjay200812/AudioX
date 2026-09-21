'use client';

import React from 'react';
import { MediaSource } from '@/lib/types';
import { HardDrive, ListMusic } from 'lucide-react';
import { YouTubeIcon } from './BrandIcons';

interface SourceBadgeProps {
  source: MediaSource | 'detected';
  isPlaylist?: boolean;
  size?: 'sm' | 'md';
}

export function SourceBadge({ source, isPlaylist, size = 'md' }: SourceBadgeProps) {
  const isSm = size === 'sm';
  const iconSize = isSm ? 12 : 14;

  if (isPlaylist || source === 'youtube_playlist') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 ${
          isSm ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <ListMusic size={iconSize} />
        YouTube Playlist
      </span>
    );
  }

  if (source === 'youtube') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-red-500/15 text-red-400 border border-red-500/30 ${
          isSm ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <YouTubeIcon size={iconSize} />
        YouTube
      </span>
    );
  }

  if (source === 'local') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ${
          isSm ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <HardDrive size={iconSize} />
        Local Media
      </span>
    );
  }

  return null;
}
