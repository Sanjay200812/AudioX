import { URL } from 'url';

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const PRIVATE_IP_REGEX = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|0\.|::1|localhost)/i;

export interface URLValidationResult {
  isValid: boolean;
  error?: string;
  source?: 'youtube' | 'youtube_playlist' | 'local';
  sanitizedUrl?: string;
  isPlaylist?: boolean;
  hasPlaylistParam?: boolean;
  playlistId?: string;
}

export function validateMediaUrl(rawUrl: string): URLValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL is required.' };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid YouTube URL.' };
  }

  // Enforce HTTPS or HTTP only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Unsupported protocol. Only HTTP and HTTPS are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private IPs / localhost / metadata services
  if (PRIVATE_IP_REGEX.test(hostname) || hostname === 'localhost' || hostname === '0.0.0.0') {
    return { isValid: false, error: 'Target host is not permitted.' };
  }

  // Check allowed YouTube hosts
  let isAllowed = false;
  for (const allowed of ALLOWED_HOSTS) {
    if (hostname === allowed || hostname.endsWith('.' + allowed)) {
      isAllowed = true;
      break;
    }
  }

  if (!isAllowed) {
    return {
      isValid: false,
      error: 'Unsupported domain. AudioX V1 supports YouTube video and playlist links.',
    };
  }

  // Detect YouTube video vs playlist vs video with playlist param
  const hasListParam = parsed.searchParams.has('list');
  const isDirectPlaylist = parsed.pathname.includes('/playlist') && hasListParam;
  const isVideoWithList = (parsed.pathname.includes('/watch') || hostname.includes('youtu.be')) && hasListParam;
  const isShorts = parsed.pathname.includes('/shorts/');
  const isStandardVideo = parsed.pathname.includes('/watch') || hostname.includes('youtu.be') || isShorts;

  const playlistId = hasListParam ? parsed.searchParams.get('list') || undefined : undefined;

  if (isDirectPlaylist) {
    return {
      isValid: true,
      source: 'youtube_playlist',
      sanitizedUrl: parsed.toString(),
      isPlaylist: true,
      playlistId,
    };
  }

  if (isVideoWithList) {
    return {
      isValid: true,
      source: 'youtube',
      sanitizedUrl: parsed.toString(),
      isPlaylist: false,
      hasPlaylistParam: true,
      playlistId,
    };
  }

  if (isStandardVideo) {
    return {
      isValid: true,
      source: 'youtube',
      sanitizedUrl: parsed.toString(),
      isPlaylist: false,
    };
  }

  return {
    isValid: false,
    error: 'Please enter a valid YouTube video, shorts, or playlist URL.',
  };
}
