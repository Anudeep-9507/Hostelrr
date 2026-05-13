-- =============================================================================
-- 043_exclude_reserved_from_cycle_generation.sql
--
-- Update all payment cycle generation functions to exclude reserved residents.
--
-- CRITICAL: Reserved residents must NEVER have payment cycles generated,
-- even by cron jobs. They only get cycles when confirm_move_in RPC runs.
--
-- This migration updates:
-- 1. generate_payment_cycles(p_hostel_id) - owner-callable RPC
-- 2. generate_all_payment_cycles() - pg_cron system function
-- 3. tag_late_cycles() - ensures reserved residents never tagged as late
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. UPDATE generate_payment_cycles
--    Add filter: AND r.status = 'active'
--    Excludes reserved residents from cycle generation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payment_cycles(p_hostel_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostel            public.hostels%ROWTYPE;
  v_resident          RECORD;
  v_cycle_count       INTEGER;
  v_new_cycle_start   DATE;
  v_new_cycle_end     DATE;
  v_due_date          DATE;
  v_created_count     INTEGER := 0;
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hostel FROM public.hostels WHERE id = p_hostel_id;

  -- CRITICAL: Only iterate ACTIVE residents, skip reserved entirely
  FOR v_resident IN
    SELECT r.id, r.monthly_rent, r.join_date
    FROM public.residents r
    WHERE r.hostel_id = p_hostel_id AND r.status = 'active'
  LOOP
    -- Count existing cycles to determine which month comes next
    SELECT COUNT(*) INTO v_cycle_count
    FROM public.payment_cycles
    WHERE resident_id = v_resident.id;

    IF v_hostel.rent_cycle_type = 'joining_based' THEN
      -- Cycle N starts on join_date + N months (no drift)
      v_new_cycle_start := (v_resident.join_date + (v_cycle_count * INTERVAL '1 month'))::DATE;
      v_new_cycle_end   := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_due_date        := v_new_cycle_start;  -- prepaid

    ELSE  -- monthly_fixed
      SELECT (MAX(cycle_end) + INTERVAL '1 day')::DATE INTO v_new_cycle_start
      FROM public.payment_cycles WHERE resident_id = v_resident.id;

      IF v_new_cycle_start IS NULL THEN
        v_new_cycle_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
      END IF;

      v_new_cycle_end := (DATE_TRUNC('month', v_new_cycle_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_due_date := public._compute_due_date(
        v_new_cycle_start,
        v_hostel.rent_cycle_type,
        v_hostel.rent_due_day
      );
    END IF;

    -- Only generate if the new cycle starts within the next billing window
    IF v_new_cycle_start > (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE THEN
      CONTINUE;
    END IF;

    -- ON CONFLICT DO NOTHING prevents duplicate cycles (idempotent)
    INSERT INTO public.payment_cycles (
      resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
    )
    VALUES (
      v_resident.id, p_hostel_id, v_new_cycle_start, v_new_cycle_end, v_due_date, v_resident.monthly_rent, 'pending'
    )
    ON CONFLICT (resident_id, cycle_start) DO NOTHING;

    IF FOUND THEN
      v_created_count := v_created_count + 1;
    END IF;
  END LOOP;

  RETURN v_created_count;
END;
$$;

COMMENT ON FUNCTION public.generate_payment_cycles IS
  'Monthly cron: generates next billing cycle for ACTIVE residents only. '
  'Reserved residents (status=reserved) are excluded. '
  'joining_based anchors to join_date day-of-month. Idempotent.';


-- ---------------------------------------------------------------------------
-- 2. UPDATE generate_all_payment_cycles
--    System-level function for pg_cron (no auth check)
--    Add filter: AND r.status = 'active'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_all_payment_cycles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostel          public.hostels%ROWTYPE;
  v_resident        RECORD;
  v_cycle_count     INTEGER;
  v_new_cycle_start DATE;
  v_new_cycle_end   DATE;
  v_due_date        DATE;
  v_total_created   INTEGER := 0;
BEGIN
  FOR v_hostel IN SELECT * FROM public.hostels LOOP

    -- CRITICAL: Only iterate ACTIVE residents, skip reserved entirely
    FOR v_resident IN
      SELECT r.id, r.monthly_rent, r.join_date
      FROM public.residents r
      WHERE r.hostel_id = v_hostel.id AND r.status = 'active'
    LOOP
      SELECT COUNT(*) INTO v_cycle_count
      FROM public.payment_cycles
      WHERE resident_id = v_resident.id;

      IF v_hostel.rent_cycle_type = 'joining_based' THEN
        -- Cycle N starts on join_date + N months
        v_new_cycle_start := (v_resident.join_date + (v_cycle_count * INTERVAL '1 month'))::DATE;
        v_new_cycle_end   := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_due_date        := v_new_cycle_start;

      ELSE -- monthly_fixed
        SELECT (MAX(cycle_end) + INTERVAL '1 day')::DATE INTO v_new_cycle_start
        FROM public.payment_cycles WHERE resident_id = v_resident.id;

        IF v_new_cycle_start IS NULL THEN
          v_new_cycle_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
        END IF;

        v_new_cycle_end := (DATE_TRUNC('month', v_new_cycle_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_due_date := public._compute_due_date(
          v_new_cycle_start,
          v_hostel.rent_cycle_type,
          v_hostel.rent_due_day
        );
      END IF;

      -- Only generate if cycle starts within next billing window
      IF v_new_cycle_start > (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE THEN
        CONTINUE;
      END IF;

      INSERT INTO public.payment_cycles (
        resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
      )
      VALUES (
        v_resident.id, v_hostel.id, v_new_cycle_start, v_new_cycle_end,
        v_due_date, v_resident.monthly_rent, 'pending'
      )
      ON CONFLICT (resident_id, cycle_start) DO NOTHING;

      IF FOUND THEN
        v_total_created := v_total_created + 1;
      END IF;
    END LOOP;

  END LOOP;

  RETURN v_total_created;
END;
$$;

COMMENT ON FUNCTION public.generate_all_payment_cycles IS
  'System cron function: generates next payment cycle for ACTIVE residents '
  'across all hostels. Reserved residents (status=reserved) are excluded. '
  'No auth check — intended for pg_cron use only. Idempotent.';


-- ---------------------------------------------------------------------------
-- 3. UPDATE tag_late_cycles
--    Ensure reserved residents are never tagged as late
--    (Defensive: they shouldn't have cycles anyway, but add filter for safety)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tag_late_cycles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.payment_cycles
  SET status = 'late',
      updated_at = NOW()
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE
    -- CRITICAL: Only update cycles for active residents
    AND resident_id IN (
      SELECT id FROM public.residents WHERE status = 'active'
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.tag_late_cycles IS
  'Daily cron: marks past-due pending/partial cycles as late (active residents only). '
  'Reserved residents are excluded (defensive measure).';
