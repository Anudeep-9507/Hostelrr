-- =============================================================================
-- 016_remove_complaints.sql
-- Drop the complaints table and its associated enum type.
-- =============================================================================

DROP TABLE IF EXISTS public.complaints CASCADE;
DROP TYPE IF EXISTS public.complaint_status;

COMMENT ON SCHEMA public IS 'Public schema after complaints removal.';
