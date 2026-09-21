import { SingleMediaMetadata, PlaylistMetadata, MediaSource } from '../types';

export interface ProviderAnalysisResult {
  type: 'single' | 'playlist';
  source: MediaSource;
  single?: SingleMediaMetadata;
  playlist?: PlaylistMetadata;
}

export interface PreparedMedia {
  sourceFilePath: string;
  title: string;
  artist?: string;
  album?: string;
  coverPath?: string;
  duration?: number;
  year?: string;
}

export interface IMediaProvider {
  name: string;
  canHandle(urlOrPath: string): boolean;
  analyze(urlOrPath: string): Promise<ProviderAnalysisResult>;
  prepareMedia(
    urlOrPath: string,
    outputDir: string,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<PreparedMedia>;
}
