-- ==============================================================================
-- AudioX - Supabase PostgreSQL Schema & Storage Setup
-- Run this script in your Supabase Project -> SQL Editor
-- ==============================================================================

-- 1. Create Downloads History Table
CREATE TABLE IF NOT EXISTS public.downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    thumbnail TEXT,
    format TEXT NOT NULL DEFAULT 'mp3',
    quality TEXT NOT NULL DEFAULT 'high',
    file_size BIGINT,
    file_name TEXT NOT NULL,
    storage_path TEXT,
    public_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON public.downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON public.downloads(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies for public.downloads
-- Users can read their own download records
CREATE POLICY "Users can view own downloads"
    ON public.downloads
    FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can insert their own download records
CREATE POLICY "Users can insert own downloads"
    ON public.downloads
    FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can delete their own download records
CREATE POLICY "Users can delete own downloads"
    ON public.downloads
    FOR DELETE
    USING (auth.uid() = user_id);

-- 3. Storage Bucket Setup
-- Create the audiox-media storage bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('audiox-media', 'audiox-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies: Allow public downloads or authenticated reads
CREATE POLICY "Public media access"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'audiox-media');

-- Service role / authenticated user upload policy
CREATE POLICY "Allow server-side uploads"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'audiox-media');
