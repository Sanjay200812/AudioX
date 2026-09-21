import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, Optional

from processor import process_media_job
from security import generate_download_token

TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/audiox"))
FILE_EXPIRY_MINUTES = int(os.getenv("FILE_EXPIRY_MINUTES", "30"))
FILE_EXPIRY_SECONDS = FILE_EXPIRY_MINUTES * 60

TEMP_DIR.mkdir(parents=True, exist_ok=True)


class QueueManager:
    """
    Manages the sequential execution of audio conversion jobs (Concurrency = 1).
    Stores jobs in-memory and enforces 30-minute temp file cleanup.
    """

    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.active_job_id: Optional[str] = None
        self._worker_task: Optional[asyncio.Task] = None
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_background_tasks(self):
        if not self._worker_task or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._queue_worker_loop())
        if not self._cleanup_task or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _queue_worker_loop(self):
        """Strictly sequential FIFO loop: Concurrency = 1."""
        print("[queue_manager] Background worker loop started (concurrency=1)")
        while True:
            job_id = await self.queue.get()
            job = self.jobs.get(job_id)

            if job and job.get("status") == "queued":
                self.active_job_id = job_id
                job["status"] = "processing"
                job["stage"] = "resolving"
                job["progress"] = 5
                print(f"[queue_manager] Starting processing job: {job_id} ({job.get('title', 'Unknown')})")

                try:
                    await process_media_job(job, TEMP_DIR)
                except Exception as ex:
                    print(f"[queue_manager] Unhandled job exception for {job_id}: {ex}")
                    job["status"] = "failed"
                    job["stage"] = "failed"
                    job["errorMessage"] = str(ex)
                finally:
                    self.active_job_id = None

            self.queue.task_done()

    async def _cleanup_loop(self):
        """Periodically removes files older than FILE_EXPIRY_SECONDS."""
        while True:
            await asyncio.sleep(300)  # Check every 5 minutes
            now = time.time()
            try:
                for item in TEMP_DIR.iterdir():
                    if item.is_dir():
                        try:
                            mtime = item.stat().st_mtime
                            if now - mtime > FILE_EXPIRY_SECONDS:
                                print(f"[queue_manager] Cleaning expired directory: {item.name}")
                                shutil.rmtree(item, ignore_errors=True)
                                # Invalidate job output path if expired
                                if item.name in self.jobs:
                                    self.jobs[item.name]["outputPath"] = None
                        except Exception:
                            pass
            except Exception as e:
                print(f"[queue_manager] Error in cleanup task: {e}")

    def create_job(
        self,
        job_id: str,
        source_url: str,
        video_id: Optional[str],
        title: Optional[str],
        creator: Optional[str],
        thumbnail: Optional[str],
        duration: Optional[int],
        audio_format: str,
        quality: str,
    ) -> Dict[str, Any]:
        """Creates a new queued job and adds it to the sequential queue."""
        download_token = generate_download_token()

        job: Dict[str, Any] = {
            "id": job_id,
            "videoId": video_id or "",
            "sourceUrl": source_url,
            "title": title or "",
            "creator": creator or "",
            "thumbnail": thumbnail or "",
            "duration": duration or 0,
            "format": audio_format.lower(),
            "quality": quality.lower(),
            "status": "queued",
            "progress": 0,
            "stage": "queued",
            "errorCode": None,
            "errorMessage": None,
            "createdAt": int(time.time() * 1000),
            "startedAt": None,
            "completedAt": None,
            "outputPath": None,
            "fileName": None,
            "fileSize": None,
            "mimeType": None,
            "downloadToken": download_token,
            "retryCount": 0,
        }

        self.jobs[job_id] = job
        self.queue.put_nowait(job_id)
        print(f"[queue_manager] Job enqueued: {job_id}")
        return job

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job:
            return False

        if job["status"] in ("completed", "ready"):
            return False

        job["status"] = "cancelled"
        job["stage"] = "cancelled"
        job["errorMessage"] = "Job was cancelled."

        # Clean workspace
        workspace = TEMP_DIR / job_id
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)

        return True

    def retry_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        job = self.jobs.get(job_id)
        if not job:
            return None

        # Reset job state in place
        job["status"] = "queued"
        job["stage"] = "queued"
        job["progress"] = 0
        job["errorCode"] = None
        job["errorMessage"] = None
        job["startedAt"] = None
        job["completedAt"] = None
        job["retryCount"] = (job.get("retryCount") or 0) + 1
        job["downloadToken"] = generate_download_token()

        self.queue.put_nowait(job_id)
        print(f"[queue_manager] Job re-enqueued (attempt {job['retryCount'] + 1}): {job_id}")
        return job

    def to_public_dict(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Strips internal filesystem paths from job model for public responses."""
        return {
            "jobId": job["id"],
            "videoId": job.get("videoId"),
            "sourceUrl": job.get("sourceUrl"),
            "title": job.get("title"),
            "creator": job.get("creator"),
            "thumbnail": job.get("thumbnail"),
            "duration": job.get("duration"),
            "format": job.get("format"),
            "quality": job.get("quality"),
            "status": job.get("status"),
            "stage": job.get("stage"),
            "progress": job.get("progress", 0),
            "errorCode": job.get("errorCode"),
            "errorMessage": job.get("errorMessage"),
            "createdAt": job.get("createdAt"),
            "startedAt": job.get("startedAt"),
            "completedAt": job.get("completedAt"),
            "fileName": job.get("fileName"),
            "fileSize": job.get("fileSize"),
            "mimeType": job.get("mimeType"),
            "downloadToken": job.get("downloadToken"),
            "retryCount": job.get("retryCount", 0),
        }


queue_manager = QueueManager()
