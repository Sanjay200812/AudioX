import os
import re
import shutil
import tempfile
import urllib.parse
import uuid
from pathlib import Path
from typing import Optional

import imageio_ffmpeg
import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

app = FastAPI(
    title="AudioX Media Processing API",
    description="Native Vercel Serverless Audio Processing with yt-dlp and static FFmpeg",
    version="3.0.0",
    redirect_slashes=False,
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Flatten error responses so detail.error / detail.errorCode are accessible at top-level.
    """
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(detail), "errorCode": "HTTP_ERROR"},
    )


MAX_DURATION_SECONDS = 120 * 60  # 120 minutes max

BITRATE_MAP = {
    "standard": "128k",
    "128k": "128k",
    "high": "192k",
    "192k": "192k",
    "256k": "256k",
    "best": "320k",
    "320k": "320k",
}

YOUTUBE_DOMAINS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}

PRIVATE_IP_REGEX = re.compile(
    r"^(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|::1|fc00:|fe80:)"
)


def get_temp_root() -> Path:
    base = os.getenv("TEMP_DIR", tempfile.gettempdir())
    p = Path(base) if str(base).endswith("audiox") else Path(base) / "audiox"
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Fallback to system temp
        p = Path(tempfile.gettempdir()) / "audiox"
        p.mkdir(parents=True, exist_ok=True)
    return p


def get_executable_ffmpeg() -> str:
    """
    Resolves FFmpeg executable path.
    On Linux (Vercel/Lambda), copies the bundled imageio-ffmpeg binary to /tmp/bin/ffmpeg
    and ensures it has execute (+x) permissions to prevent PermissionError (Errno 13).
    """
    raw_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if os.name == "nt":
        return raw_exe

    tmp_bin = Path("/tmp/bin/ffmpeg")
    try:
        if not tmp_bin.exists() or tmp_bin.stat().st_size == 0:
            tmp_bin.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(raw_exe, str(tmp_bin))
            tmp_bin.chmod(0o755)
        return str(tmp_bin)
    except Exception:
        return raw_exe


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = re.sub(r"[\r\n\t]", " ", cleaned).strip()
    return cleaned[:120] if cleaned else "audio"


def validate_url(url: str) -> str:
    if not url or not isinstance(url, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "A valid YouTube URL is required.", "errorCode": "INVALID_URL"},
        )
    url = url.strip()
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Malformed URL.", "errorCode": "INVALID_URL"},
        )

    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname not in YOUTUBE_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Only standard public YouTube URLs are supported.",
                "errorCode": "UNSUPPORTED_DOMAIN",
            },
        )

    if PRIVATE_IP_REGEX.match(hostname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Private network addresses are forbidden.", "errorCode": "SSRF_BLOCKED"},
        )

    return url


def map_bitrate(quality: Optional[str]) -> str:
    if not quality:
        return "192k"
    return BITRATE_MAP.get(quality.lower(), "192k")


def classify_error(err_str: str) -> tuple[str, str, int]:
    raw = str(err_str).lower()

    if "private video" in raw or "this video is private" in raw:
        return "PRIVATE_VIDEO", "This video is private and cannot be processed.", 403

    if "bot" in raw or "confirm you're not a bot" in raw:
        return "BOT_DETECTION", f"Bot check triggered: {err_str}", 403

    if "sign in" in raw or "login" in raw or "members-only" in raw or "premium" in raw:
        return "LOGIN_REQUIRED", "This video requires account authentication.", 403

    if "age" in raw and ("restricted" in raw or "confirm your age" in raw):
        return "AGE_RESTRICTED", "This video is age-restricted and requires account verification.", 403

    if "live event" in raw or "live stream" in raw or "is currently live" in raw:
        return "LIVE_STREAM_UNSUPPORTED", "Live streams cannot be processed.", 400

    if "unavailable" in raw or "does not exist" in raw or "not found" in raw or "deleted" in raw or "copyright" in raw:
        return "VIDEO_UNAVAILABLE", "This video is unavailable or has been removed.", 404

    if "rate-limit" in raw or "too many requests" in raw or "429" in raw:
        return "RATE_LIMITED", "YouTube rate limit encountered. Please try again later.", 429

    if "timed out" in raw or "timeout" in raw or "connection reset" in raw or "unable to connect" in raw or "network" in raw:
        return "NETWORK_ERROR", "Network connection timed out while contacting YouTube.", 504

    if "duration" in raw and "exceed" in raw:
        return "MAX_DURATION_EXCEEDED", "Video duration exceeds the maximum limit (120 minutes).", 400

    return "PROCESSING_FAILED", "Failed to process audio from video.", 500


def cleanup_directory(path: Path):
    try:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass


def iter_file(path: Path, chunk_size: int = 64 * 1024):
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            yield chunk


class ProcessRequest(BaseModel):
    url: Optional[str] = None
    sourceUrl: Optional[str] = None
    format: Optional[str] = "mp3"
    quality: Optional[str] = "high"
    title: Optional[str] = None
    artist: Optional[str] = None


@app.get("/api/process/health")
@app.get("/api/health")
@app.get("/health")
def health():
    try:
        ffmpeg_exe = get_executable_ffmpeg()
        has_ffmpeg = bool(ffmpeg_exe and os.path.isfile(ffmpeg_exe))
    except Exception:
        has_ffmpeg = False

    return {
        "status": "ok",
        "service": "AudioX Native Vercel Media Processor",
        "ytdlp": bool(yt_dlp.version.__version__),
        "ffmpeg": has_ffmpeg,
    }


def execute_media_process(
    target_url: str,
    target_format: str,
    quality: str,
    title_override: Optional[str] = None,
    artist_override: Optional[str] = None,
):
    target_format = (target_format or "mp3").lower()
    if target_format not in ["mp3", "m4a"]:
        target_format = "mp3"

    bitrate = map_bitrate(quality)
    job_id = f"proc_{uuid.uuid4().hex[:12]}"
    workspace = get_temp_root() / job_id
    workspace.mkdir(parents=True, exist_ok=True)

    try:
        ffmpeg_exe = get_executable_ffmpeg()
    except Exception as e:
        cleanup_directory(workspace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "FFmpeg runtime binary is not available.", "errorCode": "PROCESSING_FAILED"},
        )

    # Prefer audio-only streams; noplaylist ensures strictly one track per invocation
    format_selector = "ba[ext=m4a]/ba/b" if target_format == "m4a" else "ba/b"
    output_template = str(workspace / "source.%(ext)s")

    node_exe = shutil.which("node") or shutil.which("nodejs")
    js_runtimes = {"node": {"path": node_exe}} if node_exe else {}

    base_ydl_opts = {
        "format": format_selector,
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "ffmpeg_location": ffmpeg_exe,
        "remote_components": ["ejs:github"],
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    }

    if js_runtimes:
        base_ydl_opts["js_runtimes"] = js_runtimes

    cookie_str = os.getenv("YOUTUBE_COOKIES") or os.getenv("YT_COOKIES")
    bundled_cookie = Path(__file__).parent / "cookies.txt"
    root_cookie = Path("cookies.txt")

    has_cookies = False
    if cookie_str:
        cookie_file = workspace / "cookies.txt"
        cookie_file.write_text(cookie_str, encoding="utf-8")
        base_ydl_opts["cookiefile"] = str(cookie_file)
        has_cookies = True
    elif bundled_cookie.is_file():
        base_ydl_opts["cookiefile"] = str(bundled_cookie.resolve())
        has_cookies = True
    elif root_cookie.is_file():
        base_ydl_opts["cookiefile"] = str(root_cookie.resolve())
        has_cookies = True

    proxy = os.getenv("YOUTUBE_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")
    if proxy:
        base_ydl_opts["proxy"] = proxy

    # Fallback strategies: with cookies use web first for highest quality audio; fallback to visionos & android
    if has_cookies:
        client_strategies = [
            ["web"],
            ["visionos", "android"],
            ["android"],
        ]
    else:
        client_strategies = [
            ["visionos", "android"],
            ["visionos"],
            ["android"],
            ["web"],
        ]

    info = None
    last_exc = None
    strategy_errors = {}
    for clients in client_strategies:
        curr_opts = dict(base_ydl_opts)
        curr_opts["extractor_args"] = {"youtube": {"player_client": clients}}
        try:
            with yt_dlp.YoutubeDL(curr_opts) as ydl:
                info = ydl.extract_info(target_url, download=True)
                if info:
                    break
        except Exception as e:
            strategy_name = "+".join(clients)
            strategy_errors[strategy_name] = str(e)
            last_exc = e
            raw_err = str(e).lower()
            if "private video" in raw_err or "does not exist" in raw_err or "not found" in raw_err:
                break
            continue

    if not info:
        cleanup_directory(workspace)
        if last_exc:
            err_code, user_msg, http_status = classify_error(str(last_exc))
            raise HTTPException(
                status_code=http_status,
                detail={"error": user_msg, "errorCode": err_code},
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Video not found or unavailable.", "errorCode": "VIDEO_UNAVAILABLE"},
        )

    if info.get("is_live"):
        cleanup_directory(workspace)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Live streams cannot be processed.", "errorCode": "LIVE_STREAM_UNSUPPORTED"},
        )

    duration = info.get("duration") or 0
    if duration > MAX_DURATION_SECONDS:
        cleanup_directory(workspace)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": f"Video duration ({duration // 60}m) exceeds 120 minute limit.",
                "errorCode": "MAX_DURATION_EXCEEDED",
            },
        )

    downloaded = list(workspace.glob("source.*"))
    valid_sources = [f for f in downloaded if not f.name.endswith(".part") and not f.name.endswith(".tmp")]

    if not valid_sources:
        cleanup_directory(workspace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Failed to extract audio stream from video.", "errorCode": "PROCESSING_FAILED"},
        )

    source_file = valid_sources[0]
    source_ext = source_file.suffix.lstrip(".").lower()

    meta_title = title_override or info.get("title") or "Audio Track"
    meta_artist = artist_override or info.get("uploader") or info.get("channel") or ""

    if meta_artist and meta_artist.lower() not in meta_title.lower():
        full_display_title = f"{meta_artist} - {meta_title}"
    else:
        full_display_title = meta_title

    clean_file_base = sanitize_filename(full_display_title)
    final_output_path = workspace / f"{clean_file_base}.{target_format}"

    # Conversion optimization: if target is M4A and source is native M4A, direct copy
    if target_format == "m4a" and source_ext == "m4a":
        if source_file != final_output_path:
            shutil.move(str(source_file), str(final_output_path))
    else:
        import subprocess

        cmd = [
            ffmpeg_exe,
            "-y",
            "-i",
            str(source_file),
        ]

        if target_format == "mp3":
            cmd.extend([
                "-c:a", "libmp3lame",
                "-b:a", bitrate,
                "-id3v2_version", "3",
            ])
        else:
            cmd.extend([
                "-c:a", "aac",
                "-b:a", bitrate,
            ])

        if meta_title:
            cmd.extend(["-metadata", f"title={meta_title}"])
        if meta_artist:
            cmd.extend(["-metadata", f"artist={meta_artist}"])

        cmd.append(str(final_output_path))

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            cleanup_directory(workspace)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": "Audio transcoding failed.", "errorCode": "PROCESSING_FAILED"},
            )

    if not final_output_path.is_file():
        cleanup_directory(workspace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Output audio file missing after conversion.", "errorCode": "PROCESSING_FAILED"},
        )

    file_size = final_output_path.stat().st_size
    media_type = "audio/mpeg" if target_format == "mp3" else "audio/mp4"
    safe_filename = f"{clean_file_base}.{target_format}"
    quoted_filename = safe_filename.replace('"', '\\"')
    url_encoded_filename = urllib.parse.quote(safe_filename)

    return StreamingResponse(
        iter_file(final_output_path),
        media_type=media_type,
        headers={
            "Content-Type": media_type,
            "Content-Disposition": f'attachment; filename="{quoted_filename}"; filename*=UTF-8\'\'{url_encoded_filename}',
            "Content-Length": str(file_size),
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-AudioX-Title": urllib.parse.quote(meta_title[:80]),
            "X-AudioX-Artist": urllib.parse.quote(meta_artist[:80]),
            "X-AudioX-Format": target_format,
        },
        background=BackgroundTask(cleanup_directory, workspace),
    )


# Multi-route support to match all possible Vercel routing paths
@app.post("/api/process")
@app.post("/api/process/")
@app.post("/process")
@app.post("/process/")
@app.post("/api")
@app.post("/api/")
@app.post("/")
async def process_post(req: ProcessRequest):
    raw_url = req.url or req.sourceUrl
    valid_url = validate_url(raw_url or "")
    return execute_media_process(
        target_url=valid_url,
        target_format=req.format or "mp3",
        quality=req.quality or "high",
        title_override=req.title,
        artist_override=req.artist,
    )


@app.get("/api/process")
@app.get("/api/process/")
@app.get("/process")
@app.get("/process/")
@app.get("/api")
@app.get("/api/")
@app.get("/")
def process_get(
    url: str = Query(..., description="YouTube video URL"),
    format: str = Query("mp3", description="Audio format: mp3 or m4a"),
    quality: str = Query("high", description="Audio quality: standard, high, best, etc."),
    title: Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
):
    valid_url = validate_url(url)
    return execute_media_process(
        target_url=valid_url,
        target_format=format,
        quality=quality,
        title_override=title,
        artist_override=artist,
    )
