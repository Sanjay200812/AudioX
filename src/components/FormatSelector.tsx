'use client';

import React from 'react';
import { AudioFormat } from '@/lib/types';

interface FormatSelectorProps {
  value: AudioFormat;
  onChange: (format: AudioFormat) => void;
  size?: 'sm' | 'md';
}

export function FormatSelector({ value, onChange, size = 'md' }: FormatSelectorProps) {
  const formats: { id: AudioFormat; label: string; desc: string }[] = [
    { id: 'mp3', label: 'MP3', desc: 'Universal' },
    { id: 'm4a', label: 'M4A', desc: 'AAC Quality' },
  ];

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
      {formats.map((fmt) => {
        const isSelected = value === fmt.id;
        return (
          <button
            key={fmt.id}
            type="button"
            onClick={() => onChange(fmt.id)}
            className={`flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            } ${
              isSelected
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
            }`}
          >
            <span>{fmt.label}</span>
            <span
              className={`text-[10px] hidden sm:inline ${
                isSelected ? 'text-indigo-200' : 'text-zinc-500'
              }`}
            >
              ({fmt.desc})
            </span>
          </button>
        );
      })}
    </div>
  );
}
