import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const BASE_TEMP_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'audiox');
const FILE_EXPIRY_MS = (parseInt(process.env.FILE_EXPIRY_MINUTES || '30', 10) || 30) * 60 * 1000;

// Token record in memory
export interface DownloadTokenRecord {
  token: string;
  filePath?: string;
  remoteJobId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __audiox_token_store__: Map<string, DownloadTokenRecord> | undefined;
}

// In-memory token store attached to globalThis to survive Next.js dev & route bundling boundaries
const tokenStore: Map<string, DownloadTokenRecord> =
  globalThis.__audiox_token_store__ ?? new Map<string, DownloadTokenRecord>();

globalThis.__audiox_token_store__ = tokenStore;

export function getBaseTempDir(): string {
  if (!fs.existsSync(/*turbopackIgnore: true*/ BASE_TEMP_DIR)) {
    fs.mkdirSync(BASE_TEMP_DIR, { recursive: true });
  }
  return BASE_TEMP_DIR;
}

export function createJobWorkspace(jobId: string): string {
  const jobDir = path.join(getBaseTempDir(), jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }
  return jobDir;
}

export function cleanJobWorkspace(jobId: string): void {
  try {
    const jobDir = path.join(getBaseTempDir(), jobId);
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed to clean workspace for job ${jobId}:`, err);
  }
}

export function registerDownloadToken(params: {
  filePath?: string;
  remoteJobId?: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
}): string {
  const token = crypto.randomUUID();
  let size = params.fileSize || 0;
  if (!size && params.filePath && fs.existsSync(params.filePath)) {
    try {
      size = fs.statSync(params.filePath).size;
    } catch {}
  }

  const record: DownloadTokenRecord = {
    token,
    filePath: params.filePath,
    remoteJobId: params.remoteJobId,
    fileName: params.fileName,
    fileSize: size,
    mimeType: params.mimeType,
    createdAt: Date.now(),
    expiresAt: Date.now() + FILE_EXPIRY_MS,
  };

  tokenStore.set(token, record);

  // Write token.json in job workspace if local directory exists
  if (params.filePath) {
    try {
      const metaPath = path.join(path.dirname(params.filePath), 'token.json');
      fs.writeFileSync(metaPath, JSON.stringify(record), 'utf8');
    } catch {}
  }

  return token;
}

export function getDownloadRecord(token: string): DownloadTokenRecord | null {
  let record = tokenStore.get(token);

  // If not found in-memory, recover from job workspace disk
  if (!record) {
    try {
      const baseDir = getBaseTempDir();
      if (fs.existsSync(/*turbopackIgnore: true*/ baseDir)) {
        const entries = fs.readdirSync(/*turbopackIgnore: true*/ baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const metaFile = path.join(baseDir, entry.name, 'token.json');
            if (fs.existsSync(metaFile)) {
              try {
                const parsed: DownloadTokenRecord = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
                if (parsed && parsed.token === token) {
                  record = parsed;
                  tokenStore.set(token, record);
                  break;
                }
              } catch {}
            }
          }
        }
      }
    } catch {}
  }

  if (!record) return null;

  if (Date.now() > record.expiresAt) {
    // Expired
    tokenStore.delete(token);
    try {
      if (record.filePath && fs.existsSync(record.filePath)) {
        fs.unlinkSync(record.filePath);
      }
    } catch {}
    return null;
  }

  // If it's a local file record, ensure the file still exists
  if (!record.remoteJobId && record.filePath && !fs.existsSync(record.filePath)) {
    tokenStore.delete(token);
    return null;
  }

  return record;
}

export function runStorageCleanup(): { cleanedTokens: number; cleanedDirs: number } {
  const now = Date.now();
  let cleanedTokens = 0;
  let cleanedDirs = 0;

  // 1. Clean expired tokens
  for (const [token, record] of tokenStore.entries()) {
    if (now > record.expiresAt) {
      tokenStore.delete(token);
      cleanedTokens++;
      try {
        if (record.filePath && fs.existsSync(record.filePath)) {
          fs.unlinkSync(record.filePath);
        }
      } catch {}
    }
  }

  // 2. Clean orphaned directories older than expiry
  try {
    const baseDir = getBaseTempDir();
    const entries = fs.readdirSync(/*turbopackIgnore: true*/ baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(baseDir, entry.name);
        try {
          const stats = fs.statSync(dirPath);
          const ageMs = now - stats.mtimeMs;
          if (ageMs > FILE_EXPIRY_MS) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            cleanedDirs++;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error('Storage cleanup scan failed:', err);
  }

  return { cleanedTokens, cleanedDirs };
}

// Periodic cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(runStorageCleanup, 10 * 60 * 1000);
}
