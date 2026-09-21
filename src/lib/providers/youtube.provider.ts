import { IMediaProvider, PreparedMedia, ProviderAnalysisResult } from './types';
import { PlaylistTrack } from '../types';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function estimateAudioSize(seconds: number, bitrateKbps: number): string {
  if (!seconds || seconds <= 0) return '—';
  const bytes = (seconds * bitrateKbps * 1000) / 8;
  const mb = bytes / (1024 * 1024);
  return `~${mb.toFixed(1)} MB`;
}

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.slice(1).split('/')[0].split('?')[0];
      return id && id.length === 11 ? id : id || null;
    }
    if (parsed.pathname.includes('/shorts/')) {
      const parts = parsed.pathname.split('/shorts/');
      const id = parts[1]?.split('/')[0].split('?')[0];
      return id || null;
    }
    if (parsed.pathname.includes('/embed/')) {
      const parts = parsed.pathname.split('/embed/');
      const id = parts[1]?.split('/')[0].split('?')[0];
      return id || null;
    }
    const v = parsed.searchParams.get('v');
    if (v) return v;
  } catch {}

  const match = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]{11})/);
  return match ? match[1] : null;
}

export function extractPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('list');
  } catch {
    const match = url.match(/[?&]list=([^#&?]+)/);
    return match ? match[1] : null;
  }
}

export class YouTubeProvider implements IMediaProvider {
  name = 'YouTube';

  canHandle(urlOrPath: string): boolean {
    if (!urlOrPath) return false;
    const lower = urlOrPath.toLowerCase();
    return (
      lower.includes('youtube.com/') ||
      lower.includes('youtu.be/') ||
      lower.includes('music.youtube.com/')
    );
  }

  async analyze(url: string, forcePlaylist = false): Promise<ProviderAnalysisResult> {
    const isDirectPlaylist = url.includes('/playlist') && url.includes('list=');
    const isVideoWithPlaylist =
      (url.includes('watch?v=') || url.includes('youtu.be/') || url.includes('/shorts/')) &&
      url.includes('list=');

    // 1. Explicit /playlist URL
    if (isDirectPlaylist) {
      return this.extractPlaylistMetadata(url);
    }

    // 2. Video with playlist parameter
    if (isVideoWithPlaylist) {
      try {
        const [playlistRes, singleRes] = await Promise.all([
          this.extractPlaylistMetadata(url),
          this.extractSingleMetadata(url).catch(() => null),
        ]);

        return {
          type: 'playlist',
          source: 'youtube_playlist',
          playlist: playlistRes.playlist,
          single: singleRes?.single,
        };
      } catch {
        // Fallback to single video if playlist extraction fails
        return this.extractSingleMetadata(url);
      }
    }

    // 3. Normal single video
    return this.extractSingleMetadata(url);
  }

  /**
   * Fast native HTTP metadata extraction for single YouTube videos.
   * Utilizes official YouTube oEmbed API combined with lightweight watch-page inspection.
   * Strict 3.5s timeout. Zero Python/yt-dlp dependency on Vercel.
   */
  public async extractSingleMetadata(url: string): Promise<ProviderAnalysisResult> {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Could not identify a valid YouTube video ID from this URL.');
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const defaultThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // 1. Fetch oEmbed metadata with strict 3.5s timeout
    const oembedPromise = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
        const res = await fetch(oembedUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'AudioX-Engine/1.0',
            Accept: 'application/json',
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('This YouTube video was not found, is private, or has been removed.');
          }
          throw new Error(`YouTube oEmbed responded with status ${res.status}`);
        }
        return await res.json();
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('YouTube metadata request timed out.');
        }
        throw err;
      }
    })();

    // 2. Fetch watch page HTML concurrently with strict 3.5s timeout for duration and creator details
    const watchPagePromise = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(canonicalUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        return await res.text();
      } catch {
        clearTimeout(timeoutId);
        return null;
      }
    })();

    try {
      const [oembed, html] = await Promise.all([
        oembedPromise,
        watchPagePromise,
      ]);

      let duration = 0;
      let isLive = false;

      if (html) {
        if (html.includes('"isLive":true') || html.includes('"liveStreamability"')) {
          isLive = true;
        }

        const durMsMatch = html.match(/"approxDurationMs":"(\d+)"/);
        const durSecMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (durSecMatch && parseInt(durSecMatch[1], 10) > 0) {
          duration = parseInt(durSecMatch[1], 10);
        } else if (durMsMatch && parseInt(durMsMatch[1], 10) > 0) {
          duration = Math.round(parseInt(durMsMatch[1], 10) / 1000);
        }
      }

      if (isLive) {
        throw new Error('Live streams are not supported in AudioX V1.');
      }

      const title = oembed?.title || 'YouTube Audio';
      const author = oembed?.author_name || 'YouTube Creator';
      const thumbnail = oembed?.thumbnail_url || defaultThumbnail;

      return {
        type: 'single',
        source: 'youtube',
        single: {
          id: videoId,
          url: canonicalUrl,
          title,
          author,
          duration,
          durationFormatted: formatDuration(duration),
          thumbnail,
          source: 'youtube',
          estimatedSizeMp3: estimateAudioSize(duration, 192),
          estimatedSizeM4a: estimateAudioSize(duration, 192),
          isPlaylist: false,
        },
      };
    } catch (err: any) {
      throw err;
    }
  }

  /**
   * Fast native HTTP metadata extraction for YouTube Playlists.
   * Utilizes YouTube Innertube Browse API with strict 4s timeout.
   * Zero Python/yt-dlp dependency on Vercel.
   */
  public async extractPlaylistMetadata(url: string): Promise<ProviderAnalysisResult> {
    const playlistId = extractPlaylistId(url);
    if (!playlistId) {
      throw new Error('Could not identify a valid YouTube playlist ID from this URL.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          browseId: `VL${playlistId}`,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Playlist browse returned status ${res.status}`);
      }

      const data = await res.json();

      // Check alerts (e.g. private or non-existent playlist)
      if (Array.isArray(data.alerts)) {
        for (const alert of data.alerts) {
          const alertText = alert?.alertRenderer?.text?.runs?.[0]?.text || '';
          if (alertText.includes('does not exist')) {
            throw new Error('The YouTube playlist does not exist or has been deleted.');
          }
          if (alertText.includes('private')) {
            throw new Error('This YouTube playlist is private.');
          }
        }
      }

      const header = data?.header?.playlistHeaderRenderer;
      const playlistTitle =
        header?.title?.simpleText ||
        data?.metadata?.playlistMetadataRenderer?.title ||
        'YouTube Playlist';
      const playlistAuthor =
        header?.ownerText?.runs?.[0]?.text ||
        data?.metadata?.playlistMetadataRenderer?.author ||
        'YouTube Creator';

      const sectionList =
        data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
          ?.sectionListRenderer?.contents;
      const items = sectionList?.[0]?.itemSectionRenderer?.contents || [];

      const tracks: PlaylistTrack[] = [];
      let totalDuration = 0;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];

        // Format A: Classic playlistVideoRenderer
        if (item.playlistVideoRenderer) {
          const v = item.playlistVideoRenderer;
          const vid = v.videoId;
          if (!vid) continue;

          const trackTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || `Track ${idx + 1}`;
          const durSec = parseInt(v.lengthSeconds || '0', 10);
          if (durSec > 0) totalDuration += durSec;

          const isUnavailable =
            !vid ||
            trackTitle === '[Deleted video]' ||
            trackTitle === '[Private video]' ||
            trackTitle === '[Unavailable video]' ||
            v.isPlayable === false;

          tracks.push({
            index: idx + 1,
            id: vid,
            url: `https://www.youtube.com/watch?v=${vid}`,
            title: trackTitle,
            duration: durSec,
            durationFormatted: formatDuration(durSec),
            thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            author: v.shortBylineText?.runs?.[0]?.text || playlistAuthor,
            isAvailable: !isUnavailable,
          });
        }

        // Format B: Modern lockupViewModel
        else if (item.lockupViewModel) {
          const lk = item.lockupViewModel;
          const jsonStr = JSON.stringify(lk);
          const vidMatch = jsonStr.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          const vid = vidMatch ? vidMatch[1] : null;
          if (!vid) continue;

          const trackTitle =
            lk?.metadata?.lockupMetadataViewModel?.title?.content || `Track ${idx + 1}`;
          const trackAuthor =
            lk?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
              ?.metadataRows?.[0]?.elements?.[0]?.text?.content || playlistAuthor;

          let durSec = 0;
          const timeMatch = jsonStr.match(
            /"label":"(?:(\d+)\s+hours?,\s+)?(?:(\d+)\s+minutes?,\s+)?(\d+)\s+seconds?"/
          );
          if (timeMatch) {
            const h = parseInt(timeMatch[1] || '0', 10);
            const m = parseInt(timeMatch[2] || '0', 10);
            const s = parseInt(timeMatch[3] || '0', 10);
            durSec = h * 3600 + m * 60 + s;
          }
          if (durSec > 0) totalDuration += durSec;

          const isUnavailable =
            trackTitle.includes('[Deleted') ||
            trackTitle.includes('[Private') ||
            trackTitle.includes('[Unavailable');

          tracks.push({
            index: idx + 1,
            id: vid,
            url: `https://www.youtube.com/watch?v=${vid}`,
            title: trackTitle,
            duration: durSec,
            durationFormatted: formatDuration(durSec),
            thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            author: trackAuthor,
            isAvailable: !isUnavailable,
          });
        }
      }

      if (tracks.length === 0) {
        throw new Error('No available tracks found in this YouTube playlist.');
      }

      const availableTrackCount = tracks.filter((t) => t.isAvailable).length;

      return {
        type: 'playlist',
        source: 'youtube_playlist',
        playlist: {
          id: playlistId,
          url: `https://www.youtube.com/playlist?list=${playlistId}`,
          title: playlistTitle,
          author: playlistAuthor,
          trackCount: tracks.length,
          availableTrackCount,
          totalDuration,
          totalDurationFormatted: formatDuration(totalDuration),
          thumbnail: tracks[0]?.thumbnail || `https://i.ytimg.com/vi/${tracks[0]?.id}/hqdefault.jpg`,
          tracks,
        },
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Playlist analysis timed out. Please verify link availability.');
      }
      throw new Error(err.message || 'Could not access YouTube playlist.');
    }
  }

}
