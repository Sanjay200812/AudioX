export type AudioFormat = 'mp3' | 'm4a';
export type AudioQuality = 'standard' | 'high' | 'best' | '128k' | '192k' | '256k' | '320k';

export type MediaSource = 'youtube' | 'youtube_playlist' | 'local' | 'instagram';

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'fetching'
  | 'extracting'
  | 'converting'
  | 'metadata'
  | 'finalizing'
  | 'ready'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type JobProgressStage =
  | 'idle'
  | 'preparing'
  | 'fetching'
  | 'extracting'
  | 'converting'
  | 'metadata'
  | 'finalizing'
  | 'ready';

export type FilenameFormat =
  | 'artist_title'
  | 'title'
  | 'index_artist_title'
  | 'playlist_index_title';

export type AutoRemoveOption = 'never' | 'immediately' | '5min';

export interface QueueJob {
  id: string;
  source: MediaSource;
  sourceUrl: string;
  mediaId: string;
  playlistId?: string;
  playlistIndex?: number;
  playlistTitle?: string;
  title: string;
  artist?: string;
  thumbnail: string;
  duration: number; // in seconds
  format: AudioFormat;
  quality: AudioQuality;
  status: JobStatus;
  stage: JobProgressStage;
  progress: number; // 0 to 100
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  downloadToken?: string;
  temporaryFilePath?: string;
  fileName?: string;
  fileSize?: number;
}

export interface ClientQueueJob {
  id: string;
  source: MediaSource;
  sourceUrl: string;
  mediaId: string;
  playlistId?: string;
  playlistIndex?: number;
  playlistTitle?: string;
  title: string;
  artist?: string;
  thumbnail: string;
  duration: number;
  format: AudioFormat;
  quality: AudioQuality;
  status: JobStatus;
  stage: JobProgressStage;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  downloadToken?: string;
  fileName?: string;
  fileSize?: number;
}

export interface PlaylistTrack {
  index: number;
  id: string;
  url: string;
  title: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string;
  author?: string;
  isAvailable: boolean;
}

export interface PlaylistMetadata {
  id: string;
  url: string;
  title: string;
  author?: string;
  trackCount: number;
  availableTrackCount: number;
  totalDuration: number;
  totalDurationFormatted: string;
  thumbnail: string;
  tracks: PlaylistTrack[];
}

export interface SingleMediaMetadata {
  id: string;
  url: string;
  title: string;
  author?: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string;
  source: MediaSource;
  estimatedSizeMp3: string;
  estimatedSizeM4a: string;
  isPlaylist?: boolean;
  hasPlaylistParam?: boolean;
  playlistId?: string;
  playlistUrl?: string;
}

export interface AnalysisResponse {
  type: 'single' | 'playlist';
  source: MediaSource;
  single?: SingleMediaMetadata;
  playlist?: PlaylistMetadata;
}

export interface DownloadHistoryItem {
  id: string;
  mediaId: string;
  playlistId?: string;
  title: string;
  artist?: string;
  thumbnail: string;
  source: MediaSource;
  format: AudioFormat;
  quality: AudioQuality;
  fileSize?: number;
  fileSizeFormatted?: string;
  fileName: string;
  downloadToken?: string;
  completedAt: number;
}

export interface UserSettings {
  defaultFormat: AudioFormat;
  defaultQuality: AudioQuality;
  filenameFormat: FilenameFormat;
  autoStartQueue: boolean;
  autoDownload: boolean;
  downloadMode: 'auto' | 'manual';
  autoRemoveCompleted: AutoRemoveOption;
  saveHistory: boolean;
  theme: 'dark' | 'system' | 'light';
}
