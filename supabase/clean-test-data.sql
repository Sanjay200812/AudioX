-- ==========================================================
-- AudioX: Purge Development & Test Records from Supabase
-- ==========================================================
-- This script removes ONLY development-generated test records
-- (such as AX-TEST-*, AX-E2E-*, AX-SCENARIO-*, vid_test_*).
-- Genuine visitor or download activity is NOT deleted.
-- ==========================================================

DELETE FROM public.download_events 
WHERE visitor_id LIKE 'AX-TEST%' 
   OR visitor_id LIKE 'AX-E2E%' 
   OR visitor_id LIKE 'AX-SCENARIO%' 
   OR visitor_id LIKE 'AX-VTEST%' 
   OR video_id LIKE 'vid_test%' 
   OR title ILIKE '%Bohemian Rhapsody%' 
   OR title ILIKE '%Hotel California%' 
   OR title ILIKE 'Song A%' 
   OR title ILIKE 'Song B%';

DELETE FROM public.playlist_events 
WHERE visitor_id LIKE 'AX-TEST%' 
   OR visitor_id LIKE 'AX-E2E%' 
   OR visitor_id LIKE 'AX-SCENARIO%' 
   OR playlist_title ILIKE 'Rock Classics%' 
   OR playlist_title ILIKE 'Rock Greatest%';

DELETE FROM public.anonymous_visitors 
WHERE visitor_id LIKE 'AX-TEST%' 
   OR visitor_id LIKE 'AX-E2E%' 
   OR visitor_id LIKE 'AX-SCENARIO%' 
   OR visitor_id LIKE 'AX-VTEST%';
