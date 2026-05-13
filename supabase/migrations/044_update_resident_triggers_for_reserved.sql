-- =============================================================================
-- 044_update_resident_triggers_for_reserved.sql
--
-- Update triggers to properly handle reserved residents.
--
-- Key changes:
-- 1. _on_resident_inserted: Set bed status based on resident.status
--    - If status='reserved': bed → 'reserved'
--    - If status='active': bed → 'occupied'
--
-- 2. _on_resident_status_changed: Handle reserved → active transition
--    - If OLD.status='reserved' AND NEW.status='active': bed 'reserved' → 'occupied'
--    - Existing left logic unchanged
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. UPDATE trigger _on_resident_inserted
--    Set bed status based on resident.status, not join_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_resident_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beds
  SET status = CASE 
    WHEN NEW.status = 'reserved'::public.resident_status THEN 'reserved'::public.bed_status
    ELSE 'occupied'::public.bed_status
  END
  WHERE id = NEW.bed_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._on_resident_inserted IS
  'After resident insert: set bed status based on resident status. '
  'reserved resident → bed reserved. active resident → bed occupied.';

-- Trigger already exists, just recreate to ensure it has the new function
CREATE OR REPLACE TRIGGER trg_after_resident_insert
  AFTER INSERT ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._on_resident_inserted();


-- ---------------------------------------------------------------------------
-- 2. UPDATE trigger _on_resident_status_changed
--    Handle all status transitions: reserved→active, active→left, etc.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_resident_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── TRANSITION: reserved → active (confirmation) ─────────────────────────
  IF OLD.status = 'reserved' AND NEW.status = 'active' THEN
    UPDATE public.beds
    SET status = 'occupied'::public.bed_status
    WHERE id = NEW.bed_id;
    RETURN NEW;
  END IF;

  -- ── TRANSITION: active → left (vacate) ────────────────────────────────────
  IF NEW.status = 'left' AND OLD.status <> 'left' THEN
    UPDATE public.beds
    SET status = 'vacant'::public.bed_status
    WHERE id = OLD.bed_id;
    RETURN NEW;
  END IF;

  -- No other transitions affect bed status
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._on_resident_status_changed IS
  'After resident status update: handle bed transitions. '
  'reserved→active: bed reserved→occupied. '
  'active→left: bed occupied→vacant. '
  'Defensive: only handle expected transitions.';

-- Trigger already exists, just recreate to ensure it has the new function
CREATE OR REPLACE TRIGGER trg_on_resident_status_change
  AFTER UPDATE OF status ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._on_resident_status_changed();
