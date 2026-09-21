# AudioX Production Multi-Stage Container
FROM node:22-alpine AS base

# Install system dependencies: FFmpeg and Python for media processing
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    ca-certificates

# Install yt-dlp in python
RUN python3 -m pip install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TEMP_DIR=/tmp/audiox

RUN mkdir -p /tmp/audiox && chown -R node:node /tmp/audiox

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
