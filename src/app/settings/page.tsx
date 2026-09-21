'use client';

import React, { useState, useEffect } from 'react';
import { useAudioX } from '@/context/AudioXContext';
import { FormatSelector } from '@/components/FormatSelector';
import { QualitySelector } from '@/components/QualitySelector';
import { FilenameFormat, AutoRemoveOption } from '@/lib/types';
import {
  Settings,
  Download,
  ListOrdered,
  History,
  Shield,
  Clock,
  Sparkles,
  LogOut,
  Check,
  FileText,
} from 'lucide-react';

export default function SettingsPage() {
  const { settings, updateSettings, clearHistory, addToast } = useAudioX();

  const filenameFormats: { id: FilenameFormat; label: string; example: string }[] = [
    { id: 'artist_title', label: 'Artist - Title', example: 'Queen - Bohemian Rhapsody.mp3' },
    { id: 'title', label: 'Title Only', example: 'Bohemian Rhapsody.mp3' },
    { id: 'index_artist_title', label: '01 - Artist - Title', example: '01 - Queen - Bohemian Rhapsody.mp3' },
    { id: 'playlist_index_title', label: 'Playlist - 01 - Title', example: 'Rock Classics - 01 - Bohemian Rhapsody.mp3' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 py-4">
      {/* Header */}
      <div className="pb-2 border-b border-white/[0.06]">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
          <Settings className="text-indigo-400" size={28} />
          <span>Settings & Preferences</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Customize YouTube conversion presets, queue behavior, and download preferences
        </p>
      </div>

      {/* Settings Grid */}
      <div className="flex flex-col gap-4">
        {/* Conversion Defaults */}
        <div className="p-5 rounded-2xl glass-panel border border-white/[0.08] shadow-xl">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.05]">
            <Download size={18} className="text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Audio Conversion Defaults
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Default Format</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Target audio container for newly queued tracks
              </p>
            </div>
            <FormatSelector
              value={settings.defaultFormat}
              onChange={(f) => {
                updateSettings({ defaultFormat: f });
                addToast(`Default format set to ${f.toUpperCase()}`, 'info');
              }}
              size="sm"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Default Quality</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Standard (~128k), High (~192k), or Best Available
              </p>
            </div>
            <QualitySelector
              value={settings.defaultQuality}
              onChange={(q) => {
                updateSettings({ defaultQuality: q });
                addToast(`Default quality set to ${q}`, 'info');
              }}
              size="sm"
            />
          </div>

          {/* Filename Format Option */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pt-3">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-400" />
                Filename Pattern
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Pattern used when naming downloaded audio files
              </p>
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
              {filenameFormats.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => {
                    updateSettings({ filenameFormat: fmt.id });
                    addToast(`Filename format set to ${fmt.label}`, 'info');
                  }}
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    settings.filenameFormat === fmt.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{fmt.label}</span>
                  <span className="text-[10px] font-mono opacity-70 hidden md:inline">
                    {fmt.example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Queue & Auto-Download Behavior */}
        <div className="p-5 rounded-2xl glass-panel border border-white/[0.08] shadow-xl">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.05]">
            <ListOrdered size={18} className="text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Queue & Download Flow
            </h3>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Auto-start Queue</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Begin sequential conversion automatically when new tracks are queued
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStartQueue}
                onChange={(e) => updateSettings({ autoStartQueue: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">
                Automatically Download Completed Tracks
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Trigger file download immediately as each track finishes
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoDownload}
                onChange={(e) => updateSettings({ autoDownload: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Download Trigger Mode</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Use Download & Continue on mobile to avoid browser download blocking
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.08] text-xs">
              <button
                type="button"
                onClick={() => updateSettings({ downloadMode: 'auto' })}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  settings.downloadMode === 'auto'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Automatic
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ downloadMode: 'manual' })}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  settings.downloadMode === 'manual'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Download & Continue
              </button>
            </div>
          </div>

          {/* Auto-remove completed items */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">
                Remove Completed Tracks from Queue
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Automatically clean finished tracks from active queue view
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/[0.08] text-xs">
              {(['never', 'immediately', '5min'] as AutoRemoveOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateSettings({ autoRemoveCompleted: opt })}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold capitalize transition-colors cursor-pointer ${
                    settings.autoRemoveCompleted === opt
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt === '5min' ? 'After 5 min' : opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History & Storage */}
        <div className="p-5 rounded-2xl glass-panel border border-white/[0.08] shadow-xl">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.05]">
            <History size={18} className="text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              History & Storage
            </h3>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">
                Save Local Download History
              </h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Log track metadata for offline audio player preview
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.saveHistory}
                onChange={(e) => updateSettings({ saveHistory: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.04]">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Temporary Storage</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                <Clock size={12} className="text-indigo-400" />
                Raw and converted audio files are purged automatically after 30 minutes
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-white/5 text-zinc-300 border border-white/5">
              30m Expiry
            </span>
          </div>

          <div className="pt-3 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Clear all local browser history entries</span>
            <button
              type="button"
              onClick={clearHistory}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer"
            >
              Clear History
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="p-5 rounded-2xl glass-panel border border-white/[0.08] shadow-xl">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.05]">
            <Sparkles size={18} className="text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">Appearance</h3>
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Theme</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                AudioX is optimized for OLED deep black (#070707)
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.08] text-xs">
              <span className="px-3 py-1.5 rounded-lg font-semibold bg-white/10 text-white flex items-center gap-1.5">
                <Check size={12} className="text-indigo-400" />
                Deep Dark (Default)
              </span>
            </div>
          </div>
        </div>

        {/* 100% Private & Anonymous Notice */}
        <div className="p-5 rounded-2xl glass-panel border border-white/[0.08] shadow-xl flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0 mt-0.5">
            <Shield size={20} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">100% Private & Public Downloader</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              AudioX is completely public and requires no accounts, passwords, or login. All download history is stored strictly on your local browser device using IndexedDB for duplicate detection. No visitor IDs, analytics, or personal telemetry are collected or transmitted to any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
