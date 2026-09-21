import { IMediaProvider } from './types';
import { YouTubeProvider } from './youtube.provider';
import { LocalProvider } from './local.provider';

// Note: InstagramProvider is postponed for V1 to focus exclusively on YouTube & local media.
// import { InstagramProvider } from './instagram.provider';

const providers: IMediaProvider[] = [
  new YouTubeProvider(),
  new LocalProvider(),
];

export function getProvider(urlOrPath: string): IMediaProvider {
  for (const provider of providers) {
    if (provider.canHandle(urlOrPath)) {
      return provider;
    }
  }

  throw new Error(
    'Unsupported media source. AudioX V1 supports YouTube videos, Shorts, playlists, and local files.'
  );
}

export { YouTubeProvider, LocalProvider };
