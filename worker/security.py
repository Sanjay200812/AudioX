import os
import re
import secrets
import urllib.parse
from typing import Optional
from fastapi import Header, HTTPException, status

WORKER_SECRET = os.getenv("WORKER_SECRET", "").strip()

# Allowed YouTube hostnames
ALLOWED_YOUTUBE_DOMAINS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}

# Private IP regex patterns to prevent SSRF
PRIVATE_IP_REGEX = re.compile(
    r"^(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|::1|fc00:|fe80:)"
)


def verify_worker_secret(authorization: Optional[str] = Header(None)) -> bool:
    """
    Validates Authorization: Bearer <WORKER_SECRET>.
    If WORKER_SECRET is not configured (e.g. in dev mode), access is permitted with a warning.
    In production, rejects requests with 401 Unauthorized if secret is missing or invalid.
    """
    if not WORKER_SECRET:
        return True

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization scheme. Must be Bearer.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1].strip()
    if not secrets.compare_digest(token, WORKER_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker secret token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True


def validate_source_url(url_or_id: str) -> str:
    """
    Validates media URL or videoId:
    1. Rejects private network addresses (SSRF).
    2. Only accepts valid YouTube domains or standard 11-char video IDs.
    3. Returns canonical YouTube URL.
    """
    if not url_or_id or not isinstance(url_or_id, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source URL or video ID is required.")

    cleaned = url_or_id.strip()

    # 1. Bare 11-character video ID
    if re.match(r"^[a-zA-Z0-9_-]{11}$", cleaned):
        return f"https://www.youtube.com/watch?v={cleaned}"

    # 2. Parse URL
    try:
        parsed = urllib.parse.urlparse(cleaned)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL format.")

    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL must use http or https.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing hostname in URL.")

    # Prevent SSRF: block localhost and private subnets
    if PRIVATE_IP_REGEX.match(hostname):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Internal and private URLs are blocked.")

    # Validate YouTube domains
    if hostname not in ALLOWED_YOUTUBE_DOMAINS and not hostname.endswith(".youtube.com"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported domain: {hostname}. Only YouTube media is supported.",
        )

    # Canonicalize youtu.be
    if hostname == "youtu.be":
        vid_id = parsed.path.lstrip("/").split("/")[0].split("?")[0]
        if re.match(r"^[a-zA-Z0-9_-]{11}$", vid_id):
            return f"https://www.youtube.com/watch?v={vid_id}"

    # Canonicalize shorts
    if "/shorts/" in parsed.path:
        m = re.search(r"/shorts/([a-zA-Z0-9_-]{11})", parsed.path)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"

    # Canonicalize watch URLs
    qs = urllib.parse.parse_qs(parsed.query)
    if "v" in qs and qs["v"]:
        vid_id = qs["v"][0]
        if re.match(r"^[a-zA-Z0-9_-]{11}$", vid_id):
            return f"https://www.youtube.com/watch?v={vid_id}"

    return cleaned


def generate_download_token() -> str:
    """Generates a secure, URL-safe random token for temporary download validation."""
    return secrets.token_urlsafe(32)


def sanitize_filename(name: str) -> str:
    """Cleans a string to make it safe for filesystem and HTTP Content-Disposition."""
    cleaned = "".join(c for c in name if c.isalnum() or c in " ._-()[]'\"").strip()
    return cleaned or "audio_track"
