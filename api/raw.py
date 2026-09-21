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
        self.process_raw_extraction(url)

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
        self.process_raw_extraction(url)

    def process_raw_extraction(self, url: str):
        if not url:
            return self.send_json_error(400, "Media URL is required.")

        job_id = str(uuid.uuid4())
        temp_dir = Path(tempfile.gettempdir()) / f"audiox_raw_{job_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)

        try:
            output_template = str(temp_dir / "audio.%(ext)s")

            ydl_opts = {
                "format": "ba/b",
                "outtmpl": output_template,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
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

                # Download native audio
                ydl.download([url])

            # Locate downloaded output file
            found_files = list(temp_dir.glob("audio.*"))
            valid_files = [f for f in found_files if not f.name.endswith(".part") and not f.name.endswith(".tmp")]

            if not valid_files:
                return self.send_json_error(500, "Audio processing failed to generate an output file.")

            final_file = valid_files[0]
            file_ext = final_file.suffix.replace(".", "").lower()
            file_size = final_file.stat().st_size

            title = info.get("title") or "Audio Track"
            artist = info.get("uploader") or info.get("channel") or ""

            mime_type = "audio/mp4" if file_ext == "m4a" else "audio/webm"

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
            print(f"[api/raw] Error: {e}", file=sys.stderr)
            try:
                self.send_json_error(500, "Unable to extract raw audio from source.")
            except Exception:
                pass
        finally:
            if temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    pass


if __name__ == "__main__":
    from http.server import HTTPServer
    port = int(os.getenv("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), handler)
    print(f"AudioX Raw Extractor Server running on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
