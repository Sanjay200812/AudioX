'use client';

import React from 'react';
import { AudioQuality } from '@/lib/types';
import { Sparkles, Info } from 'lucide-react';

interface QualitySelectorProps {
  value: AudioQuality;
  onChange: (quality: AudioQuality) => void;
  size?: 'sm' | 'md';
  showHelpText?: boolean;
}

export function QualitySelector({
  value,
  onChange,
  size = 'md',
  showHelpText = false,
}: QualitySelectorProps) {
  // Normalize value to 3 tiers: standard, high, best
  const currentTier: AudioQuality =
    value === '128k'
      ? 'standard'
      : value === '192k'
      ? 'high'
      : value === '256k' || value === '320k' || value === 'best'
      ? 'best'
      : (value as AudioQuality) || 'high';

  const tiers: { id: AudioQuality; label: string; sub: string }[] = [
    { id: 'standard', label: 'Standard', sub: '~128 kbps' },
    { id: 'high', label: 'High', sub: '~192 kbps' },
    { id: 'best', label: 'Best Available', sub: 'Max Source' },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
        {tiers.map((tier) => {
          const isSelected = currentTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onChange(tier.id)}
              className={`flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-200 cursor-pointer ${
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm'
              } ${
                isSelected
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
            >
              {tier.id === 'best' && <Sparkles size={11} className={isSelected ? 'text-amber-200' : 'text-zinc-500'} />}
              <span>{tier.label}</span>
              <span className={`text-[10px] hidden sm:inline ${isSelected ? 'text-indigo-200' : 'text-zinc-500'}`}>
                ({tier.sub})
              </span>
            </button>
          );
        })}
      </div>

      {showHelpText && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-500 pl-1">
          <Info size={11} className="shrink-0 text-zinc-400" />
          <span>Actual quality depends on the original source stream.</span>
        </div>
      )}
    </div>
  );
}
