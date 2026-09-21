'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Lock,
  LogOut,
  LayoutDashboard,
  DownloadCloud,
  Users,
  Activity as ActivityIcon,
  Server,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Music2,
  ListMusic,
  Laptop,
  Smartphone,
  Tablet,
  AlertTriangle,
  Eye,
  Calendar,
  Layers,
  ArrowUpRight,
  HardDrive,
  Cpu,
  Database,
} from 'lucide-react';

type AdminTab = 'overview' | 'downloads' | 'playlists' | 'visitors' | 'activity' | 'system';

interface DashboardStats {
  configured?: boolean;
  error?: string;
  supabaseConfigured?: boolean;
  totalDownloads: number;
  downloadsToday: number;
  downloadsThisWeek: number;
  downloadsThisMonth: number;
  uniqueVisitors: number;
  totalVisitors?: number;
  visitorsToday?: number;
  activeVisitors24h: number;
  songsQueued?: number;
  successfulDownloads: number;
  failedDownloads: number;
  totalPlaylistSessions?: number;
  totalPlaylistTracksDownloaded?: number;
  redownloadCount?: number;
  singleVideoCount: number;
  playlistTrackCount: number;
  mp3Count: number;
  m4aCount: number;
  dailyTrend: Array<{ day: string; count: number }>;
}

interface DownloadEvent {
  id: string;
  visitorId: string;
  videoId?: string;
  title: string;
  creator?: string;
  playlistId?: string;
  playlistTitle?: string;
  format: string;
  quality: string;
  status: string;
  filename?: string;
  processingDurationMs?: number;
  isRedownload: boolean;
  createdAt: string;
}

interface PlaylistEvent {
  id: string;
  visitorId: string;
  playlistId?: string;
  playlistTitle?: string;
  totalTracks: number;
  selectedTracks: number;
  completedTracks: number;
  failedTracks: number;
  createdAt: string;
}

interface Visitor {
  visitorId: string;
  firstSeen: string;
  lastSeen: string;
  downloads: number;
  playlists: number;
  device: string;
  browser: string;
  maskedIp?: string;
  recentDownloads?: DownloadEvent[];
}

interface ActivityItem {
  id: string;
  type: string;
  visitorId: string;
  description: string;
  timestamp: string;
  status: string;
  details?: any;
}

interface SystemStatus {
  webApp: string;
  worker: string;
  ffmpeg: string;
  queue: string;
  redis: string;
  database: string;
  supabaseDatabase?: 'Connected' | 'Not Configured' | 'Unavailable';
  temporaryStorage: string;
  currentQueue: number;
  failedJobsToday: number;
  timestamp: string;
  nodeVersion: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accessKey, setAccessKey] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentTab, setCurrentTab] = useState<AdminTab>('overview');

  // Tab Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [downloads, setDownloads] = useState<DownloadEvent[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistEvent[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Filters for downloads
  const [downloadSearch, setDownloadSearch] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('all');
  const [downloadRange, setDownloadRange] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [downloadSource, setDownloadSource] = useState('all');

  // Format timestamps in Asia/Kolkata (IST) timezone
  const formatTimestamp = (ts: string | number) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d) + ' IST';
    } catch {
      return String(ts);
    }
  };

  const getDeviceIcon = (device: string) => {
    switch (device?.toLowerCase()) {
      case 'mobile':
        return <Smartphone size={15} className="text-emerald-400" />;
      case 'tablet':
        return <Tablet size={15} className="text-amber-400" />;
      default:
        return <Laptop size={15} className="text-indigo-400" />;
    }
  };

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/admin/auth/status');
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(Boolean(data.authenticated));
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) return;

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey: accessKey.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setAccessKey('');
      } else {
        setLoginError(data.error || 'Invalid access key. Access denied.');
      }
    } catch {
      setLoginError('Connection error. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {}
    setIsAuthenticated(false);
    setStats(null);
    setDownloads([]);
    setPlaylists([]);
    setVisitors([]);
    setActivity([]);
  };

  // Fetch tab data when authenticated or tab changes
  const fetchTabData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setApiError(null);

    try {
      if (currentTab === 'overview') {
        const res = await fetch('/api/admin/overview');
        const data = await res.json();
        if (res.ok) {
          setStats(data);
          if (data.error) setApiError(data.error);
        } else {
          setApiError(data.error || 'Failed to load overview statistics');
        }
      } else if (currentTab === 'downloads') {
        const params = new URLSearchParams();
        if (downloadSearch) params.set('search', downloadSearch);
        if (downloadStatus !== 'all') params.set('status', downloadStatus);
        if (downloadRange !== 'all') params.set('range', downloadRange);
        if (downloadSource !== 'all') params.set('source', downloadSource);

        const res = await fetch(`/api/admin/downloads?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          setDownloads(data.downloads || []);
          if (data.error) setApiError(data.error);
        } else {
          setApiError(data.error || 'Failed to fetch downloads');
        }
      } else if (currentTab === 'playlists') {
        const res = await fetch('/api/admin/playlists');
        const data = await res.json();
        if (res.ok) {
          setPlaylists(data.playlists || []);
          if (data.error) setApiError(data.error);
        } else {
          setApiError(data.error || 'Failed to fetch playlists');
        }
      } else if (currentTab === 'visitors') {
        const res = await fetch('/api/admin/visitors');
        const data = await res.json();
        if (res.ok) {
          setVisitors(data.visitors || []);
          if (data.error) setApiError(data.error);
        } else {
          setApiError(data.error || 'Failed to fetch visitors');
        }
      } else if (currentTab === 'activity') {
        const res = await fetch('/api/admin/activity');
        const data = await res.json();
        if (res.ok) {
          setActivity(data.activity || []);
          if (data.error) setApiError(data.error);
        } else {
          setApiError(data.error || 'Failed to fetch activity stream');
        }
      } else if (currentTab === 'system') {
        const res = await fetch('/api/admin/system');
        const data = await res.json();
        if (res.ok) {
          setSystemStatus(data);
        } else {
          setApiError(data.error || 'Failed to fetch system telemetry');
        }
      }
    } catch (err) {
      console.error('Failed to fetch admin tab data', err);
      setApiError('Unable to reach backend services. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, currentTab, downloadSearch, downloadStatus, downloadRange, downloadSource]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTabData();
    }
  }, [isAuthenticated, currentTab, fetchTabData]);

  const openVisitorDetails = async (visitorId: string) => {
    try {
      const res = await fetch(`/api/admin/visitors/${visitorId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedVisitor(data);
      }
    } catch {}
  };

  // 1. LOADING INITIAL AUTH STATE
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center p-4">
        <RefreshCw size={28} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  // 2. ADMIN ACCESS KEY GATE SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#070707] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/3 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-[#0F0F13] border border-white/[0.08] rounded-3xl p-8 shadow-2xl relative z-10 backdrop-blur-xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400 shadow-inner">
              <Lock size={26} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">AudioX Admin</h1>
            <p className="text-xs text-zinc-400 mt-1.5 font-mono">Operations & Real-Time Analytics Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="adminAccessKey" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Access Key
              </label>
              <input
                id="adminAccessKey"
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Enter AUDIOX_ADMIN_KEY"
                autoComplete="off"
                disabled={isLoggingIn}
                className="w-full px-4 py-3.5 bg-black/40 border border-white/[0.12] rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-400 animate-fadeIn">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn || !accessKey.trim()}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Verifying Key...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Unlock Dashboard</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <span className="text-[11px] text-zinc-500 font-mono">
              Protected by Rate-Limiting & Session Cryptography
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 3. AUTHENTICATED ADMIN DASHBOARD
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'downloads', label: 'Downloads', icon: DownloadCloud },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'visitors', label: 'Visitors', icon: Users },
    { id: 'activity', label: 'Activity', icon: ActivityIcon },
    { id: 'system', label: 'System', icon: Server },
  ];

  const isSupabaseLive = Boolean(stats?.supabaseConfigured ?? stats?.configured);

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0B0B0E] border-r border-white/[0.07] shrink-0 min-h-screen sticky top-0 h-screen p-5 justify-between">
        <div>
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
              AX
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide text-zinc-100 flex items-center gap-1.5">
                AudioX <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono uppercase tracking-wider">Admin</span>
              </div>
              <p className="text-[11px] text-zinc-500">Operations Console</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id as AdminTab)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/[0.08] text-white font-semibold shadow-sm border border-white/[0.06]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-indigo-400' : 'text-zinc-500'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Logout */}
        <div className="pt-4 border-t border-white/[0.07] space-y-3">
          <div className="px-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Session Active (12h)
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
          >
            <LogOut size={16} />
            <span>Lock & Log Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Header & Tabs */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0B0B0E]/95 backdrop-blur-xl border-b border-white/[0.08] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-xs text-white">
              AX
            </div>
            <span className="font-bold text-sm tracking-wide">AudioX Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as AdminTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/[0.05] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
        {/* Top bar with Refresh */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight capitalize text-white">
              {currentTab}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {currentTab === 'overview' && 'Live Supabase metrics & real recorded telemetry'}
              {currentTab === 'downloads' && 'Granular record of confirmed audio download saves'}
              {currentTab === 'playlists' && 'Actual playlist batch conversion session history'}
              {currentTab === 'visitors' && 'Real anonymous visitor sessions from Supabase'}
              {currentTab === 'activity' && 'Real-time chronological activity stream'}
              {currentTab === 'system' && 'Infrastructure status, queues, worker, and temporary storage'}
            </p>
          </div>

          <button
            onClick={fetchTabData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-300 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-indigo-400' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Supabase Configuration Error Banner */}
        {(!isSupabaseLive || apiError) && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-xs text-amber-300">
            <AlertTriangle size={20} className="shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-200 text-sm">
                {!isSupabaseLive ? 'Supabase Analytics Not Connected' : 'Notice'}
              </div>
              <p className="text-amber-300/90 leading-relaxed">
                {apiError ||
                  'Supabase environment variables (SUPABASE_URL and SUPABASE_SECRET_KEY) are not configured. Real-time visitor and download analytics require a connected Supabase database. Add these variables to your environment to view real database metrics.'}
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            {/* Supabase Analytics Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0F0F13] border border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${isSupabaseLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <Database size={15} className={isSupabaseLive ? 'text-emerald-400' : 'text-amber-400'} />
                    <span>{isSupabaseLive ? 'Supabase Analytics Store Active' : 'Supabase Not Configured'}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-normal bg-white/[0.06] text-zinc-300">
                      PostgreSQL
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {isSupabaseLive
                      ? 'Live remote PostgreSQL telemetry connected & recording anonymous visitor events'
                      : 'Real-time analytics disabled until SUPABASE_URL and SUPABASE_SECRET_KEY are set in environment'}
                  </div>
                </div>
              </div>
              <span className={`text-[11px] font-mono px-3 py-1 rounded-full border shrink-0 text-center ${
                isSupabaseLive
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}>
                {isSupabaseLive ? 'Connected' : 'Not Configured'}
              </span>
            </div>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Total Downloads</span>
                  <DownloadCloud size={16} className="text-indigo-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {(stats?.totalDownloads ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">status = downloaded</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Downloads Today</span>
                  <Calendar size={16} className="text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
                  {(stats?.downloadsToday ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">IST (Asia/Kolkata)</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Last 7 Days</span>
                  <ActivityIcon size={16} className="text-violet-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {(stats?.downloadsThisWeek ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Rolling 7 days</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>This Month</span>
                  <Layers size={16} className="text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {(stats?.downloadsThisMonth ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Past 30 days</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Total Visitors</span>
                  <Users size={16} className="text-blue-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {(stats?.totalVisitors ?? stats?.uniqueVisitors ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Anonymous visitors</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Visitors Today</span>
                  <Clock size={16} className="text-amber-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">
                  {(stats?.visitorsToday ?? stats?.activeVisitors24h ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Active last 24h</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Successful</span>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
                  {(stats?.successfulDownloads ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Confirmed file saves</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Failed Downloads</span>
                  <XCircle size={16} className="text-rose-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-rose-400 tracking-tight">
                  {(stats?.failedDownloads ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Failures logged</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Playlist Sessions</span>
                  <ListMusic size={16} className="text-violet-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-violet-400 tracking-tight">
                  {(stats?.totalPlaylistSessions ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Batches processed</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Playlist Tracks</span>
                  <Music2 size={16} className="text-indigo-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {(stats?.totalPlaylistTracksDownloaded ?? stats?.playlistTrackCount ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Playlist tracks saved</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Re-downloads</span>
                  <RefreshCw size={16} className="text-amber-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">
                  {(stats?.redownloadCount ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">is_redownload = true</div>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
                  <span>Single vs Playlist</span>
                  <Layers size={16} className="text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {stats?.singleVideoCount ?? 0} <span className="text-sm font-normal text-zinc-400">/ {stats?.playlistTrackCount ?? 0}</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Single tracks / Playlist</div>
              </div>
            </div>

            {/* Visual Breakdown / Analytics Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Last 7 Days Trend */}
              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-400" />
                  <span>Downloads by Day (Last 7 Days)</span>
                </h3>

                {(!stats?.dailyTrend || stats.dailyTrend.length === 0 || stats.dailyTrend.every((t) => t.count === 0)) ? (
                  <div className="py-8 text-center text-zinc-500 text-xs space-y-1">
                    <p className="font-medium text-zinc-400">No download activity yet.</p>
                    <p className="text-[11px]">Daily activity will appear here once audio tracks are downloaded.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {stats.dailyTrend.map((d) => {
                      const maxVal = Math.max(...stats.dailyTrend.map((t) => t.count), 1);
                      const pct = d.count === 0 ? 0 : Math.min(100, Math.round((d.count / maxVal) * 100));
                      return (
                        <div key={d.day} className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span className="font-mono">{d.day}</span>
                            <span className="font-semibold text-white">{d.count}</span>
                          </div>
                          <div className="w-full bg-white/[0.05] h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ratios Breakdown */}
              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5 space-y-5">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Layers size={16} className="text-violet-400" />
                  <span>Format & Source Distribution</span>
                </h3>

                {/* Single vs Playlist */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                    <span>Source: Single ({stats?.singleVideoCount ?? 0}) vs Playlist ({stats?.playlistTrackCount ?? 0})</span>
                    <span>
                      {(stats?.singleVideoCount ?? 0) + (stats?.playlistTrackCount ?? 0) > 0
                        ? `${Math.round(
                            ((stats?.singleVideoCount ?? 0) /
                              ((stats?.singleVideoCount ?? 0) + (stats?.playlistTrackCount ?? 0))) *
                              100
                          )}% Single`
                        : 'No activity'}
                    </span>
                  </div>
                  <div className="w-full bg-white/[0.05] h-3 rounded-full flex overflow-hidden">
                    {(stats?.singleVideoCount ?? 0) + (stats?.playlistTrackCount ?? 0) === 0 ? (
                      <div className="w-full bg-white/[0.03] h-full" />
                    ) : (
                      <>
                        <div
                          className="bg-indigo-500 h-full"
                          style={{
                            width: `${
                              ((stats?.singleVideoCount ?? 0) /
                                ((stats?.singleVideoCount ?? 0) + (stats?.playlistTrackCount ?? 0))) *
                              100
                            }%`,
                          }}
                          title="Single Videos"
                        />
                        <div
                          className="bg-violet-500 h-full"
                          style={{
                            width: `${
                              ((stats?.playlistTrackCount ?? 0) /
                                ((stats?.singleVideoCount ?? 0) + (stats?.playlistTrackCount ?? 0))) *
                              100
                            }%`,
                          }}
                          title="Playlist Tracks"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" /> Single Video
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-500" /> Playlist Tracks
                    </span>
                  </div>
                </div>

                {/* MP3 vs M4A */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                    <span>Format: MP3 ({stats?.mp3Count ?? 0}) vs M4A ({stats?.m4aCount ?? 0})</span>
                    <span>
                      {(stats?.mp3Count ?? 0) + (stats?.m4aCount ?? 0) > 0
                        ? `${Math.round(
                            ((stats?.mp3Count ?? 0) / ((stats?.mp3Count ?? 0) + (stats?.m4aCount ?? 0))) * 100
                          )}% MP3`
                        : 'No activity'}
                    </span>
                  </div>
                  <div className="w-full bg-white/[0.05] h-3 rounded-full flex overflow-hidden">
                    {(stats?.mp3Count ?? 0) + (stats?.m4aCount ?? 0) === 0 ? (
                      <div className="w-full bg-white/[0.03] h-full" />
                    ) : (
                      <>
                        <div
                          className="bg-emerald-500 h-full"
                          style={{
                            width: `${
                              ((stats?.mp3Count ?? 0) / ((stats?.mp3Count ?? 0) + (stats?.m4aCount ?? 0))) * 100
                            }%`,
                          }}
                          title="MP3"
                        />
                        <div
                          className="bg-cyan-500 h-full"
                          style={{
                            width: `${
                              ((stats?.m4aCount ?? 0) / ((stats?.mp3Count ?? 0) + (stats?.m4aCount ?? 0))) * 100
                            }%`,
                          }}
                          title="M4A"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> MP3 Audio
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" /> M4A / AAC
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DOWNLOADS */}
        {currentTab === 'downloads' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={downloadSearch}
                  onChange={(e) => setDownloadSearch(e.target.value)}
                  placeholder="Search song title, creator, or visitor ID..."
                  className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <select
                  value={downloadRange}
                  onChange={(e: any) => setDownloadRange(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>

                <select
                  value={downloadStatus}
                  onChange={(e) => setDownloadStatus(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="downloaded">Downloaded</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={downloadSource}
                  onChange={(e) => setDownloadSource(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="all">All Sources</option>
                  <option value="video">Single Video</option>
                  <option value="playlist">Playlist</option>
                </select>
              </div>
            </div>

            {/* Downloads List / Table */}
            <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl overflow-hidden">
              {downloads.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs space-y-1">
                  <DownloadCloud size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-zinc-300 font-medium">No download activity yet.</p>
                  <p className="text-zinc-500">Confirmed audio file downloads from Supabase will be displayed here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-zinc-400 bg-white/[0.02]">
                        <th className="p-3.5 font-semibold">Time (IST)</th>
                        <th className="p-3.5 font-semibold">Visitor</th>
                        <th className="p-3.5 font-semibold">Song</th>
                        <th className="p-3.5 font-semibold">Creator</th>
                        <th className="p-3.5 font-semibold">Playlist</th>
                        <th className="p-3.5 font-semibold">Format</th>
                        <th className="p-3.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {downloads.map((item) => (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3.5 text-zinc-400 font-mono whitespace-nowrap">
                            {formatTimestamp(item.createdAt)}
                          </td>
                          <td className="p-3.5 font-mono text-indigo-400 whitespace-nowrap font-medium">
                            <button
                              onClick={() => openVisitorDetails(item.visitorId)}
                              className="hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{item.visitorId}</span>
                              <ArrowUpRight size={12} className="opacity-60" />
                            </button>
                          </td>
                          <td className="p-3.5 font-medium text-white max-w-[200px] truncate" title={item.title}>
                            {item.title}
                          </td>
                          <td className="p-3.5 text-zinc-400 max-w-[140px] truncate" title={item.creator}>
                            {item.creator || '—'}
                          </td>
                          <td className="p-3.5 text-zinc-400 max-w-[140px] truncate" title={item.playlistTitle}>
                            {item.playlistTitle ? (
                              <span className="flex items-center gap-1 text-violet-400">
                                <ListMusic size={13} />
                                <span>{item.playlistTitle}</span>
                              </span>
                            ) : (
                              'Single'
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-white/[0.05] text-zinc-300 font-mono text-[10px] uppercase">
                              {item.format} · {item.quality}
                            </span>
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  item.status === 'downloaded'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : item.status === 'failed'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                }`}
                              >
                                {item.status}
                              </span>
                              {item.isRedownload && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[9px] font-medium">
                                  Re-download
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PLAYLISTS */}
        {currentTab === 'playlists' && (
          <div className="space-y-4">
            <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl overflow-hidden">
              {playlists.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs space-y-1">
                  <ListMusic size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-zinc-300 font-medium">No playlist session activity yet.</p>
                  <p className="text-zinc-500">Processed playlist batch runs will be listed here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-zinc-400 bg-white/[0.02]">
                        <th className="p-3.5 font-semibold">Playlist Title</th>
                        <th className="p-3.5 font-semibold">Visitor</th>
                        <th className="p-3.5 font-semibold">Total Tracks</th>
                        <th className="p-3.5 font-semibold">Selected</th>
                        <th className="p-3.5 font-semibold">Completed</th>
                        <th className="p-3.5 font-semibold">Failed</th>
                        <th className="p-3.5 font-semibold">Date / Time (IST)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {playlists.map((item) => (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3.5 font-medium text-white max-w-[260px] truncate" title={item.playlistTitle}>
                            <div className="flex items-center gap-1.5">
                              <ListMusic size={14} className="text-violet-400 shrink-0" />
                              <span className="truncate">{item.playlistTitle || 'Untitled Playlist'}</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-indigo-400 whitespace-nowrap font-medium">
                            <button
                              onClick={() => openVisitorDetails(item.visitorId)}
                              className="hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{item.visitorId}</span>
                              <ArrowUpRight size={12} className="opacity-60" />
                            </button>
                          </td>
                          <td className="p-3.5 font-mono text-zinc-300 whitespace-nowrap">
                            {item.totalTracks}
                          </td>
                          <td className="p-3.5 font-mono text-indigo-300 whitespace-nowrap">
                            {item.selectedTracks}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-semibold border border-emerald-500/20">
                              {item.completedTracks}
                            </span>
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded font-mono font-semibold ${
                              item.failedTracks > 0
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'text-zinc-500'
                            }`}>
                              {item.failedTracks}
                            </span>
                          </td>
                          <td className="p-3.5 text-zinc-400 font-mono whitespace-nowrap">
                            {formatTimestamp(item.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: VISITORS */}
        {currentTab === 'visitors' && (
          <div className="space-y-4">
            <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl overflow-hidden">
              {visitors.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-xs space-y-1">
                  <Users size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-zinc-300 font-medium">No visitor activity yet.</p>
                  <p className="text-zinc-500">Anonymous visitors will be recorded automatically upon opening AudioX.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-zinc-400 bg-white/[0.02]">
                        <th className="p-3.5 font-semibold">Visitor ID</th>
                        <th className="p-3.5 font-semibold">First Seen (IST)</th>
                        <th className="p-3.5 font-semibold">Last Seen (IST)</th>
                        <th className="p-3.5 font-semibold">Downloads</th>
                        <th className="p-3.5 font-semibold">Playlists</th>
                        <th className="p-3.5 font-semibold">Device</th>
                        <th className="p-3.5 font-semibold">Browser</th>
                        <th className="p-3.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {visitors.map((v) => (
                        <tr key={v.visitorId} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3.5 font-mono text-indigo-400 font-bold whitespace-nowrap">
                            {v.visitorId}
                          </td>
                          <td className="p-3.5 text-zinc-400 font-mono whitespace-nowrap">
                            {formatTimestamp(v.firstSeen)}
                          </td>
                          <td className="p-3.5 text-zinc-400 font-mono whitespace-nowrap">
                            {formatTimestamp(v.lastSeen)}
                          </td>
                          <td className="p-3.5 font-bold text-white whitespace-nowrap">
                            {v.downloads}
                          </td>
                          <td className="p-3.5 text-zinc-400 whitespace-nowrap">
                            {v.playlists}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="flex items-center gap-1.5 text-zinc-300">
                              {getDeviceIcon(v.device)}
                              <span>{v.device}</span>
                            </span>
                          </td>
                          <td className="p-3.5 text-zinc-400 whitespace-nowrap">
                            {v.browser}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => openVisitorDetails(v.visitorId)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[11px] font-medium border border-indigo-500/20 transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Visitor Detail Modal */}
            {selectedVisitor && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-[#0F0F13] border border-white/[0.12] rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Visitor</span>
                        <span className="font-mono text-indigo-400">{selectedVisitor.visitorId}</span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">Anonymous telemetry profile</p>
                    </div>
                    <button
                      onClick={() => setSelectedVisitor(null)}
                      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">First Seen (IST)</span>
                      <span className="text-zinc-200 font-mono mt-0.5 block">{formatTimestamp(selectedVisitor.firstSeen)}</span>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">Last Seen (IST)</span>
                      <span className="text-zinc-200 font-mono mt-0.5 block">{formatTimestamp(selectedVisitor.lastSeen)}</span>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">Total Downloads</span>
                      <span className="text-emerald-400 font-bold text-sm mt-0.5 block">{selectedVisitor.downloads}</span>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">Playlists Processed</span>
                      <span className="text-zinc-200 font-bold text-sm mt-0.5 block">{selectedVisitor.playlists}</span>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">Device & Browser</span>
                      <span className="text-zinc-200 mt-0.5 block">{selectedVisitor.device} · {selectedVisitor.browser}</span>
                    </div>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                      <span className="text-zinc-500 block">Masked IP</span>
                      <span className="text-zinc-300 font-mono mt-0.5 block">{selectedVisitor.maskedIp || 'Anonymous'}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-zinc-300 mb-2.5">Confirmed Downloads by this Visitor</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {(!selectedVisitor.recentDownloads || selectedVisitor.recentDownloads.length === 0) ? (
                        <p className="text-xs text-zinc-500">No recent downloads found.</p>
                      ) : (
                        selectedVisitor.recentDownloads.map((rd) => (
                          <div
                            key={rd.id}
                            className="p-2.5 bg-black/30 rounded-xl border border-white/[0.04] flex items-center justify-between text-xs"
                          >
                            <div className="truncate max-w-[280px]">
                              <span className="text-white font-medium block truncate">{rd.title}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">{formatTimestamp(rd.createdAt)}</span>
                            </div>
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-300">
                              {rd.format}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-2 text-right">
                    <button
                      onClick={() => setSelectedVisitor(null)}
                      className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-medium text-white transition-all cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ACTIVITY */}
        {currentTab === 'activity' && (
          <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <ActivityIcon size={16} className="text-indigo-400" />
              <span>Chronological Activity Stream</span>
            </h3>

            {activity.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 text-xs space-y-1">
                <ActivityIcon size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-zinc-300 font-medium">No activity recorded yet.</p>
                <p className="text-zinc-500">Real-time operations events from Supabase will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-black/40 rounded-xl border border-white/[0.05] flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          item.status === 'downloaded'
                            ? 'bg-emerald-400'
                            : item.status === 'failed'
                            ? 'bg-rose-400'
                            : 'bg-indigo-400'
                        }`}
                      />
                      <div>
                        <div className="text-zinc-200 font-medium">
                          <span className="font-mono text-indigo-400 font-bold mr-1.5">{item.visitorId}</span>
                          <span>{item.description}</span>
                        </div>
                        {item.details && (
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {item.details.playlist && <span>Playlist: {item.details.playlist} · </span>}
                            {item.details.format && <span>{item.details.format.toUpperCase()} · </span>}
                            {item.details.quality && <span>{item.details.quality}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono shrink-0 whitespace-nowrap">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SYSTEM */}
        {currentTab === 'system' && systemStatus && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Web Application</span>
                  <Server size={18} className="text-indigo-400" />
                </div>
                <div className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {systemStatus.webApp}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Next.js App Router · Node {systemStatus.nodeVersion}</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Queue Worker</span>
                  <Cpu size={18} className="text-violet-400" />
                </div>
                <div className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {systemStatus.worker}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Sequential processing concurrency = 1</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">FFmpeg Binary</span>
                  <Music2 size={18} className="text-cyan-400" />
                </div>
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  {systemStatus.ffmpeg}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Direct stream remuxing & bit-exact encoding</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Queue Broker</span>
                  <Layers size={18} className="text-amber-400" />
                </div>
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  {systemStatus.queue}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Current Active / Pending: {systemStatus.currentQueue}</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Redis Cache</span>
                  <HardDrive size={18} className="text-zinc-400" />
                </div>
                <div className="text-sm font-semibold text-zinc-300">
                  {systemStatus.redis}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">In-process memory engine</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Supabase Database</span>
                  <HardDrive size={18} className={
                    systemStatus.supabaseDatabase === 'Connected' ? 'text-emerald-400' :
                    systemStatus.supabaseDatabase === 'Not Configured' ? 'text-amber-400' : 'text-rose-400'
                  } />
                </div>
                <div className={`text-lg font-bold flex items-center gap-2 ${
                  systemStatus.supabaseDatabase === 'Connected' ? 'text-emerald-400' :
                  systemStatus.supabaseDatabase === 'Not Configured' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    systemStatus.supabaseDatabase === 'Connected' ? 'bg-emerald-400' :
                    systemStatus.supabaseDatabase === 'Not Configured' ? 'bg-amber-400' : 'bg-rose-400'
                  }`} />
                  {systemStatus.supabaseDatabase || 'Not Configured'}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {systemStatus.supabaseDatabase === 'Connected'
                    ? 'Remote PostgreSQL analytics store active'
                    : systemStatus.supabaseDatabase === 'Not Configured'
                    ? 'Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable'
                    : 'Remote connection unavailable'}
                </p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Temporary Storage</span>
                  <HardDrive size={18} className="text-blue-400" />
                </div>
                <div className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  {systemStatus.temporaryStorage}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Safe temp workspace cleanup enabled</p>
              </div>

              <div className="bg-[#0F0F13] border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Failed Jobs Today</span>
                  <AlertTriangle size={18} className="text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-400">
                  {systemStatus.failedJobsToday}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Recorded failures since midnight</p>
              </div>
            </div>

            <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>Server Timestamp: <span className="font-mono text-zinc-400">{formatTimestamp(systemStatus.timestamp)}</span></span>
              <span>AudioX Secure Operations Layer · V1 Production Release</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
