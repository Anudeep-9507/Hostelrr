-- =============================================================================
-- 032_drop_onboarding_snapshots.sql
-- Remove unused snapshot columns from onboarding table
-- Reason: number_of_floors and rooms_per_floor are derived/computed fields
--         never used in queries or RLS. Only stored but not read.
-- =============================================================================

ALTER TABLE IF EXISTS public.onboarding
  DROP COLUMN IF EXISTS number_of_floors,
  DROP COLUMN IF EXISTS rooms_per_floor;
