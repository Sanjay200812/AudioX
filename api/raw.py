import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import yt_dlp

MAX_VIDEO_DURATION_SECONDS = 120 * 60  # 120 minutes limit

# Log installed yt-dlp version on server startup
print(f"[api/raw] yt-dlp version: {yt_dlp.version.__version__}", file=sys.stderr)


def sanitize_filename(name: str) -> str:
    cleaned = "".join(c for c in name if c.isalnum() or c in " ._-()[]'\"").strip()
    return cleaned or "audio_track"


def canonicalize_youtube_url(url_or_id: str) -> str:
    """Canonicalizes various YouTube URL formats (watch, youtu.be, shorts, music, bare ID) into standard watch URL."""
    if not url_or_id:
        return url_or_id
    cleaned = url_or_id.strip()

    # 1. Bare 11-character video ID
    if re.match(r"^[a-zA-Z0-9_-]{11}$", cleaned):
        return f"https://www.youtube.com/watch?v={cleaned}"

    # 2. youtu.be short link
    m_short = re.search(r"youtu\.be/([a-zA-Z0-9_-]{11})", cleaned)
    if m_short:
        return f"https://www.youtube.com/watch?v={m_short.group(1)}"

    # 3. youtube.com/shorts link
    m_shorts = re.search(r"(?:youtube\.com|music\.youtube\.com)/shorts/([a-zA-Z0-9_-]{11})", cleaned)
    if m_shorts:
        return f"https://www.youtube.com/watch?v={m_shorts.group(1)}"

    # 4. youtube.com or music.youtube.com watch link
    m_watch = re.search(r"(?:youtube\.com|music\.youtube\.com)/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})", cleaned)
    if m_watch:
        return f"https://www.youtube.com/watch?v={m_watch.group(1)}"

    return cleaned


class handler(BaseHTTPRequestHandler):
    def send_json_error(self, status_code: int, message: str):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.end_headers()
        response = json.dumps({"error": message})
        self.wfile.write(response.encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        url = params.get("url", [None])[0]
        fmt = params.get("format", ["m4a"])[0].lower()
        video_id = params.get("videoId", [None])[0]
        self.process_raw_extraction(url, fmt, video_id)

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                return self.send_json_error(400, "Request body is empty.")
            raw_body = self.rfile.read(content_length).decode("utf-8")
            body = json.loads(raw_body)
        except Exception:
            return self.send_json_error(400, "Invalid JSON payload.")

        url = body.get("url") or body.get("sourceUrl")
        fmt = (body.get("format") or "m4a").lower()
        video_id = body.get("videoId") or body.get("mediaId")
        self.process_raw_extraction(url, fmt, video_id)

    def process_raw_extraction(self, raw_url: str, target_format: str, video_id: str = None):
        if not raw_url and not video_id:
            return self.send_json_error(400, "Media URL or videoId is required.")

        canonical_url = canonicalize_youtube_url(video_id or raw_url)
        print(f"[api/raw] Processing extraction: {canonical_url} (target_format={target_format})", file=sys.stderr)

        job_id = str(uuid.uuid4())
        temp_dir = Path(tempfile.gettempdir()) / f"audiox_raw_{job_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            output_template = str(temp_dir / "audio.%(ext)s")

            # For M4A: prioritize native format 140 (AAC) so 0 FFmpeg transcoding is required
            # For MP3: get best audio stream available
            format_selector = "ba[ext=m4a]/ba/b" if target_format == "m4a" else "ba/b"

            ydl_opts = {
                "format": format_selector,
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                try:
                    # Single pass extraction and download: DO NOT call extract_info twice!
                    info = ydl.extract_info(canonical_url, download=True)
                except Exception as ex:
                    err_str = str(ex).lower()
                    print(f"[api/raw] yt-dlp exception: {ex}", file=sys.stderr)

                    if "private" in err_str:
                        print("[api/raw] Classification: PRIVATE_VIDEO", file=sys.stderr)
                        return self.send_json_error(404, "This video is private.")
                    elif "unavailable" in err_str or "does not exist" in err_str:
                        print("[api/raw] Classification: VIDEO_UNAVAILABLE", file=sys.stderr)
                        return self.send_json_error(404, "This video is unavailable.")
                    elif "sign in" in err_str or "age" in err_str or "login" in err_str:
                        print("[api/raw] Classification: AGE_OR_LOGIN_REQUIRED", file=sys.stderr)
                        return self.send_json_error(403, "This media requires login or age confirmation.")
                    elif "rate limit" in err_str or "too many requests" in err_str or "429" in err_str:
                        print("[api/raw] Classification: YOUTUBE_RATE_LIMIT", file=sys.stderr)
                        return self.send_json_error(429, "YouTube rate limit encountered. Please try again later.")
                    elif "timeout" in err_str or "timed out" in err_str:
                        print("[api/raw] Classification: NETWORK_TIMEOUT", file=sys.stderr)
                        return self.send_json_error(504, "Network timeout while fetching media.")
                    elif "unsupported url" in err_str or "not a valid url" in err_str:
                        print("[api/raw] Classification: UNSUPPORTED_SOURCE", file=sys.stderr)
                        return self.send_json_error(400, "Unsupported media source.")
                    else:
                        print("[api/raw] Classification: EXTRACTION_FAILED", file=sys.stderr)
                        return self.send_json_error(400, "Unable to extract media information from source.")

                if not info:
                    print("[api/raw] Classification: VIDEO_UNAVAILABLE (no info)", file=sys.stderr)
                    return self.send_json_error(404, "Media not found.")

                if info.get("is_live"):
                    return self.send_json_error(400, "Live streams cannot be processed.")

                duration = info.get("duration") or 0
                if duration > MAX_VIDEO_DURATION_SECONDS:
                    return self.send_json_error(
                        400,
                        f"Media exceeds maximum duration limit of 120 minutes ({duration // 60}m)."
                    )

            # Locate downloaded output file
            found_files = list(temp_dir.glob("audio.*"))
            valid_files = [f for f in found_files if not f.name.endswith(".part") and not f.name.endswith(".tmp")]

            if not valid_files:
                print("[api/raw] No output file found in temp dir after download", file=sys.stderr)
                return self.send_json_error(500, "Audio extraction failed to produce a file.")

            final_file = valid_files[0]
            file_ext = final_file.suffix.replace(".", "").lower()
            file_size = final_file.stat().st_size

            title = info.get("title") or "Audio Track"
            artist = info.get("uploader") or info.get("channel") or ""

            mime_type = "audio/mp4" if file_ext == "m4a" else "audio/webm"
            print(f"[api/raw] Successfully downloaded {file_ext} ({file_size} bytes): {title}", file=sys.stderr)

            # Send response with stream and audio metadata headers
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("X-Audio-Title", urllib.parse.quote(title))
            self.send_header("X-Audio-Artist", urllib.parse.quote(artist))
            self.send_header("X-Audio-Ext", file_ext)
            self.send_header("X-Audio-Duration", str(duration))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.end_headers()

            with open(final_file, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except Exception as e:
            print(f"[api/raw] Unhandled error: {e}", file=sys.stderr)
            try:
                self.send_json_error(500, "Unable to process this track.")
            except Exception:
                pass
        finally:
            if temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    pass


if __name__ == "__main__":
    from http.server import ThreadingHTTPServer
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"AudioX Raw Extractor Server running on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
