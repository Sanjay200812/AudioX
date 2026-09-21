'use client';

import React from 'react';
import Link from 'next/link';

interface AudioXLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export function AudioXLogo({ size = 'md', showTagline = false }: AudioXLogoProps) {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 44 : 32;
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <Link href="/" className="inline-flex items-center gap-3 group select-none">
      {/* Waveform + X Geometry Minimal Logo */}
      <div
        className="relative flex items-center justify-center rounded-xl p-2 transition-transform duration-300 group-hover:scale-105"
        style={{
          width: iconSize + 12,
          height: iconSize + 12,
          background: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(99,102,241,0.22) 50%, rgba(59,130,246,0.18) 100%)',
          border: '1px solid rgba(124,58,237,0.3)',
          boxShadow: '0 0 20px -5px rgba(99,102,241,0.35)',
        }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Crossing waveform lines forming geometric X */}
          <path
            d="M6 6L26 26"
            stroke="url(#logo-grad-1)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M26 6L6 26"
            stroke="url(#logo-grad-2)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* Audio spectrum dots at intersection */}
          <circle cx="16" cy="16" r="2.5" fill="#FFFFFF" />
          <circle cx="16" cy="8" r="1.5" fill="#6366F1" />
          <circle cx="16" cy="24" r="1.5" fill="#8B5CF6" />
          <circle cx="8" cy="16" r="1.5" fill="#3B82F6" />
          <circle cx="24" cy="16" r="1.5" fill="#A855F7" />

          <defs>
            <linearGradient id="logo-grad-1" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7C3AED" />
              <stop offset="0.5" stopColor="#6366F1" />
              <stop offset="1" stopColor="#3B82F6" />
            </linearGradient>
            <linearGradient id="logo-grad-2" x1="26" y1="6" x2="6" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6" />
              <stop offset="0.5" stopColor="#8B5CF6" />
              <stop offset="1" stopColor="#EC4899" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`font-black tracking-tight ${textSize} text-white font-sans`}>
            Audio<span className="gradient-accent-text">X</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/10 text-zinc-400 border border-white/5">
            PRO
          </span>
        </div>
        {showTagline && (
          <span className="text-xs text-zinc-400 tracking-wide font-normal">
            Your Audio. Offline.
          </span>
        )}
      </div>
    </Link>
  );
}
