import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Direct file upload is disabled in production to protect serverless resource limits.
 * All media conversions are executed via YouTube media analysis and the dedicated worker.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Direct file upload is disabled. Please provide a YouTube link to convert audio.',
      errorCode: 'UPLOAD_DISABLED',
    },
    { status: 501 }
  );
}
