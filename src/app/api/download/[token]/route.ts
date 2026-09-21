import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDownloadRecord } from '@/lib/storage/temp';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  if (!token) {
    return NextResponse.json({ error: 'Download token is required.' }, { status: 400 });
  }

  const record = getDownloadRecord(token);
  if (!record) {
    return NextResponse.json(
      { error: 'Download has expired or is invalid. Please process the media again.' },
      { status: 404 }
    );
  }

  const safeAsciiName = record.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
  const encodedFileName = encodeURIComponent(record.fileName)
    .replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, '%2A');

  if (record.filePath && fs.existsSync(record.filePath)) {
    try {
      const fileBuffer = fs.readFileSync(record.filePath);
      return new Response(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': record.mimeType,
          'Content-Length': record.fileSize.toString(),
          'Content-Disposition': `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedFileName}`,
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    } catch (err: any) {
      console.error('File stream error:', err);
      return NextResponse.json({ error: 'Failed to retrieve audio file.' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Audio file not found or expired.' }, { status: 404 });
}
