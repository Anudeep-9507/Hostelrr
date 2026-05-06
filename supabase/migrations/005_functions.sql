-- =============================================================================
-- 005_functions.sql
-- Internal business-logic functions and triggers for Hostelrr
-- These run as SECURITY DEFINER and are NOT directly callable from the client.
-- They are invoked by RPC functions in 006_rpc.sql or by DB triggers.
-- Depends on: 002_tables.sql, 003_indexes.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER: Log an activity entry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._log_activity(
  p_hostel_id   UUID,
  p_action      TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   UUID DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (hostel_id, performed_by, action, entity_type, entity_id, metadata)
  VALUES (p_hostel_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$$;


-- ---------------------------------------------------------------------------
-- HELPER: Compute due date for a payment cycle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._compute_due_date(
  p_cycle_start     DATE,
  p_rent_cycle_type rent_cycle_type,
  p_rent_due_day    SMALLINT DEFAULT NULL,  -- for monthly_fixed
  p_grace_days      SMALLINT DEFAULT 5
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_due_date DATE;
BEGIN
  IF p_rent_cycle_type = 'monthly_fixed' THEN
    -- Due on fixed day of the cycle's month (e.g. 1st)
    v_due_date := DATE_TRUNC('month', p_cycle_start)::DATE
                  + (COALESCE(p_rent_due_day, 1) - 1) * INTERVAL '1 day';
    -- If that day is already in the past relative to cycle_start, push to next month
    IF v_due_date < p_cycle_start THEN
      v_due_date := v_due_date + INTERVAL '1 month';
    END IF;
  ELSE
    -- joining_based: due date = cycle_start + grace period
    v_due_date := p_cycle_start + (p_grace_days * INTERVAL '1 day');
  END IF;

  RETURN v_due_date;
END;
$$;


-- ---------------------------------------------------------------------------
-- HELPER: Recompute and update a payment cycle's status
--         Call this whenever paid_amount changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refresh_cycle_status(p_cycle_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle public.payment_cycles%ROWTYPE;
  v_new_status payment_status;
BEGIN
  SELECT * INTO v_cycle FROM public.payment_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_cycle.paid_amount >= v_cycle.total_amount THEN
    v_new_status := 'paid';
  ELSIF v_cycle.paid_amount > 0 THEN
    -- Partial: check if past due → it's late even if partial
    IF CURRENT_DATE > v_cycle.due_date THEN
      v_new_status := 'late';
    ELSE
      v_new_status := 'partial';
    END IF;
  ELSE
    -- Nothing paid
    IF CURRENT_DATE > v_cycle.due_date THEN
      v_new_status := 'late';
    ELSE
      v_new_status := 'pending';
    END IF;
  END IF;

  UPDATE public.payment_cycles
  SET status = v_new_status, updated_at = NOW()
  WHERE id = p_cycle_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- TRIGGER: After a payment is inserted, update the parent cycle's paid_amount
--          and refresh its status automatically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_payment_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Accumulate paid amount into the cycle
  UPDATE public.payment_cycles
  SET paid_amount = paid_amount + NEW.amount,
      updated_at  = NOW()
  WHERE id = NEW.cycle_id;

  -- Recompute status based on new totals
  PERFORM public._refresh_cycle_status(NEW.cycle_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_after_payment_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._on_payment_inserted();


-- ---------------------------------------------------------------------------
-- TRIGGER: Prevent occupying a bed that's already occupied by an active resident.
--          This is a DB-level guard in addition to the partial index.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guard_bed_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bed_status bed_status;
BEGIN
  SELECT status INTO v_bed_status FROM public.beds WHERE id = NEW.bed_id FOR UPDATE;

  IF v_bed_status = 'occupied' THEN
    RAISE EXCEPTION 'Bed % is already occupied. Please choose a different bed.', NEW.bed_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_guard_bed_on_resident_insert
  BEFORE INSERT ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._guard_bed_availability();


-- ---------------------------------------------------------------------------
-- TRIGGER: After a resident is inserted, update the bed's status to 'occupied'
--          (or 'reserved' if the resident is doing a pre-booking).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_resident_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beds
  SET status = CASE WHEN NEW.join_date > CURRENT_DATE THEN 'reserved' ELSE 'occupied' END
  WHERE id = NEW.bed_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_after_resident_insert
  AFTER INSERT ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._on_resident_inserted();


-- ---------------------------------------------------------------------------
-- TRIGGER: After a resident is updated to 'left', free the bed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_resident_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'left' AND OLD.status <> 'left' THEN
    -- Free the old bed
    UPDATE public.beds
    SET status = 'vacant'
    WHERE id = OLD.bed_id;
  END IF;

  -- If bed changed (bed move), handled via move_bed RPC which updates directly
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_resident_status_change
  AFTER UPDATE OF status ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._on_resident_status_changed();


-- ---------------------------------------------------------------------------
-- TRIGGER: Prevent deleting a room that has occupied or reserved beds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guard_room_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occupied_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_occupied_count
  FROM public.beds
  WHERE room_id = OLD.id
    AND status IN ('occupied', 'reserved');

  IF v_occupied_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete room % — it has % occupied/reserved bed(s). Vacate all residents first.',
      OLD.room_number, v_occupied_count
      USING ERRCODE = 'P0002';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER trg_guard_room_deletion
  BEFORE DELETE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public._guard_room_deletion();
