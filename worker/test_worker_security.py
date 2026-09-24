import os
import sys
import unittest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test with temporary environment
os.environ["WORKER_SECRET"] = "test_secret_123"
os.environ["MAX_QUEUE_CAPACITY"] = "5"
os.environ["MAX_STORED_JOBS"] = "10"

from security import (
    verify_worker_secret,
    validate_job_id,
    validate_media_options,
    validate_source_url,
)
from queue_manager import QueueManager


class TestWorkerSecurity(unittest.TestCase):
    def test_verify_worker_secret_success(self):
        self.assertTrue(verify_worker_secret("Bearer test_secret_123"))

    def test_verify_worker_secret_invalid_or_missing(self):
        with self.assertRaises(HTTPException) as cm:
            verify_worker_secret(None)
        self.assertEqual(cm.exception.status_code, 401)

        with self.assertRaises(HTTPException) as cm:
            verify_worker_secret("Bearer wrong_secret")
        self.assertEqual(cm.exception.status_code, 401)

        with self.assertRaises(HTTPException) as cm:
            verify_worker_secret("Basic dXNlcjpwYXNz")
        self.assertEqual(cm.exception.status_code, 401)

    def test_validate_job_id_safe(self):
        safe_ids = ["test-123", "a1b2c3d4-e5f6", "job_01"]
        for jid in safe_ids:
            self.assertEqual(validate_job_id(jid), jid)

    def test_validate_job_id_traversal_blocked(self):
        dangerous_ids = [
            "../../etc/passwd",
            "../secret",
            "job/traversal",
            "job\\path",
            "",
            "x" * 65,
        ]
        for jid in dangerous_ids:
            with self.assertRaises(HTTPException) as cm:
                validate_job_id(jid)
            self.assertEqual(cm.exception.status_code, 400)

    def test_validate_media_options(self):
        fmt, q = validate_media_options("mp3", "high")
        self.assertEqual(fmt, "mp3")
        self.assertEqual(q, "high")

        fmt, q = validate_media_options("M4A", "BEST")
        self.assertEqual(fmt, "m4a")
        self.assertEqual(q, "best")

        with self.assertRaises(HTTPException) as cm:
            validate_media_options("exe", "high")
        self.assertEqual(cm.exception.status_code, 400)

        with self.assertRaises(HTTPException) as cm:
            validate_media_options("mp3", "invalid_quality")
        self.assertEqual(cm.exception.status_code, 400)

    def test_validate_source_url(self):
        canonical = validate_source_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        self.assertEqual(canonical, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        # SSRF blocked
        with self.assertRaises(HTTPException) as cm:
            validate_source_url("http://127.0.0.1/video")
        self.assertEqual(cm.exception.status_code, 400)

        with self.assertRaises(HTTPException) as cm:
            validate_source_url("http://169.254.169.254/latest/meta-data")
        self.assertEqual(cm.exception.status_code, 400)

    def test_queue_manager_idempotency_and_limits(self):
        qm = QueueManager()

        # Create job 1
        j1 = qm.create_job(
            job_id="job-1",
            source_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            video_id="dQw4w9WgXcQ",
            title="Rick Astley",
            creator="Rick",
            thumbnail="",
            duration=212,
            audio_format="mp3",
            quality="high",
        )
        self.assertEqual(j1["id"], "job-1")

        # Idempotent re-call with same ID
        j1_duplicate = qm.create_job(
            job_id="job-1",
            source_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            video_id="dQw4w9WgXcQ",
            title="Rick Astley",
            creator="Rick",
            thumbnail="",
            duration=212,
            audio_format="mp3",
            quality="high",
        )
        self.assertEqual(j1_duplicate["id"], "job-1")
        self.assertEqual(qm.queue.qsize(), 1)


if __name__ == "__main__":
    unittest.main()
