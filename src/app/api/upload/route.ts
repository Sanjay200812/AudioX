import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getBaseTempDir } from '@/lib/storage/temp';
import { LocalProvider } from '@/lib/providers/local.provider';

const ALLOWED_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.mp3', '.m4a', '.wav', '.aac']);
const MAX_UPLOAD_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) || 500) * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the maximum permitted limit of ${Math.round(MAX_UPLOAD_SIZE / (1024 * 1024))}MB.` },
        { status: 400 }
      );
    }

    const originalName = file.name || 'uploaded_media';
    const ext = path.extname(originalName).toLowerCase();

    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file extension (${ext}). Supported: MP4, MOV, WEBM, MKV, MP3, M4A, WAV, AAC.` },
        { status: 400 }
      );
    }

    const uploadDir = path.join(getBaseTempDir(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uniqueId = crypto.randomUUID();
    const targetPath = path.join(uploadDir, `${uniqueId}_${path.basename(originalName)}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(targetPath, buffer);

    const localProvider = new LocalProvider();
    const analysis = await localProvider.analyze(targetPath);

    return NextResponse.json({
      success: true,
      analysis,
      filePath: `local://${targetPath}`,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message || 'File upload failed.' }, { status: 500 });
  }
}
