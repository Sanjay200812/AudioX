import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDownloadRecord } from '@/lib/storage/temp';
import { fetchWorkerDownload } from '@/lib/worker-client';

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

  // 1. If remote job on external worker, stream directly from worker
  if (record.remoteJobId) {
    try {
      const workerRes = await fetchWorkerDownload(record.remoteJobId);
      if (!workerRes.ok) {
        console.error(`[download] Worker fetch failed: status ${workerRes.status}`);
        return NextResponse.json({ error: 'Failed to retrieve audio from processing worker.' }, { status: 502 });
      }

      const headers = new Headers();
      headers.set('Content-Type', record.mimeType || workerRes.headers.get('Content-Type') || 'audio/mpeg');
      if (record.fileSize) {
        headers.set('Content-Length', record.fileSize.toString());
      } else if (workerRes.headers.get('Content-Length')) {
        headers.set('Content-Length', workerRes.headers.get('Content-Length')!);
      }
      headers.set('Content-Disposition', `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedFileName}`);
      headers.set('Cache-Control', 'no-store, max-age=0');

      return new Response(workerRes.body, {
        status: 200,
        headers,
      });
    } catch (err: any) {
      console.error('[download] Remote stream error:', err);
      return NextResponse.json({ error: 'Audio processing service is temporarily unavailable.' }, { status: 503 });
    }
  }

  // 2. Fallback if local file exists
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

