import { FilenameFormat } from '../types';

export interface FormatFileNameOptions {
  title: string;
  artist?: string;
  playlistTitle?: string;
  trackIndex?: number;
  format?: FilenameFormat;
  ext?: string;
}

export function sanitizeFileName(
  rawTitle: string,
  artist?: string,
  ext = 'mp3',
  options?: {
    format?: FilenameFormat;
    playlistTitle?: string;
    trackIndex?: number;
  }
): string {
  const format = options?.format || 'artist_title';
  const cleanTitle = (rawTitle || 'AudioX_Track').trim();
  const cleanArtist = (artist || '').trim();
  const cleanPlaylist = (options?.playlistTitle || '').trim();
  const indexStr = options?.trackIndex !== undefined
    ? (options.trackIndex < 10 ? `0${options.trackIndex}` : `${options.trackIndex}`)
    : '';

  let nameStem = '';

  switch (format) {
    case 'title':
      nameStem = cleanTitle;
      break;

    case 'index_artist_title':
      if (indexStr && cleanArtist && !cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase())) {
        nameStem = `${indexStr} - ${cleanArtist} - ${cleanTitle}`;
      } else if (indexStr) {
        nameStem = `${indexStr} - ${cleanTitle}`;
      } else if (cleanArtist && !cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase())) {
        nameStem = `${cleanArtist} - ${cleanTitle}`;
      } else {
        nameStem = cleanTitle;
      }
      break;

    case 'playlist_index_title':
      if (cleanPlaylist && indexStr) {
        nameStem = `${cleanPlaylist} - ${indexStr} - ${cleanTitle}`;
      } else if (indexStr) {
        nameStem = `${indexStr} - ${cleanTitle}`;
      } else {
        nameStem = cleanTitle;
      }
      break;

    case 'artist_title':
    default:
      if (cleanArtist && !cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase())) {
        nameStem = `${cleanArtist} - ${cleanTitle}`;
      } else {
        nameStem = cleanTitle;
      }
      break;
  }

  // Strip illegal Windows & POSIX characters: \ / : * ? " < > |
  let sanitized = nameStem
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '') // control characters
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    sanitized = 'AudioX_Track';
  }

  // Safe length limit (max 120 chars for filename stem)
  if (sanitized.length > 120) {
    sanitized = sanitized.substring(0, 120).trim();
  }

  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  return `${sanitized}.${cleanExt}`;
}

export function deduplicateFileName(fileName: string, existingNames: Set<string>): string {
  if (!existingNames.has(fileName)) {
    return fileName;
  }

  const lastDot = fileName.lastIndexOf('.');
  const base = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot !== -1 ? fileName.substring(lastDot) : '';

  let counter = 2;
  let candidate = `${base} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${base} (${counter})${ext}`;
  }

  return candidate;
}
