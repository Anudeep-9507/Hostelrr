-- =============================================================================
-- 013_fix_cycle_date_drift.sql
--
-- Problem: generate_payment_cycles uses (MAX(cycle_end) + 1 day) as the next
-- cycle_start. This DRIFTS over months with different lengths:
--
--   Joined Jun 10 → cycle_end = Jul 9
--   Next start    = Jul 10   ✓ (still ok)
--   Next end      = Aug 9
--   Next start    = Aug 10   ✓
--   BUT if any month had 31 days: end = next_month_9 → start = next_month_10 → drift accumulates
--
-- Fix: Anchor every cycle to the ORIGINAL join_date day-of-month.
--   Cycle N starts on: join_date + N months  (same calendar day, N months later)
--   Cycle N ends on:   join_date + (N+1) months - 1 day
--   Due date for cycle N: join_date + (N+1) months  (same day, one more month)
--
-- Examples:
--   Joined Jun 10 → cycle 1: Jun 10–Jul 9, due Jul 10
--   Joined Jun 10 → cycle 2: Jul 10–Aug 9, due Aug 10  (always 10th)
--   Joined Jan 31 → cycle 1: Jan 31–Feb 27/28, due Feb 28/29 (clamped)
--   Joined Jan 31 → cycle 2: Mar 1 or Mar 3... actually see note below
--
-- Note on end-of-month: Postgres + INTERVAL '1 month' correctly clamps.
--   '2026-01-31'::DATE + '1 month' = '2026-02-28'
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Rewrite generate_payment_cycles to anchor on join_date day-of-month
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
  v_cycle_count       INTEGER;    -- how many cycles already exist for this resident
  v_new_cycle_start   DATE;
  v_new_cycle_end     DATE;
  v_due_date          DATE;
  v_created_count     INTEGER := 0;
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hostel FROM public.hostels WHERE id = p_hostel_id;

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
      -- Anchor to join_date: cycle N starts on join_date + N months
      -- Cycle 0 = first cycle (already created by add_resident)
      -- Cycle 1 = second cycle = join_date + 1 month
      v_new_cycle_start := (v_resident.join_date + (v_cycle_count * INTERVAL '1 month'))::DATE;
      v_new_cycle_end   := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      -- Due date = same day as join_date, one more month after cycle_start
      -- = join_date + (cycle_count + 1) months
      v_due_date := (v_resident.join_date + ((v_cycle_count + 1) * INTERVAL '1 month'))::DATE;

    ELSE
      -- monthly_fixed: chain from last cycle_end (calendar months, no drift)
      SELECT (MAX(cycle_end) + INTERVAL '1 day')::DATE INTO v_new_cycle_start
      FROM public.payment_cycles
      WHERE resident_id = v_resident.id;

      IF v_new_cycle_start IS NULL THEN
        v_new_cycle_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
      END IF;

      v_new_cycle_end := (DATE_TRUNC('month', v_new_cycle_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      v_due_date := public._compute_due_date(
        v_new_cycle_start,
        v_hostel.rent_cycle_type,
        v_hostel.rent_due_day,
        v_hostel.grace_period_days
      );
    END IF;

    -- Only generate if the new cycle starts within the next billing window
    -- (this month or earlier — prevents pre-generating too far ahead)
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
  'Monthly cron: generates next billing cycle for active residents. '
  'joining_based anchors to join_date day-of-month (no drift). '
  'monthly_fixed uses calendar month boundaries. Idempotent.';
