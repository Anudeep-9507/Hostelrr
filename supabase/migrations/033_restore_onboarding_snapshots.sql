-- =============================================================================
-- 033_restore_onboarding_snapshots.sql
-- Restore snapshot columns to onboarding table (reverts 032)
-- =============================================================================

ALTER TABLE IF EXISTS public.onboarding
  ADD COLUMN IF NOT EXISTS number_of_floors INTEGER NOT NULL DEFAULT 1 CHECK (number_of_floors > 0),
  ADD COLUMN IF NOT EXISTS rooms_per_floor JSONB NOT NULL DEFAULT '{}'::JSONB;
