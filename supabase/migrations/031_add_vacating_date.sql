-- =============================================================================
-- 031_add_vacating_date.sql
-- Add vacating_date column to residents table for future vacancy planning
-- =============================================================================

ALTER TABLE public.residents
ADD COLUMN IF NOT EXISTS vacating_date DATE;

COMMENT ON COLUMN public.residents.vacating_date IS 'Optional date when resident plans to vacate. Purely informational for planning. Does NOT automatically vacate resident.';
