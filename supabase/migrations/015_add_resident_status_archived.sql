-- =============================================================================
-- 015_add_resident_status_archived.sql
-- Add 'archived' value to resident_status enum to support archiving workflow.
-- =============================================================================

ALTER TYPE public.resident_status ADD VALUE IF NOT EXISTS 'archived';

COMMENT ON TYPE public.resident_status IS 'Resident lifecycle states: active, left, archived (inactive but for record-keeping).';
