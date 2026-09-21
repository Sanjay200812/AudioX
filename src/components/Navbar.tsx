'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioXLogo } from './AudioXLogo';
import { useAudioX } from '@/context/AudioXContext';
import { Disc3, ListOrdered, Download, Settings } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { jobs } = useAudioX();

  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const pendingCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'preparing' || j.status === 'fetching' || j.status === 'converting'
  ).length;

  const navItems = [
    { label: 'Home', href: '/', icon: Disc3 },
    { label: 'Queue', href: '/queue', icon: ListOrdered, badge: pendingCount > 0 ? pendingCount : null },
    { label: 'Downloads', href: '/downloads', icon: Download },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#070707]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <AudioXLogo size="md" />

        {/* Center/Right: Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white bg-white/[0.08] shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-indigo-400' : 'text-zinc-500'} />
                <span>{item.label}</span>

                {item.badge !== null && item.badge !== undefined && (
                  <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm min-w-[18px]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right subtle status */}
        <div className="hidden md:flex items-center gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
}
