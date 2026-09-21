'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAudioX } from '@/context/AudioXContext';
import { Disc3, ListOrdered, Download, Settings } from 'lucide-react';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { jobs } = useAudioX();

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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0D0D0F]/90 backdrop-blur-2xl border-t border-white/[0.08] px-2 py-1.5 safe-area-bottom">
      <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 relative ${
                isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="relative">
                <Icon
                  size={20}
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-indigo-400' : 'text-zinc-500'
                  }`}
                />
                {item.badge !== null && item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white min-w-[16px] h-4">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium tracking-tight ${
                  isActive ? 'text-zinc-100 font-semibold' : 'text-zinc-500'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-indigo-500 mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
