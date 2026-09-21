import json
import os
import shutil
import sys
import tempfile
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import yt_dlp

MAX_VIDEO_DURATION_SECONDS = 120 * 60  # 120 minutes limit


def sanitize_filename(name: str) -> str:
    cleaned = "".join(c for c in name if c.isalnum() or c in " ._-()[]'\"").strip()
    return cleaned or "audio_track"


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
        quality = params.get("quality", ["high"])[0].lower()
        title = params.get("title", [None])[0]

        self.process_request(url, fmt, quality, title)

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
        quality = (body.get("quality") or "high").lower()
        title = body.get("title")

        self.process_request(url, fmt, quality, title)

    def process_request(self, url: str, target_format: str, quality: str, requested_title: str = None):
        if not url:
            return self.send_json_error(400, "Media URL is required.")

        # V1 formats: m4a (native, 0 ffmpeg required) and mp3
        if target_format not in ["m4a", "mp3"]:
            target_format = "m4a"

        # Check FFmpeg availability if MP3 requested
        has_ffmpeg = bool(shutil.which("ffmpeg"))
        if target_format == "mp3" and not has_ffmpeg:
            return self.send_json_error(
                400,
                "MP3 conversion requires FFmpeg which is not bundled in this serverless runtime. Please select M4A (native YouTube audio format) for instant download."
            )

        job_id = str(uuid.uuid4())
        temp_dir = Path(tempfile.gettempdir()) / f"audiox_{job_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            output_template = str(temp_dir / "audio.%(ext)s")

            # Check FFmpeg availability
            has_ffmpeg = bool(shutil.which("ffmpeg"))

            # yt-dlp configuration
            ydl_opts = {
                "format": "ba/b",
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
            }

            if has_ffmpeg:
                preferred_codec = "mp3" if target_format == "mp3" else "m4a"
                bitrate = "192"
                if quality == "standard":
                    bitrate = "128"
                elif quality in ["best", "320k"]:
                    bitrate = "320"

                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": preferred_codec,
                    "preferredquality": bitrate,
                }]
            elif target_format == "mp3":
                # MP3 conversion strictly requires FFmpeg
                return self.send_json_error(
                    400,
                    "MP3 conversion requires FFmpeg. Please select M4A (native audio format) for instant download."
                )

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Pre-extract metadata for validation
                try:
                    info = ydl.extract_info(url, download=False)
                except Exception as ex:
                    err_str = str(ex).lower()
                    if "unavailable" in err_str or "private" in err_str:
                        return self.send_json_error(404, "This video is private or unavailable.")
                    return self.send_json_error(400, "Unable to extract media information from source.")

                if not info:
                    return self.send_json_error(404, "Media not found.")

                if info.get("is_live"):
                    return self.send_json_error(400, "Live streams cannot be processed.")

                duration = info.get("duration") or 0
                if duration > MAX_VIDEO_DURATION_SECONDS:
                    return self.send_json_error(
                        400,
                        f"Media exceeds the maximum duration limit of 120 minutes ({duration // 60}m)."
                    )

                # Execute download
                ydl.download([url])

            # Locate downloaded output file
            found_files = list(temp_dir.glob("audio.*"))
            valid_files = [f for f in found_files if not f.name.endswith(".part") and not f.name.endswith(".tmp")]

            if not valid_files:
                return self.send_json_error(500, "Audio processing failed to generate an output file.")

            final_file = valid_files[0]
            file_ext = final_file.suffix.replace(".", "").lower()
            file_size = final_file.stat().st_size

            # Resolve clean track name
            resolved_title = requested_title or info.get("title") or "Audio Track"
            resolved_artist = info.get("uploader") or info.get("channel") or ""
            full_name = f"{resolved_artist} - {resolved_title}" if (resolved_artist and resolved_artist not in resolved_title) else resolved_title
            clean_name = f"{sanitize_filename(full_name)}.{file_ext}"

            safe_ascii_name = clean_name.encode("ascii", "replace").decode("ascii").replace('"', "")
            encoded_name = urllib.parse.quote(clean_name, safe="()[]!-_*")

            mime_type = "audio/mp4" if file_ext == "m4a" else "audio/mpeg"

            # Stream audio back to client
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header(
                "Content-Disposition",
                f'attachment; filename="{safe_ascii_name}"; filename*=UTF-8\'\'{encoded_name}'
            )
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.end_headers()

            # Stream file in 64KB chunks
            with open(final_file, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except Exception as e:
            print(f"[api/media/process] Error: {e}", file=sys.stderr)
            try:
                self.send_json_error(500, "Unable to process this track.")
            except Exception:
                pass
        finally:
            # Ephemeral cleanup: delete temporary folder immediately after streaming
            if temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    pass


if __name__ == "__main__":
    from http.server import HTTPServer
    port = int(os.getenv("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), handler)
    print(f"AudioX Media Process Server running on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

