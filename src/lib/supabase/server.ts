import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let hasLoggedConfigWarning = false;

/**
 * Check if Supabase environment variables are properly configured.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  return Boolean(url && secretKey && url.startsWith('http'));
}

/**
 * Get or create server-only Supabase admin client.
 * Uses SUPABASE_SECRET_KEY for full server-side access bypassing RLS.
 * Never exposes credentials to client-side code.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    if (!hasLoggedConfigWarning) {
      console.warn('⚠️ [AudioX Analytics] Supabase analytics is not configured. Telemetry is operating in fallback/disabled mode.');
      hasLoggedConfigWarning = true;
    }
    return null;
  }

  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL!.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY!.trim();

  try {
    cachedClient = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          const timeoutSignal = AbortSignal.timeout(4000);
          const signal = init?.signal
            ? AbortSignal.any([init.signal, timeoutSignal])
            : timeoutSignal;
          return fetch(input, { ...init, signal });
        },
      },
    });
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

// -------------------------------------------------------------
// ANALYTICS DATA ACCESS HELPERS (NON-BLOCKING & FAIL-SAFE)
// -------------------------------------------------------------

export interface SupabaseVisitorInput {
  visitorId: string;
  deviceType?: string;
  browser?: string;
}

export interface SupabaseDownloadEventInput {
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
  isRedownload?: boolean;
}

export interface SupabasePlaylistEventInput {
  visitorId: string;
  playlistId?: string;
  playlistTitle: string;
  totalTracks: number;
  selectedTracks: number;
  completedTracks?: number;
  failedTracks?: number;
}

/**
 * Record or update anonymous visitor in Supabase.
 * Uses upsert on visitor_id.
 */
export async function recordSupabaseVisitor(data: SupabaseVisitorInput): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return false;

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('anonymous_visitors')
      .upsert(
        {
          visitor_id: data.visitorId,
          device_type: data.deviceType || 'Desktop',
          browser: data.browser || 'Browser',
          last_seen: now,
          updated_at: now,
        },
        { onConflict: 'visitor_id' }
      );

    if (error) {
      console.warn('Supabase visitor upsert notice:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('Supabase visitor recording error (ignored):', err?.message || err);
    return false;
  }
}

/**
 * Record media download event in Supabase.
 */
export async function recordSupabaseDownloadEvent(data: SupabaseDownloadEventInput): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from('download_events').insert({
      visitor_id: data.visitorId,
      video_id: data.videoId || null,
      title: data.title,
      creator: data.creator || null,
      playlist_id: data.playlistId || null,
      playlist_title: data.playlistTitle || null,
      format: data.format || 'mp3',
      quality: data.quality || 'high',
      status: data.status || 'downloaded',
      filename: data.filename || null,
      processing_duration_ms: data.processingDurationMs || 0,
      is_redownload: Boolean(data.isRedownload),
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Supabase download event insert notice:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('Supabase download event error (ignored):', err?.message || err);
    return false;
  }
}

/**
 * Record or update playlist processing event in Supabase.
 */
export async function recordSupabasePlaylistEvent(data: SupabasePlaylistEventInput): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return false;

  try {
    const now = new Date().toISOString();
    if (data.playlistId) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('playlist_events')
        .select('id, completed_tracks, failed_tracks, selected_tracks, total_tracks')
        .eq('visitor_id', data.visitorId)
        .eq('playlist_id', data.playlistId)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const updateData: any = { updated_at: now };
        if (data.totalTracks) updateData.total_tracks = data.totalTracks;
        if (data.selectedTracks) updateData.selected_tracks = data.selectedTracks;
        if (typeof data.completedTracks === 'number') {
          updateData.completed_tracks = Math.max(existing.completed_tracks || 0, data.completedTracks);
        }
        if (typeof data.failedTracks === 'number') {
          updateData.failed_tracks = Math.max(existing.failed_tracks || 0, data.failedTracks);
        }
        await supabase.from('playlist_events').update(updateData).eq('id', existing.id);
        return true;
      }
    }

    const { error } = await supabase.from('playlist_events').insert({
      visitor_id: data.visitorId,
      playlist_id: data.playlistId || null,
      playlist_title: data.playlistTitle || 'Untitled Playlist',
      total_tracks: data.totalTracks || 0,
      selected_tracks: data.selectedTracks || 0,
      completed_tracks: data.completedTracks || 0,
      failed_tracks: data.failedTracks || 0,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.warn('Supabase playlist event notice:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('Supabase playlist event error (ignored):', err?.message || err);
    return false;
  }
}

/**
 * Increment completed or failed track counts for an active playlist session in Supabase.
 */
export async function incrementSupabasePlaylistTrack(
  visitorId: string,
  playlistId: string,
  type: 'completed' | 'failed'
): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !playlistId) return false;

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('playlist_events')
      .select('id, completed_tracks, failed_tracks')
      .eq('visitor_id', visitorId)
      .eq('playlist_id', playlistId)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const now = new Date().toISOString();
      if (type === 'completed') {
        await supabase
          .from('playlist_events')
          .update({ completed_tracks: (existing.completed_tracks || 0) + 1, updated_at: now })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('playlist_events')
          .update({ failed_tracks: (existing.failed_tracks || 0) + 1, updated_at: now })
          .eq('id', existing.id);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch overview analytics metrics from Supabase.
 */
export async function getSupabaseOverviewStats() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalVisitorsRes,
      visitorsTodayRes,
      totalDownloadsRes,
      downloadsTodayRes,
      downloadsWeekRes,
      downloadsMonthRes,
      failedDownloadsRes,
      playlistsRes,
      redownloadsRes,
      mp3Res,
      m4aRes,
      playlistDownloadsRes,
      trendDataRes,
    ] = await Promise.all([
      supabase.from('anonymous_visitors').select('id', { count: 'exact', head: true }),
      supabase.from('anonymous_visitors').select('id', { count: 'exact', head: true }).gte('last_seen', startOfToday),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded'),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').gte('created_at', startOfToday),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').gte('created_at', weekAgo),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').gte('created_at', monthAgo),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('playlist_events').select('completed_tracks'),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('is_redownload', true).eq('status', 'downloaded'),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').eq('format', 'mp3'),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').eq('format', 'm4a'),
      supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('status', 'downloaded').not('playlist_id', 'is', null),
      supabase.from('download_events').select('created_at').eq('status', 'downloaded').gte('created_at', weekAgo),
    ]);

    const totalDownloads = totalDownloadsRes.count || 0;
    const playlistTrackCount = playlistDownloadsRes.count || 0;
    const singleVideoCount = Math.max(0, totalDownloads - playlistTrackCount);
    const totalPlaylistSessions = playlistsRes.data?.length || 0;
    const totalPlaylistTracksDownloaded = playlistsRes.data?.reduce((sum, p) => sum + (p.completed_tracks || 0), 0) || 0;

    // Build 7-day trend
    const trendMap: Record<string, number> = {};
    const dailyTrend: Array<{ day: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(d);
      const isoPrefix = d.toISOString().slice(0, 10);
      trendMap[isoPrefix] = 0;
      dailyTrend.push({ day: label, count: 0 });
    }

    if (trendDataRes.data) {
      for (const row of trendDataRes.data) {
        const rowIso = row.created_at?.slice(0, 10);
        if (rowIso && trendMap[rowIso] !== undefined) {
          trendMap[rowIso]++;
        }
      }
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const isoPrefix = d.toISOString().slice(0, 10);
        dailyTrend[i].count = trendMap[isoPrefix] || 0;
      }
    }

    return {
      configured: true,
      totalVisitors: totalVisitorsRes.count || 0,
      uniqueVisitors: totalVisitorsRes.count || 0,
      visitorsToday: visitorsTodayRes.count || 0,
      activeVisitors24h: visitorsTodayRes.count || 0,
      totalDownloads,
      downloadsToday: downloadsTodayRes.count || 0,
      downloadsThisWeek: downloadsWeekRes.count || 0,
      downloadsThisMonth: downloadsMonthRes.count || 0,
      successfulDownloads: totalDownloads,
      failedDownloads: failedDownloadsRes.count || 0,
      totalPlaylistSessions,
      totalPlaylistTracksDownloaded,
      redownloadCount: redownloadsRes.count || 0,
      singleVideoCount,
      playlistTrackCount,
      mp3Count: mp3Res.count || 0,
      m4aCount: m4aRes.count || 0,
      dailyTrend,
    };
  } catch (err) {
    console.error('getSupabaseOverviewStats error:', err);
    return null;
  }
}

/**
 * Fetch filtered download events from Supabase.
 */
export async function getSupabaseDownloadEvents(params: {
  range?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    let query = supabase.from('download_events').select('*', { count: 'exact' });

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    if (params.range === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfToday.toISOString());
    } else if (params.range === '7d') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', weekAgo);
    } else if (params.range === '30d') {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', monthAgo);
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      query = query.or(`title.ilike.${q},creator.ilike.${q},visitor_id.ilike.${q}`);
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      configured: true,
      downloads: (data || []).map((r) => ({
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
      })),
      total: count || 0,
    };
  } catch (err) {
    console.error('getSupabaseDownloadEvents error:', err);
    return null;
  }
}

/**
 * Fetch visitors from Supabase.
 */
export async function getSupabaseVisitors(limit = 50, offset = 0) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, count, error } = await supabase
      .from('anonymous_visitors')
      .select('*', { count: 'exact' })
      .order('last_seen', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get aggregated download counts for these visitors
    const visitorsWithCounts = await Promise.all(
      (data || []).map(async (v) => {
        const [dlRes, plRes] = await Promise.all([
          supabase.from('download_events').select('id', { count: 'exact', head: true }).eq('visitor_id', v.visitor_id),
          supabase.from('playlist_events').select('id', { count: 'exact', head: true }).eq('visitor_id', v.visitor_id),
        ]);

        return {
          id: v.id,
          visitorId: v.visitor_id,
          firstSeen: v.first_seen,
          lastSeen: v.last_seen,
          device: v.device_type,
          browser: v.browser,
          downloads: dlRes.count || 0,
          playlists: plRes.count || 0,
          maskedIp: 'Anonymous',
        };
      })
    );

    return {
      configured: true,
      visitors: visitorsWithCounts,
      total: count || 0,
    };
  } catch (err) {
    console.error('getSupabaseVisitors error:', err);
    return null;
  }
}

/**
 * Fetch playlist sessions from Supabase.
 */
export async function getSupabasePlaylists(limit = 50, offset = 0) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, count, error } = await supabase
      .from('playlist_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      configured: true,
      playlists: (data || []).map((p) => ({
        id: p.id,
        visitorId: p.visitor_id,
        playlistId: p.playlist_id,
        playlistTitle: p.playlist_title,
        totalTracks: p.total_tracks,
        selectedTracks: p.selected_tracks,
        completedTracks: p.completed_tracks,
        failedTracks: p.failed_tracks,
        createdAt: p.created_at,
      })),
      total: count || 0,
    };
  } catch (err) {
    console.error('getSupabasePlaylists error:', err);
    return null;
  }
}

/**
 * Fetch recent activity feed from Supabase.
 */
export async function getSupabaseActivity(limit = 40) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const [downloadsRes, playlistsRes] = await Promise.all([
      supabase.from('download_events').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('playlist_events').select('*').order('created_at', { ascending: false }).limit(limit),
    ]);

    const items: Array<{
      id: string;
      type: string;
      visitorId: string;
      description: string;
      timestamp: string;
      status: string;
      details?: any;
    }> = [];

    for (const d of downloadsRes.data || []) {
      let desc = `downloaded "${d.title}"`;
      if (d.status === 'failed') desc = `failed "${d.title}"`;
      else if (d.status === 'queued') desc = `queued "${d.title}"`;
      else if (d.status === 'cancelled') desc = `cancelled "${d.title}"`;

      items.push({
        id: d.id,
        type: 'download',
        visitorId: d.visitor_id,
        description: desc,
        timestamp: d.created_at,
        status: d.status,
        details: { playlist: d.playlist_title, format: d.format, quality: d.quality },
      });
    }

    for (const p of playlistsRes.data || []) {
      items.push({
        id: p.id,
        type: 'playlist',
        visitorId: p.visitor_id,
        description: `processed playlist "${p.playlist_title}" (${p.completed_tracks}/${p.selected_tracks} tracks)`,
        timestamp: p.created_at,
        status: p.failed_tracks > 0 ? 'partial' : 'downloaded',
        details: { total: p.total_tracks, completed: p.completed_tracks, failed: p.failed_tracks },
      });
    }

    // Sort descending by timestamp
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      configured: true,
      activity: items.slice(0, limit),
    };
  } catch (err) {
    console.error('getSupabaseActivity error:', err);
    return null;
  }
}

/**
 * Fetch granular visitor details from Supabase.
 */
export async function getSupabaseVisitorDetails(visitorId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const [visitorRes, downloadsRes, playlistsRes] = await Promise.all([
      supabase.from('anonymous_visitors').select('*').eq('visitor_id', visitorId).maybeSingle(),
      supabase.from('download_events').select('*').eq('visitor_id', visitorId).order('created_at', { ascending: false }).limit(20),
      supabase.from('playlist_events').select('id', { count: 'exact', head: true }).eq('visitor_id', visitorId),
    ]);

    if (!visitorRes.data) return null;

    const v = visitorRes.data;
    const recentDownloads = (downloadsRes.data || []).map((r) => ({
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

    const dlSuccessCount = (downloadsRes.data || []).filter((d) => d.status === 'downloaded').length;

    return {
      visitorId: v.visitor_id,
      firstSeen: v.first_seen,
      lastSeen: v.last_seen,
      device: v.device_type,
      browser: v.browser,
      downloads: dlSuccessCount,
      playlists: playlistsRes.count || 0,
      maskedIp: 'Anonymous',
      recentDownloads,
    };
  } catch (err) {
    console.error('getSupabaseVisitorDetails error:', err);
    return null;
  }
}

/**
 * Clean development and test records from Supabase tables without touching real data.
 */
export async function cleanSupabaseTestRecords(): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    await Promise.all([
      supabase
        .from('download_events')
        .delete()
        .or('visitor_id.like.AX-TEST%,visitor_id.like.AX-E2E%,visitor_id.like.AX-SCENARIO%,visitor_id.like.AX-VTEST%,video_id.like.vid_test%'),
      supabase
        .from('playlist_events')
        .delete()
        .or('visitor_id.like.AX-TEST%,visitor_id.like.AX-E2E%,visitor_id.like.AX-SCENARIO%'),
      supabase
        .from('anonymous_visitors')
        .delete()
        .or('visitor_id.like.AX-TEST%,visitor_id.like.AX-E2E%,visitor_id.like.AX-SCENARIO%,visitor_id.like.AX-VTEST%'),
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Check Supabase health for system status page.
 */
export async function getSupabaseHealthStatus(): Promise<'Connected' | 'Not Configured' | 'Unavailable'> {
  if (!isSupabaseConfigured()) {
    return 'Not Configured';
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return 'Unavailable';
  }

  try {
    const { error } = await supabase.from('anonymous_visitors').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      return 'Unavailable';
    }
    return 'Connected';
  } catch {
    return 'Unavailable';
  }
}


