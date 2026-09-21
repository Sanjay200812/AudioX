-- ==========================================================
-- AudioX Analytics & Operations Database Setup for Supabase
-- ==========================================================
-- This schema stores ONLY anonymous operational analytics and
-- media processing telemetry. No audio files or personal
-- identifiable information (PII) are stored.
--
-- Instructions:
-- 1. Open your Supabase Project Dashboard.
-- 2. Navigate to the SQL Editor.
-- 3. Paste this script and click "Run".
-- ==========================================================

-- Enable pgcrypto / uuid-ossp if needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------
-- 1. TABLE: anonymous_visitors
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anonymous_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT UNIQUE NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_type TEXT DEFAULT 'Desktop',
    browser TEXT DEFAULT 'Browser',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 2. TABLE: download_events
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.download_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    video_id TEXT,
    title TEXT NOT NULL,
    creator TEXT,
    playlist_id TEXT,
    playlist_title TEXT,
    format TEXT NOT NULL DEFAULT 'mp3',
    quality TEXT NOT NULL DEFAULT 'high',
    status TEXT NOT NULL DEFAULT 'downloaded',
    filename TEXT,
    processing_duration_ms INTEGER DEFAULT 0,
    is_redownload BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 3. TABLE: playlist_events
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playlist_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    playlist_id TEXT,
    playlist_title TEXT NOT NULL,
    total_tracks INTEGER NOT NULL DEFAULT 0,
    selected_tracks INTEGER NOT NULL DEFAULT 0,
    completed_tracks INTEGER NOT NULL DEFAULT 0,
    failed_tracks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 4. PERFORMANCE & QUERY INDEXES
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_visitors_visitor_id ON public.anonymous_visitors(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON public.anonymous_visitors(last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_downloads_visitor_id ON public.download_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_downloads_video_id ON public.download_events(video_id);
CREATE INDEX IF NOT EXISTS idx_downloads_playlist_id ON public.download_events(playlist_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON public.download_events(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON public.download_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_playlists_visitor_id ON public.playlist_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_playlists_playlist_id ON public.playlist_events(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON public.playlist_events(created_at DESC);

-- ----------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------
-- By enabling RLS, public anonymous access via the client-side
-- anon key is disabled. All operations MUST go through AudioX's
-- authenticated backend using the SUPABASE_SECRET_KEY service role.
ALTER TABLE public.anonymous_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_events ENABLE ROW LEVEL SECURITY;

-- Allow service-role (server secret key) full access
DROP POLICY IF EXISTS "Service role full access on anonymous_visitors" ON public.anonymous_visitors;
CREATE POLICY "Service role full access on anonymous_visitors"
    ON public.anonymous_visitors
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on download_events" ON public.download_events;
CREATE POLICY "Service role full access on download_events"
    ON public.download_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on playlist_events" ON public.playlist_events;
CREATE POLICY "Service role full access on playlist_events"
    ON public.playlist_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
