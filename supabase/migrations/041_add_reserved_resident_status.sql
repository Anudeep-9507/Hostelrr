-- =============================================================================
-- 041_add_reserved_resident_status.sql
--
-- Add 'reserved' status to resident_status enum and track confirmation date.
--
-- CRITICAL: This migration is backward-safe.
-- - Existing residents keep status='active' (unchanged).
-- - New reserved residents get status='reserved'.
-- - confirmed_at is NULL until confirm_move_in RPC executes.
--
-- Rationale:
-- Reserved residents = future occupancy commitment only, no billing until confirmed.
-- confirmed_at tracks when owner activates the resident (for audit + analytics).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add 'reserved' value to resident_status enum
--    BEFORE 'active' (so new residents default to active if not specified)
-- ---------------------------------------------------------------------------
ALTER TYPE public.resident_status ADD VALUE 'reserved' BEFORE 'active';

-- ---------------------------------------------------------------------------
-- 2. Add confirmed_at timestamp to residents table
--    NULL for all residents (reserved and active).
--    populated only when confirm_move_in RPC runs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL;

COMMENT ON COLUMN public.residents.confirmed_at IS
  'Timestamp when reserved resident was confirmed by owner. NULL for active residents and until confirmation.';

UPDATE public.residents
SET confirmed_at = created_at
WHERE status = 'active'
  AND confirmed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Create index for efficient confirmed_at queries
--    (future: analytics on time from reserved to confirmed)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_residents_confirmed_at
  ON public.residents (hostel_id, confirmed_at);
