# Production-Ready AudioX Media Processing Worker Container
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TEMP_DIR=/tmp/audiox \
    PORT=8000

# Install necessary system dependencies: FFmpeg, ffprobe, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Verify system binaries are executable
RUN ffmpeg -version && ffprobe -version

WORKDIR /app

# Create non-root user and setup temporary workspace
RUN useradd -m -u 1001 -s /bin/bash audiox && \
    mkdir -p /tmp/audiox && \
    chown -R audiox:audiox /tmp/audiox && \
    chmod 777 /tmp/audiox

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker application source
COPY . .
RUN chown -R audiox:audiox /app

USER audiox

# Health check verifies FastAPI, yt-dlp, FFmpeg, and queue
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT}/health || exit 1

# Launch FastAPI using Uvicorn on 0.0.0.0 using runtime-provided PORT
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
