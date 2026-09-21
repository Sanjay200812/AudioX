import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

let dbInstance: any = null;

function initDb(db: any) {
  // Enable WAL mode for high performance concurrent reads and writes
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS anonymous_visitors (
      id TEXT PRIMARY KEY,
      visitor_id TEXT UNIQUE NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      device_type TEXT,
      browser TEXT,
      masked_ip TEXT,
      download_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS download_events (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      video_id TEXT,
      title TEXT NOT NULL,
      creator TEXT,
      playlist_id TEXT,
      playlist_title TEXT,
      format TEXT NOT NULL,
      quality TEXT NOT NULL,
      status TEXT NOT NULL,
      filename TEXT,
      processing_duration_ms INTEGER DEFAULT 0,
      is_redownload INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_events (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      playlist_id TEXT,
      playlist_title TEXT NOT NULL,
      track_count INTEGER NOT NULL,
      selected_count INTEGER NOT NULL,
      completed_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_rate_limits (
      ip TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      last_attempt INTEGER NOT NULL,
      locked_until INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_status ON download_events(status);
    CREATE INDEX IF NOT EXISTS idx_downloads_created ON download_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_downloads_visitor ON download_events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON anonymous_visitors(last_seen);
  `);
}

function getDb() {
  if (dbInstance) return dbInstance;

  // Use in-memory database during test runs so tests never write dummy records to disk
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    dbInstance = new DatabaseSync(':memory:');
    initDb(dbInstance);
    return dbInstance;
  }

  const dataDir = path.join(process.cwd(), '.audiox_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'analytics.db');
  dbInstance = new DatabaseSync(dbPath);
  initDb(dbInstance);
  return dbInstance;
}

export function maskIp(ip?: string): string {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return 'Direct / Localhost';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.XX.XX`;
  }
  return ip.slice(0, 8) + '...';
}

export interface DownloadEventInput {
  visitorId: string;
  videoId?: string;
  title: string;
  creator?: string;
  playlistId?: string;
  playlistTitle?: string;
  format: string;
  quality: string;
  status: 'queued' | 'processed' | 'downloaded' | 'failed' | 'cancelled';
  filename?: string;
  processingDurationMs?: number;
  isRedownload?: boolean;
}

export interface PlaylistEventInput {
  visitorId: string;
  playlistId?: string;
  playlistTitle?: string;
  trackCount: number;
  selectedCount: number;
  completedCount?: number;
  failedCount?: number;
}

// 1. Upsert Visitor
export function upsertVisitor(params: {
  visitorId: string;
  deviceType?: string;
  browser?: string;
  ip?: string;
}): void {
  try {
    const db = getDb();
    const now = Date.now();
    const masked = params.ip ? maskIp(params.ip) : '103.XX.XX.42';
    const existing = db.prepare('SELECT * FROM anonymous_visitors WHERE visitor_id = ?').get(params.visitorId);

    if (existing) {
      db.prepare(`
        UPDATE anonymous_visitors
        SET last_seen = ?,
            device_type = COALESCE(?, device_type),
            browser = COALESCE(?, browser),
            masked_ip = COALESCE(?, masked_ip)
        WHERE visitor_id = ?
      `).run(now, params.deviceType || null, params.browser || null, masked, params.visitorId);
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO anonymous_visitors (id, visitor_id, first_seen, last_seen, device_type, browser, masked_ip, download_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(id, params.visitorId, now, now, params.deviceType || 'Desktop', params.browser || 'Browser', masked, now);
    }
  } catch (err) {
    console.error('Analytics upsertVisitor error:', err);
  }
}

// 2. Record Download Event
export function recordDownloadEvent(event: DownloadEventInput): void {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO download_events (
        id, visitor_id, video_id, title, creator, playlist_id, playlist_title,
        format, quality, status, filename, processing_duration_ms, is_redownload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      event.visitorId,
      event.videoId || null,
      event.title,
      event.creator || null,
      event.playlistId || null,
      event.playlistTitle || null,
      event.format,
      event.quality,
      event.status,
      event.filename || null,
      event.processingDurationMs || 0,
      event.isRedownload ? 1 : 0,
      now
    );

    // If successfully downloaded, increment visitor download count
    if (event.status === 'downloaded') {
      db.prepare(`
        UPDATE anonymous_visitors
        SET download_count = download_count + 1, last_seen = ?
        WHERE visitor_id = ?
      `).run(now, event.visitorId);
    }
  } catch (err) {
    console.error('Analytics recordDownloadEvent error:', err);
  }
}

// 3. Record Playlist Event
export function recordPlaylistEvent(event: PlaylistEventInput): void {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO playlist_events (
        id, visitor_id, playlist_id, playlist_title,
        track_count, selected_count, completed_count, failed_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      event.visitorId,
      event.playlistId || null,
      event.playlistTitle,
      event.trackCount,
      event.selectedCount,
      event.completedCount || 0,
      event.failedCount || 0,
      now
    );
  } catch (err) {
    console.error('Analytics recordPlaylistEvent error:', err);
  }
}

// 4. Get Dashboard Overview Stats
export function getDashboardStats() {
  try {
    const db = getDb();
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgoMs = now - 30 * 24 * 60 * 60 * 1000;
    const dayAgoMs = now - 24 * 60 * 60 * 1000;

    const totalDownloads = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'downloaded'").get() as any)?.c || 0;
    const downloadsToday = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'downloaded' AND created_at >= ?").get(todayMs) as any)?.c || 0;
    const downloadsThisWeek = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'downloaded' AND created_at >= ?").get(weekAgoMs) as any)?.c || 0;
    const downloadsThisMonth = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'downloaded' AND created_at >= ?").get(monthAgoMs) as any)?.c || 0;

    const uniqueVisitors = (db.prepare('SELECT COUNT(*) as c FROM anonymous_visitors').get() as any)?.c || 0;
    const activeVisitors = (db.prepare('SELECT COUNT(*) as c FROM anonymous_visitors WHERE last_seen >= ?').get(dayAgoMs) as any)?.c || 0;

    const songsQueued = (db.prepare('SELECT COUNT(*) as c FROM download_events').get() as any)?.c || 0;
    const successfulDownloads = totalDownloads;
    const failedDownloads = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'failed'").get() as any)?.c || 0;

    // Last 7 days breakdown
    const days: Array<{ date: string; downloads: number; failed: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      const endMs = startMs + 24 * 60 * 60 * 1000;
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const dCount = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'downloaded' AND created_at >= ? AND created_at < ?").get(startMs, endMs) as any)?.c || 0;
      const fCount = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE status = 'failed' AND created_at >= ? AND created_at < ?").get(startMs, endMs) as any)?.c || 0;

      days.push({ date: label, downloads: dCount, failed: fCount });
    }

    // Format Breakdown
    const mp3Count = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE format = 'mp3' AND status = 'downloaded'").get() as any)?.c || 0;
    const m4aCount = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE format = 'm4a' AND status = 'downloaded'").get() as any)?.c || 0;

    // Source Breakdown (Single vs Playlist)
    const playlistTracks = (db.prepare("SELECT COUNT(*) as c FROM download_events WHERE playlist_id IS NOT NULL AND status = 'downloaded'").get() as any)?.c || 0;
    const singleTracks = Math.max(0, totalDownloads - playlistTracks);

    return {
      totalDownloads,
      downloadsToday,
      downloadsThisWeek,
      downloadsThisMonth,
      uniqueVisitors,
      activeVisitors,
      activeVisitors24h: activeVisitors,
      songsQueued,
      successfulDownloads,
      failedDownloads,
      mp3Count,
      m4aCount,
      singleVideoCount: singleTracks,
      playlistTrackCount: playlistTracks,
      dailyTrend: days.map((d) => ({ day: d.date, count: d.downloads })),
      days,
      formatBreakdown: { mp3: mp3Count, m4a: m4aCount },
      sourceBreakdown: { single: singleTracks, playlist: playlistTracks },
    };
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return {
      totalDownloads: 0,
      downloadsToday: 0,
      downloadsThisWeek: 0,
      downloadsThisMonth: 0,
      uniqueVisitors: 0,
      activeVisitors: 0,
      activeVisitors24h: 0,
      songsQueued: 0,
      successfulDownloads: 0,
      failedDownloads: 0,
      mp3Count: 0,
      m4aCount: 0,
      singleVideoCount: 0,
      playlistTrackCount: 0,
      dailyTrend: [],
      days: [],
      formatBreakdown: { mp3: 0, m4a: 0 },
      sourceBreakdown: { single: 0, playlist: 0 },
    };
  }
}

// 5. Get Filtered Download Events
export function getDownloadEvents(params: {
  limit?: number;
  offset?: number;
  status?: string;
  range?: string;
  timeframe?: string;
  source?: string;
  search?: string;
}) {
  try {
    const db = getDb();
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.status && params.status !== 'all') {
      conditions.push('status = ?');
      args.push(params.status);
    }

    if (params.source === 'single' || params.source === 'video') {
      conditions.push('playlist_id IS NULL');
    } else if (params.source === 'playlist') {
      conditions.push('playlist_id IS NOT NULL');
    }

    const timeFilter = params.range || params.timeframe;
    if (timeFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      conditions.push('created_at >= ?');
      args.push(today.getTime());
    } else if (timeFilter === '7d') {
      conditions.push('created_at >= ?');
      args.push(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeFilter === '30d') {
      conditions.push('created_at >= ?');
      args.push(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    if (params.search && params.search.trim()) {
      conditions.push('(title LIKE ? OR creator LIKE ? OR visitor_id LIKE ?)');
      const q = `%${params.search.trim()}%`;
      args.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as c FROM download_events ${whereClause}`;
    const total = (db.prepare(countSql).get(...args) as any)?.c || 0;

    const dataSql = `SELECT * FROM download_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rawEvents = db.prepare(dataSql).all(...args, limit, offset) as any[];

    const events = rawEvents.map((r) => ({
      id: r.id,
      visitorId: r.visitor_id,
      videoId: r.video_id,
      title: r.title,
      creator: r.creator,
      playlistId: r.playlist_id,
      playlistTitle: r.playlist_title,
      format: r.format,
      quality: r.quality,
      status: r.status,
      filename: r.filename,
      processingDurationMs: r.processing_duration_ms,
      isRedownload: Boolean(r.is_redownload),
      createdAt: r.created_at,
    }));

    return { events, total };
  } catch (err) {
    console.error('getDownloadEvents error:', err);
    return { events: [], total: 0 };
  }
}

// 6. Get Visitors
export function getVisitors(params: { limit?: number; offset?: number; search?: string }) {
  try {
    const db = getDb();
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.search && params.search.trim()) {
      conditions.push('visitor_id LIKE ?');
      args.push(`%${params.search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as c FROM anonymous_visitors ${whereClause}`;
    const total = (db.prepare(countSql).get(...args) as any)?.c || 0;

    const dataSql = `SELECT * FROM anonymous_visitors ${whereClause} ORDER BY last_seen DESC LIMIT ? OFFSET ?`;
    const rawVisitors = db.prepare(dataSql).all(...args, limit, offset) as any[];

    const visitors = rawVisitors.map((v) => {
      const dlCount = (db.prepare('SELECT COUNT(*) as c FROM download_events WHERE visitor_id = ?').get(v.visitor_id) as any)?.c || 0;
      const plCount = (db.prepare('SELECT COUNT(*) as c FROM playlist_events WHERE visitor_id = ?').get(v.visitor_id) as any)?.c || 0;
      return {
        id: v.id,
        visitorId: v.visitor_id,
        firstSeen: v.first_seen,
        lastSeen: v.last_seen,
        device: v.device_type,
        browser: v.browser,
        downloads: dlCount,
        playlists: plCount,
        maskedIp: v.masked_ip || '103.XX.XX.42',
      };
    });

    return { visitors, total };
  } catch (err) {
    console.error('getVisitors error:', err);
    return { visitors: [], total: 0 };
  }
}

// 7. Get Visitor Detail
export function getVisitorDetails(visitorId: string) {
  try {
    const db = getDb();
    const visitor = db.prepare('SELECT * FROM anonymous_visitors WHERE visitor_id = ?').get(visitorId) as any;
    if (!visitor) return null;

    const rawRecent = db.prepare('SELECT * FROM download_events WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 20').all(visitorId) as any[];
    const recentDownloads = rawRecent.map((r) => ({
      id: r.id,
      visitorId: r.visitor_id,
      videoId: r.video_id,
      title: r.title,
      creator: r.creator,
      playlistId: r.playlist_id,
      playlistTitle: r.playlist_title,
      format: r.format,
      quality: r.quality,
      status: r.status,
      filename: r.filename,
      isRedownload: Boolean(r.is_redownload),
      createdAt: r.created_at,
    }));

    const dlCount = (db.prepare('SELECT COUNT(*) as c FROM download_events WHERE visitor_id = ?').get(visitorId) as any)?.c || 0;
    const playlistsProcessed = (db.prepare('SELECT COUNT(*) as c FROM playlist_events WHERE visitor_id = ?').get(visitorId) as any)?.c || 0;

    return {
      visitorId: visitor.visitor_id,
      firstSeen: visitor.first_seen,
      lastSeen: visitor.last_seen,
      device: visitor.device_type,
      browser: visitor.browser,
      downloads: dlCount,
      playlists: playlistsProcessed,
      maskedIp: visitor.masked_ip || '103.XX.XX.42',
      recentDownloads,
    };
  } catch (err) {
    console.error('getVisitorDetails error:', err);
    return null;
  }
}

// 7b. Get Playlist Sessions
export function getPlaylistEvents(limit = 50, offset = 0) {
  try {
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as c FROM playlist_events').get() as any)?.c || 0;
    const rows = db.prepare('SELECT * FROM playlist_events ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    return {
      playlists: rows.map((r) => ({
        id: r.id,
        visitorId: r.visitor_id,
        playlistId: r.playlist_id,
        playlistTitle: r.playlist_title,
        totalTracks: r.track_count,
        selectedTracks: r.selected_count,
        completedTracks: r.completed_count,
        failedTracks: r.failed_count,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      total: count,
    };
  } catch (err) {
    console.error('getPlaylistEvents error:', err);
    return { playlists: [], total: 0 };
  }
}

// 8. Get Recent Chronological Activity
export function getRecentActivity(limit = 40) {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 'download' as type, id, visitor_id, title, status, playlist_title, format, quality, created_at
      FROM download_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => {
      let desc = `downloaded "${r.title}"`;
      if (r.status === 'failed') {
        desc = `failed processing "${r.title}"`;
      } else if (r.status === 'queued') {
        desc = `queued "${r.title}"`;
      } else if (r.status === 'cancelled') {
        desc = `cancelled "${r.title}"`;
      }

      return {
        id: r.id,
        type: r.type,
        visitorId: r.visitor_id,
        description: desc,
        timestamp: r.created_at,
        status: r.status,
        details: {
          playlist: r.playlist_title,
          format: r.format,
          quality: r.quality,
        },
      };
    });
  } catch (err) {
    console.error('getRecentActivity error:', err);
    return [];
  }
}

// 9. Admin Login Rate Limiter (Max 5 failed attempts per 15 minutes)
export function checkAdminRateLimit(ip: string): {
  allowed: boolean;
  blocked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
  lockedUntil?: number;
} {
  try {
    const db = getDb();
    const now = Date.now();
    const row = db.prepare('SELECT * FROM admin_rate_limits WHERE ip = ?').get(ip) as any;

    if (!row) {
      return { allowed: true, blocked: false, remainingAttempts: 5, retryAfterSeconds: 0 };
    }

    if (row.locked_until && row.locked_until > now) {
      const waitSec = Math.max(1, Math.ceil((row.locked_until - now) / 1000));
      return {
        allowed: false,
        blocked: true,
        remainingAttempts: 0,
        retryAfterSeconds: waitSec,
        lockedUntil: row.locked_until,
      };
    }

    // Reset if last attempt was more than 15 minutes ago
    if (now - row.last_attempt > 15 * 60 * 1000) {
      db.prepare('DELETE FROM admin_rate_limits WHERE ip = ?').run(ip);
      return { allowed: true, blocked: false, remainingAttempts: 5, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(0, 5 - (row.attempts || 0));
    return {
      allowed: remaining > 0,
      blocked: remaining <= 0,
      remainingAttempts: remaining,
      retryAfterSeconds: 0,
    };
  } catch {
    return { allowed: true, blocked: false, remainingAttempts: 5, retryAfterSeconds: 0 };
  }
}

export function recordAdminFailedAttempt(ip: string): {
  locked: boolean;
  blocked: boolean;
  lockedUntil?: number;
} {
  try {
    const db = getDb();
    const now = Date.now();
    const row = db.prepare('SELECT * FROM admin_rate_limits WHERE ip = ?').get(ip) as any;

    const attempts = (row?.attempts || 0) + 1;
    let lockedUntil = 0;

    if (attempts >= 5) {
      lockedUntil = now + 15 * 60 * 1000; // 15 min lockout
    }

    db.prepare(`
      INSERT INTO admin_rate_limits (ip, attempts, last_attempt, locked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        attempts = ?,
        last_attempt = ?,
        locked_until = ?
    `).run(ip, attempts, now, lockedUntil, attempts, now, lockedUntil);

    const isLocked = attempts >= 5;
    return { locked: isLocked, blocked: isLocked, lockedUntil };
  } catch {
    return { locked: false, blocked: false };
  }
}

export function resetAdminRateLimit(ip: string): void {
  try {
    const db = getDb();
    db.prepare('DELETE FROM admin_rate_limits WHERE ip = ?').run(ip);
  } catch {}
}
