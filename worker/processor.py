import asyncio
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import yt_dlp
from security import sanitize_filename

MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "500"))
MAX_DURATION_MINUTES = int(os.getenv("MAX_VIDEO_DURATION_MINUTES", "120"))
MAX_DURATION_SECONDS = MAX_DURATION_MINUTES * 60

# Bitrate mapping for MP3 conversion
BITRATE_MAP = {
    "standard": "128k",
    "128k": "128k",
    "high": "192k",
    "192k": "192k",
    "256k": "256k",
    "best": "320k",
    "320k": "320k",
}


def map_bitrate(quality: Optional[str]) -> str:
    if not quality:
        return "192k"
    return BITRATE_MAP.get(quality.lower(), "192k")


def resolve_ffmpeg_bin() -> Optional[str]:
    """Finds executable ffmpeg binary from PATH, FFMPEG_PATH, or common paths."""
    env_bin = os.getenv("FFMPEG_PATH")
    if env_bin and Path(env_bin).is_file():
        return env_bin

    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path

    for candidate in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/tmp/bin/ffmpeg"]:
        if Path(candidate).is_file():
            return candidate

    return None


def check_ffmpeg_available() -> bool:
    """Verifies that FFmpeg is installed and executable."""
    ffmpeg_bin = resolve_ffmpeg_bin()
    if not ffmpeg_bin:
        return False
    try:
        res = subprocess.run([ffmpeg_bin, "-version"], capture_output=True, timeout=5)
        return res.returncode == 0
    except Exception:
        return False


def classify_ytdlp_error(error_msg: str) -> tuple[str, str]:
    """
    Maps yt-dlp exception messages into standardized error codes and user-safe messages.
    Returns (errorCode, userMessage).
    """
    err_lower = error_msg.lower()

    if "private" in err_lower:
        return "PRIVATE_VIDEO", "This video is private."
    if "unavailable" in err_lower or "does not exist" in err_lower or "not found" in err_lower:
        return "VIDEO_UNAVAILABLE", "This video is unavailable."
    if "sign in" in err_lower or "login" in err_lower:
        return "LOGIN_REQUIRED", "This media requires sign-in or login."
    if "age" in err_lower or "confirm your age" in err_lower:
        return "AGE_RESTRICTED", "This media is age-restricted and requires account verification."
    if "live event" in err_lower or "is a live stream" in err_lower:
        return "LIVE_STREAM_UNSUPPORTED", "Live streams cannot be processed."
    if "rate-limit" in err_lower or "too many requests" in err_lower or "429" in err_lower:
        return "RATE_LIMITED", "YouTube rate limit encountered. Please try again later."
    if "timeout" in err_lower or "timed out" in err_lower:
        return "NETWORK_ERROR", "Network timeout connecting to YouTube."

    return "EXTRACTION_FAILED", "Unable to extract media information from source."


async def process_media_job(
    job: Dict[str, Any],
    temp_dir: Path,
    update_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> None:
    """
    Main processing routine for a single audio conversion job:
    1. Resolves media with yt-dlp (validating duration & live stream status).
    2. Downloads best practical audio stream to temp directory.
    3. If M4A: uses direct AAC source if available; otherwise transcodes with FFmpeg.
    4. If MP3: transcodes with FFmpeg using libmp3lame with configured bitrate.
    5. Finalizes output file, attaches metadata, and updates job state to 'ready'.
    """
    job_id = job["id"]
    canonical_url = job["sourceUrl"]
    target_format = (job.get("format") or "mp3").lower()
    quality = (job.get("quality") or "high").lower()
    bitrate = map_bitrate(quality)

    job_workspace = temp_dir / job_id
    job_workspace.mkdir(parents=True, exist_ok=True)

    job["startedAt"] = int(time.time() * 1000)
    job["stage"] = "resolving"
    job["progress"] = 10
    if update_callback:
        update_callback(job)

    # yt-dlp progress hook to report authentic download percentage
    def ytdlp_progress_hook(d: Dict[str, Any]):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            if total > 0:
                pct = int((downloaded / total) * 50)  # 10% -> 60%
                job["stage"] = "downloading"
                job["progress"] = min(60, 10 + pct)
            else:
                job["stage"] = "downloading"
                job["progress"] = 35
            if update_callback:
                update_callback(job)

    # For M4A: prefer native format 140 (AAC) so 0 FFmpeg transcoding is required
    format_selector = "ba[ext=m4a]/ba/b" if target_format == "m4a" else "ba/b"
    output_template = str(job_workspace / "source.%(ext)s")

    ydl_opts = {
        "format": format_selector,
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [ytdlp_progress_hook],
        "socket_timeout": 30,
    }

    try:
        # Run yt-dlp extraction in a separate thread so asyncio loop is not blocked
        loop = asyncio.get_running_loop()

        def run_ytdlp_extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(canonical_url, download=True)

        info = await loop.run_in_executor(None, run_ytdlp_extract)

        if not info:
            job["status"] = "failed"
            job["stage"] = "failed"
            job["errorCode"] = "VIDEO_UNAVAILABLE"
            job["errorMessage"] = "Media not found or unavailable."
            return

        # Check live stream
        if info.get("is_live"):
            job["status"] = "failed"
            job["stage"] = "failed"
            job["errorCode"] = "LIVE_STREAM_UNSUPPORTED"
            job["errorMessage"] = "Live streams cannot be processed."
            return

        # Check duration limit
        duration = info.get("duration") or 0
        if duration > MAX_DURATION_SECONDS:
            job["status"] = "failed"
            job["stage"] = "failed"
            job["errorCode"] = "MAX_DURATION_EXCEEDED"
            job["errorMessage"] = (
                f"Media duration exceeds maximum limit of {MAX_DURATION_MINUTES} minutes ({duration // 60}m)."
            )
            return

        # Update metadata from extraction if missing
        if not job.get("title"):
            job["title"] = info.get("title") or "Audio Track"
        if not job.get("creator"):
            job["creator"] = info.get("uploader") or info.get("channel") or ""
        if not job.get("thumbnail"):
            job["thumbnail"] = info.get("thumbnail") or ""
        if not job.get("duration"):
            job["duration"] = duration

        # Locate the downloaded source file
        downloaded_files = list(job_workspace.glob("source.*"))
        valid_sources = [
            f for f in downloaded_files if not f.name.endswith(".part") and not f.name.endswith(".tmp")
        ]

        if not valid_sources:
            raise Exception("No downloaded audio stream found in job directory.")

        source_file = valid_sources[0]
        source_ext = source_file.suffix.lstrip(".").lower()

        resolved_title = job.get("title") or "Audio Track"
        resolved_artist = job.get("creator") or ""
        full_name = f"{resolved_artist} - {resolved_title}" if resolved_artist and resolved_artist not in resolved_title else resolved_title
        clean_name = f"{sanitize_filename(full_name)}.{target_format}"
        final_output_path = job_workspace / clean_name

        # Conversion / Remuxing stage
        job["stage"] = "converting"
        job["progress"] = 65
        if update_callback:
            update_callback(job)

        # Optimization: if target is M4A and source is already native M4A, direct copy without transcoding!
        if target_format == "m4a" and source_ext == "m4a":
            print(f"[processor] Direct M4A source stream detected for {job_id} - skipping FFmpeg transcode.")
            if source_file != final_output_path:
                shutil.move(str(source_file), str(final_output_path))
        else:
            ffmpeg_bin = resolve_ffmpeg_bin()
            if not ffmpeg_bin:
                raise Exception("FFmpeg binary is not available on this system.")

            ffmpeg_cmd = [
                ffmpeg_bin,
                "-y",
                "-i",
                str(source_file),
            ]

            if target_format == "mp3":
                ffmpeg_cmd.extend([
                    "-c:a", "libmp3lame",
                    "-b:a", bitrate,
                    "-id3v2_version", "3",
                ])
            else:
                ffmpeg_cmd.extend([
                    "-c:a", "aac",
                    "-b:a", bitrate,
                ])

            if resolved_title:
                ffmpeg_cmd.extend(["-metadata", f"title={resolved_title}"])
            if resolved_artist:
                ffmpeg_cmd.extend(["-metadata", f"artist={resolved_artist}"])

            ffmpeg_cmd.append(str(final_output_path))

            print(f"[processor] Executing FFmpeg for {job_id}: format={target_format} bitrate={bitrate}")
            proc = await asyncio.create_subprocess_exec(
                *ffmpeg_cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=180.0)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except Exception:
                    pass
                raise Exception("FFmpeg audio conversion timed out after 3 minutes.")

            if proc.returncode != 0:
                err_text = stderr.decode(errors="replace")[-400:] if stderr else "Unknown error"
                raise Exception(f"FFmpeg conversion failed: {err_text}")

            # Clean up source raw file to save space immediately
            if source_file.exists() and source_file != final_output_path:
                try:
                    source_file.unlink()
                except Exception:
                    pass

        # Verify final file exists and is non-empty
        if not final_output_path.exists() or final_output_path.stat().st_size == 0:
            raise Exception("Processed audio file is empty or missing.")

        file_size = final_output_path.stat().st_size
        if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
            job["status"] = "failed"
            job["stage"] = "failed"
            job["errorCode"] = "MAX_FILE_SIZE_EXCEEDED"
            job["errorMessage"] = f"Generated audio file exceeds maximum size of {MAX_FILE_SIZE_MB}MB."
            return

        # Finalizing stage
        job["stage"] = "finalizing"
        job["progress"] = 95
        if update_callback:
            update_callback(job)

        mime_type = "audio/mpeg" if target_format == "mp3" else "audio/mp4"

        job["status"] = "ready"
        job["stage"] = "ready"
        job["progress"] = 100
        job["outputPath"] = str(final_output_path)
        job["fileName"] = clean_name
        job["fileSize"] = file_size
        job["mimeType"] = mime_type
        job["completedAt"] = int(time.time() * 1000)
        print(f"[processor] Job {job_id} successfully completed: {clean_name} ({file_size} bytes)")

    except Exception as ex:
        err_str = str(ex)
        print(f"[processor] Error processing job {job_id}: {err_str}", file=sys.stderr)
        code, msg = classify_ytdlp_error(err_str)
        job["status"] = "failed"
        job["stage"] = "failed"
        job["errorCode"] = code
        job["errorMessage"] = msg
        job["completedAt"] = int(time.time() * 1000)
    finally:
        if update_callback:
            update_callback(job)
