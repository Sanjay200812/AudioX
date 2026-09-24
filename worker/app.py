import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import yt_dlp
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from processor import check_ffmpeg_available
from queue_manager import queue_manager
from security import (
    sanitize_filename,
    validate_job_id,
    validate_media_options,
    validate_source_url,
    verify_worker_secret,
)
import secrets


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: trigger sequential queue loop and file cleanup
    queue_manager.start_background_tasks()
    print(f"[app:startup] AudioX Worker ready. yt-dlp version: {yt_dlp.version.__version__}")
    yield


app = FastAPI(
    title="AudioX Media Processing Worker",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS setup: strict non-credentialed cross-origin support
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)


class CreateJobRequest(BaseModel):
    id: Optional[str] = None
    sourceUrl: Optional[str] = None
    url: Optional[str] = None
    videoId: Optional[str] = None
    mediaId: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    creator: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None
    format: str = Field(default="mp3")
    quality: str = Field(default="high")


@app.get("/health")
def get_health():
    """
    Public worker health verification endpoint.
    Checks Python runtime, yt-dlp library, FFmpeg binary execution, and sequential queue state.
    """
    ffmpeg_ok = check_ffmpeg_available()
    ytdlp_ok = bool(hasattr(yt_dlp, "YoutubeDL") and hasattr(yt_dlp, "version"))
    queue_ok = queue_manager.queue is not None

    all_healthy = ffmpeg_ok and ytdlp_ok and queue_ok

    return JSONResponse(
        status_code=200 if all_healthy else 503,
        content={
            "status": "ok" if all_healthy else "degraded",
            "python": True,
            "ytdlp": ytdlp_ok,
            "ffmpeg": ffmpeg_ok,
            "queue": queue_ok,
        },
    )


@app.post("/jobs", dependencies=[Depends(verify_worker_secret)])
def create_job(body: CreateJobRequest):
    """
    Enqueues an audio processing job into the sequential FIFO queue (concurrency = 1).
    Validates job ID, target URL, audio format, and quality.
    """
    target_url = body.sourceUrl or body.url or body.videoId or body.mediaId
    if not target_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sourceUrl, url, or videoId is required.",
        )

    # Validate and canonicalize YouTube URL (prevent SSRF)
    canonical_url = validate_source_url(target_url)

    # Validate job ID and media options
    job_id = validate_job_id(body.id) if body.id else str(uuid.uuid4())
    audio_format, quality = validate_media_options(body.format, body.quality)

    resolved_video_id = body.videoId or body.mediaId
    resolved_creator = body.artist or body.creator

    job = queue_manager.create_job(
        job_id=job_id,
        source_url=canonical_url,
        video_id=resolved_video_id,
        title=body.title,
        creator=resolved_creator,
        thumbnail=body.thumbnail,
        duration=body.duration,
        audio_format=audio_format,
        quality=quality,
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "jobId": job["id"],
            "status": job.get("status", "queued"),
        },
    )


@app.get("/jobs/{job_id}", dependencies=[Depends(verify_worker_secret)])
def get_job(job_id: str):
    """Retrieves current job status, authentic stage, progress percentage, and downloadToken."""
    clean_id = validate_job_id(job_id)
    job = queue_manager.get_job(clean_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=queue_manager.to_public_dict(job),
    )


@app.post("/jobs/{job_id}/cancel", dependencies=[Depends(verify_worker_secret)])
def cancel_job(job_id: str):
    """Cancels a queued or currently processing job."""
    clean_id = validate_job_id(job_id)
    success = queue_manager.cancel_job(clean_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or already completed.")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"jobId": clean_id, "status": "cancelled"},
    )


@app.post("/jobs/{job_id}/retry", dependencies=[Depends(verify_worker_secret)])
def retry_job(job_id: str):
    """Re-enqueues a failed job in place, preserving job ID."""
    clean_id = validate_job_id(job_id)
    job = queue_manager.retry_job(clean_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"jobId": clean_id, "status": "queued", "retryCount": job.get("retryCount", 0)},
    )


@app.get("/jobs/{job_id}/download")
def download_job(job_id: str, token: str = Query(..., description="Short-lived download token")):
    """
    Validates the download token and streams the converted audio file.
    Does not expose the WORKER_SECRET to browser clients.
    """
    clean_id = validate_job_id(job_id)
    job = queue_manager.get_job(clean_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    # Validate download token with constant-time comparison
    expected_token = job.get("downloadToken")
    if not expected_token or not secrets.compare_digest(token, expected_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired download token.")

    if job.get("status") != "ready" or not job.get("outputPath"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Media conversion is not ready for download.",
        )

    file_path = Path(job["outputPath"])
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Converted audio file has expired and was cleaned up.",
        )

    clean_name = job.get("fileName") or file_path.name
    ascii_name = sanitize_filename(clean_name)
    media_type = job.get("mimeType") or "audio/mpeg"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=ascii_name,
        headers={
            "Cache-Control": "no-store, max-age=0",
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
