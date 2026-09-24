import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * AudioX Supabase Storage Service.
 * Provides persistent cloud storage for converted audio files and thumbnails.
 * All uploads execute securely through server-side admin client using service-role credentials.
 */

export const AUDIO_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'audiox-media';

export function isSupabaseStorageConfigured(): boolean {
  const admin = createAdminClient();
  return admin !== null;
}

export interface SupabaseStorageUploadResult {
  path: string;
  publicUrl?: string;
  signedUrl?: string;
}

/**
 * Upload an audio file or stream directly to Supabase Storage.
 * Generates both a public URL and a signed download URL.
 */
export async function uploadAudioToSupabase(
  filename: string,
  body: Buffer | ArrayBuffer | Uint8Array,
  contentType: string = 'audio/mpeg',
  userId?: string
): Promise<SupabaseStorageUploadResult | null> {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  try {
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = userId ? `users/${userId}` : 'public';
    const filePath = `${folder}/${Date.now()}-${cleanFilename}`;

    const { error: uploadError } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .upload(filePath, body, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[supabase-storage] Upload error:', uploadError.message);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // Create 1-hour signed download URL
    const { data: signedData } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .createSignedUrl(filePath, 3600);

    return {
      path: filePath,
      publicUrl: publicUrlData?.publicUrl,
      signedUrl: signedData?.signedUrl,
    };
  } catch (err: any) {
    console.error('[supabase-storage] Unexpected upload exception:', err?.message || err);
    return null;
  }
}

/**
 * Generates a fresh signed download URL for an existing stored audio file.
 */
export async function getAudioSignedUrl(
  filePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error('[supabase-storage] Error generating signed URL:', error?.message);
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Deletes an audio file from Supabase Storage.
 */
export async function deleteAudioFromSupabase(filePath: string): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .remove([filePath]);

    return !error;
  } catch {
    return false;
  }
}
