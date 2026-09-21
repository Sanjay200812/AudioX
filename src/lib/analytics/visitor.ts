/**
 * Client-side anonymous visitor identification and lightweight telemetry helper.
 * Strictly adheres to privacy constraints: zero personal data, zero aggressive fingerprinting.
 */

const VISITOR_ID_KEY = 'audiox_vid';

export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'AX-SERVER';

  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.startsWith('AX-')) {
      return existing;
    }

    // Generate clean anonymous identifier: AX-XXXXXXXX (e.g. AX-7F29C1AB)
    const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
    const newId = `AX-${randomHex}`;
    localStorage.setItem(VISITOR_ID_KEY, newId);
    return newId;
  } catch {
    return 'AX-ANON';
  }
}

export function detectDeviceType(): 'Desktop' | 'Mobile' | 'Tablet' {
  if (typeof window === 'undefined') return 'Desktop';
  const ua = navigator.userAgent.toLowerCase();

  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'Tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'Mobile';
  }
  return 'Desktop';
}

export function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Browser';
  const ua = navigator.userAgent;

  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return 'Browser';
}

export interface ClientAnalyticsEvent {
  status: 'queued' | 'processed' | 'downloaded' | 'failed' | 'cancelled' | 'skipped';
  videoId?: string;
  title: string;
  creator?: string;
  playlistId?: string;
  playlistTitle?: string;
  format: string;
  quality: string;
  filename?: string;
  isRedownload?: boolean;
  processingDurationMs?: number;
}

/**
 * Record visitor session on page load / open.
 * Fire-and-forget, non-blocking.
 */
export function recordVisitAnalytics(): void {
  if (typeof window === 'undefined') return;

  try {
    const visitorId = getOrCreateVisitorId();
    const deviceType = detectDeviceType();
    const browser = detectBrowser();

    fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        deviceType,
        browser,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/**
 * Fire-and-forget lightweight download event logger.
 * Never throws, never blocks UI or media downloads.
 */
export function sendAnalyticsEvent(event: ClientAnalyticsEvent): void {
  if (typeof window === 'undefined') return;

  try {
    const visitorId = getOrCreateVisitorId();
    const deviceType = detectDeviceType();
    const browser = detectBrowser();

    fetch('/api/analytics/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        deviceType,
        browser,
        ...event,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export interface ClientPlaylistEvent {
  playlistId?: string;
  playlistTitle?: string;
  totalTracks?: number;
  selectedTracks?: number;
  trackCount?: number;
  selectedCount?: number;
  completedTracks?: number;
  failedTracks?: number;
}

export function sendPlaylistAnalytics(event: ClientPlaylistEvent): void {
  if (typeof window === 'undefined') return;

  try {
    const visitorId = getOrCreateVisitorId();
    fetch('/api/analytics/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        playlistId: event.playlistId,
        playlistTitle: event.playlistTitle,
        totalTracks: event.totalTracks ?? event.trackCount ?? 0,
        selectedTracks: event.selectedTracks ?? event.selectedCount ?? 0,
        completedTracks: event.completedTracks ?? 0,
        failedTracks: event.failedTracks ?? 0,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
