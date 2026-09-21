import os
import sys
import time
import uuid
import shutil
import asyncio
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Header, Query, BackgroundTasks, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import yt_dlp

app = FastAPI(title="AudioX Media Worker", version="1.0.0")

WORKER_SECRET = os.getenv("WORKER_SECRET", "").strip()
BASE_TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/audiox"))
BASE_TEMP_DIR.mkdir(parents=True, exist_ok=True)
FILE_EXPIRY_SECONDS = int(os.getenv("FILE_EXPIRY_MINUTES", "30")) * 60

# In-memory job registry
jobs: Dict[str, Dict[str, Any]] = {}
queue: asyncio.Queue = asyncio.Queue()
active_process: Optional[asyncio.subprocess.Process] = None


class CreateJobRequest(BaseModel):
    id: Optional[str] = None
    sourceUrl: str
    format: str = "mp3"
    quality: str = "high"
    title: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None


def verify_secret(authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    if not WORKER_SECRET:
        return True  # No secret configured, allow (dev mode)
    
    auth_header = authorization or ""
    bearer_token = ""
    if auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:].strip()
    
    provided = bearer_token or token or ""
    if provided != WORKER_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: invalid or missing WORKER_SECRET"
        )
    return True


def check_dependencies() -> Dict[str, bool]:
    python_ok = sys.version_info >= (3, 8)
    
    ytdlp_ok = False
    try:
        ytdlp_ok = bool(yt_dlp.version.__version__)
    except Exception:
        pass

    ffmpeg_ok = False
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ffmpeg_ok = res.returncode == 0
    except Exception:
        pass

    return {
        "python": python_ok,
        "ytdlp": ytdlp_ok,
        "ffmpeg": ffmpeg_ok,
    }


def map_bitrate(quality: str) -> str:
    quality_map = {
        "standard": "128k",
        "high": "192k",
        "best": "320k",
        "128k": "128k",
        "192k": "192k",
        "256k": "256k",
        "320k": "320k",
    }
    return quality_map.get(quality, "192k")


def clean_filename(name: str) -> str:
    return "".join(c for c in name if c.isalnum() or c in " ._-()[]'\"").strip() or "track"


async def process_job(job: Dict[str, Any]):
    global active_process
    job_id = job["id"]
    job_dir = BASE_TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    job["status"] = "fetching"
    job["stage"] = "fetching"
    job["progress"] = 10
    job["startedAt"] = int(time.time() * 1000)

    url = job["sourceUrl"]
    target_format = job["format"]
    bitrate = map_bitrate(job["quality"])

    source_path: Optional[Path] = None
    output_path: Optional[Path] = None

    try:
        # Step 1: Download audio stream via native yt-dlp
        output_template = str(job_dir / "source.%(ext)s")
        thumbnail_template = str(job_dir / "cover.%(ext)s")

        def ytdl_progress_hook(d):
            if job.get("status") == "cancelled":
                raise Exception("Job cancelled by user")
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                if total > 0:
                    pct = min(50, 10 + int((downloaded / total) * 40))
                    job["progress"] = pct
                    job["stage"] = "fetching"
            elif d.get("status") == "finished":
                job["progress"] = 55
                job["stage"] = "extracting"

        ydl_opts = {
            "format": "ba/b",
            "outtmpl": output_template,
            "writethumbnail": True,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [ytdl_progress_hook],
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        }

        # Run yt-dlp in a thread to keep async event loop responsive
        loop = asyncio.get_running_loop()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            meta = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=True))

        if job.get("status") == "cancelled":
            return

        # Find downloaded source file
        downloaded_files = list(job_dir.glob("source.*"))
        valid_sources = [f for f in downloaded_files if not f.name.endswith(".part") and not f.name.endswith(".tmp")]
        if not valid_sources:
            raise Exception("Source audio stream could not be downloaded")
        source_path = valid_sources[0]

        # Find cover art if downloaded
        cover_files = list(job_dir.glob("cover.*"))
        valid_covers = [f for f in cover_files if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]]
        cover_path = valid_covers[0] if valid_covers else None

        # Step 2: FFmpeg conversion
        job["status"] = "converting"
        job["stage"] = "converting"
        job["progress"] = 60

        resolved_title = job.get("title") or meta.get("title") or "Audio Track"
        resolved_artist = job.get("artist") or meta.get("uploader") or meta.get("channel") or ""
        safe_name = clean_filename(f"{resolved_artist} - {resolved_title}" if resolved_artist else resolved_title)
        
        output_filename = f"{safe_name}.{target_format}"
        output_path = job_dir / output_filename

        ffmpeg_args = ["ffmpeg", "-y", "-i", str(source_path)]
        if cover_path and target_format == "mp3":
            ffmpeg_args.extend(["-i", str(cover_path)])

        if target_format == "mp3":
            ffmpeg_args.extend(["-c:a", "libmp3lame", "-b:a", bitrate])
            if cover_path:
                ffmpeg_args.extend([
                    "-map", "0:a:0", "-map", "1:0",
                    "-c:v", "copy",
                    "-id3v2_version", "3",
                    "-metadata:s:v", 'title="Album cover"',
                    "-metadata:s:v", 'comment="Cover (front)"'
                ])
        else:
            ffmpeg_args.extend(["-c:a", "aac", "-b:a", bitrate])

        if resolved_title:
            ffmpeg_args.extend(["-metadata", f"title={resolved_title}"])
        if resolved_artist:
            ffmpeg_args.extend(["-metadata", f"artist={resolved_artist}"])

        ffmpeg_args.append(str(output_path))

        active_process = await asyncio.create_subprocess_exec(
            *ffmpeg_args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await active_process.communicate()

        if active_process.returncode != 0:
            err_msg = stderr.decode(errors="replace")[-400:] if stderr else "FFmpeg conversion failed"
            raise Exception(f"FFmpeg error: {err_msg}")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise Exception("Converted audio file was not generated")

        # Step 3: Finalize
        job["status"] = "ready"
        job["stage"] = "ready"
        job["progress"] = 100
        job["fileName"] = output_filename
        job["filePath"] = str(output_path)
        job["fileSize"] = output_path.stat().st_size
        job["mimeType"] = "audio/mpeg" if target_format == "mp3" else "audio/mp4"
        job["completedAt"] = int(time.time() * 1000)

        # Cleanup source raw file to save space immediately
        if source_path and source_path.exists() and source_path != output_path:
            try:
                source_path.unlink()
            except Exception:
                pass

    except Exception as e:
        if job.get("status") != "cancelled":
            job["status"] = "failed"
            job["stage"] = "idle"
            job["error"] = str(e)
            job["completedAt"] = int(time.time() * 1000)
    finally:
        active_process = None


async def queue_worker_loop():
    """Strictly sequential worker loop with concurrency = 1"""
    while True:
        job_id = await queue.get()
        job = jobs.get(job_id)
        if job and job.get("status") == "queued":
            await process_job(job)
        queue.task_done()


async def cleanup_expired_workspaces():
    """Background task to delete workspaces older than FILE_EXPIRY_SECONDS"""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        now = time.time()
        try:
            for item in BASE_TEMP_DIR.iterdir():
                if item.is_dir():
                    try:
                        mtime = item.stat().st_mtime
                        if now - mtime > FILE_EXPIRY_SECONDS:
                            shutil.rmtree(item, ignore_errors=True)
                    except Exception:
                        pass
        except Exception:
            pass


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(queue_worker_loop())
    asyncio.create_task(cleanup_expired_workspaces())


@app.get("/health")
def health():
    deps = check_dependencies()
    all_ok = all(deps.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            **deps
        }
    )


@app.post("/jobs")
def create_job(req: CreateJobRequest, authorization: Optional[str] = Header(None)):
    verify_secret(authorization=authorization)
    job_id = req.id or str(uuid.uuid4())
    
    job_data = {
        "id": job_id,
        "sourceUrl": req.sourceUrl,
        "format": req.format.lower(),
        "quality": req.quality.lower(),
        "title": req.title,
        "artist": req.artist,
        "thumbnail": req.thumbnail,
        "duration": req.duration,
        "status": "queued",
        "stage": "idle",
        "progress": 0,
        "fileName": None,
        "filePath": None,
        "fileSize": None,
        "mimeType": None,
        "error": None,
        "createdAt": int(time.time() * 1000),
        "startedAt": None,
        "completedAt": None,
    }
    
    jobs[job_id] = job_data
    queue.put_nowait(job_id)

    return {
        "jobId": job_id,
        "status": "queued"
    }


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: Optional[str] = Header(None)):
    verify_secret(authorization=authorization)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "jobId": job["id"],
        "status": job["status"],
        "stage": job["stage"],
        "progress": job["progress"],
        "title": job.get("title"),
        "fileName": job.get("fileName"),
        "fileSize": job.get("fileSize"),
        "mimeType": job.get("mimeType"),
        "error": job.get("error"),
        "createdAt": job["createdAt"],
        "startedAt": job.get("startedAt"),
        "completedAt": job.get("completedAt"),
    }


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, authorization: Optional[str] = Header(None)):
    verify_secret(authorization=authorization)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job["status"] = "cancelled"
    job["stage"] = "idle"

    # Terminate active process if this is the active job
    global active_process
    if active_process:
        try:
            active_process.kill()
        except Exception:
            pass

    # Clean workspace
    job_dir = BASE_TEMP_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)

    return {"status": "cancelled", "jobId": job_id}


@app.get("/jobs/{job_id}/download")
def download_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    verify_secret(authorization=authorization, token=token)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("status") != "ready" or not job.get("filePath"):
        raise HTTPException(status_code=400, detail="Job is not ready for download")
    
    file_path = Path(job["filePath"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Converted file has expired or was removed")
    
    return FileResponse(
        path=str(file_path),
        media_type=job.get("mimeType", "audio/mpeg"),
        filename=job.get("fileName", "track.mp3")
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
