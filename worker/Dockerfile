FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Explicitly install system dependencies: ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies including yt-dlp
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Build verification: Ensure python3, yt-dlp, and ffmpeg are all functional
RUN python3 --version && \
    yt-dlp --version && \
    ffmpeg -version

# Copy worker application code
COPY . .

EXPOSE 8000

# Startup verification and start server
CMD ["sh", "-c", "python3 --version && yt-dlp --version && ffmpeg -version && uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
