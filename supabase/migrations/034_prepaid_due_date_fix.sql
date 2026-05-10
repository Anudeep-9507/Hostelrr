-- =============================================================================
-- 034_prepaid_due_date_fix.sql
-- PREPAID BILLING SEMANTICS: due_date = cycle_start for joining_based
--
-- Problem:  joining_based hostels had due_date = cycle_start + 1 month,
--           creating POSTPAID semantics.  Hostelrr's UI, reminders, late
--           detection, and owner expectations all assume PREPAID (advance rent).
--
-- Fix:      For joining_based hostels:
--             due_date = cycle_start   (rent due on day occupancy period begins)
--
-- Affected functions:
--   1. _compute_due_date()          — core helper
--   2. generate_payment_cycles()    — owner-callable RPC
--   3. generate_all_payment_cycles()— pg_cron system function
--
-- Also includes a DATA MIGRATION for existing joining_based payment_cycles
-- to set due_date = cycle_start where they were incorrect.
--
-- Safe: idempotent, ON CONFLICT protected, does NOT touch monthly_fixed data.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix _compute_due_date: joining_based → due_date = cycle_start
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._compute_due_date(
  p_cycle_start     DATE,
  p_rent_cycle_type rent_cycle_type,
  p_rent_due_day    SMALLINT DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_due_date DATE;
BEGIN
  IF p_rent_cycle_type = 'monthly_fixed' THEN
    -- monthly_fixed: due on the configured day-of-month (e.g. 1st, 5th)
    v_due_date := DATE_TRUNC('month', p_cycle_start)::DATE
                  + (COALESCE(p_rent_due_day, 1) - 1) * INTERVAL '1 day';
    IF v_due_date < p_cycle_start THEN
      v_due_date := v_due_date + INTERVAL '1 month';
    END IF;
  ELSE
    -- joining_based: PREPAID — rent is due when the cycle starts
    v_due_date := p_cycle_start;
  END IF;

  RETURN v_due_date;
END;
$$;

COMMENT ON FUNCTION public._compute_due_date IS
  'Compute due date for a payment cycle. '
  'monthly_fixed: due on configured rent_due_day. '
  'joining_based: due = cycle_start (prepaid/advance rent).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix generate_payment_cycles (owner-callable RPC)
--    joining_based branch was: due_date = join_date + (N+1) months  ← WRONG
--    now:                      due_date = cycle_start               ← PREPAID
-- ─────────────────────────────────────────────────────────────────────────────
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

  FOR v_resident IN
    SELECT r.id, r.monthly_rent, r.join_date
    FROM public.residents r
    WHERE r.hostel_id = p_hostel_id AND r.status = 'active'
  LOOP
    SELECT COUNT(*) INTO v_cycle_count
    FROM public.payment_cycles
    WHERE resident_id = v_resident.id;

    IF v_hostel.rent_cycle_type = 'joining_based' THEN
      v_new_cycle_start := (v_resident.join_date + (v_cycle_count * INTERVAL '1 month'))::DATE;
      v_new_cycle_end   := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      -- PREPAID: due_date = cycle_start (rent due when period begins)
      v_due_date        := v_new_cycle_start;
    ELSE
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
        v_hostel.rent_due_day
      );
    END IF;

    IF v_new_cycle_start > (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE THEN
      CONTINUE;
    END IF;

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
  'Monthly cron: generates next billing cycle for all active residents. '
  'joining_based: prepaid (due_date = cycle_start). Idempotent.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix generate_all_payment_cycles (pg_cron system function, no auth)
--    Same fix: joining_based due_date = cycle_start
-- ─────────────────────────────────────────────────────────────────────────────
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

    FOR v_resident IN
      SELECT r.id, r.monthly_rent, r.join_date
      FROM public.residents r
      WHERE r.hostel_id = v_hostel.id AND r.status = 'active'
    LOOP
      SELECT COUNT(*) INTO v_cycle_count
      FROM public.payment_cycles
      WHERE resident_id = v_resident.id;

      IF v_hostel.rent_cycle_type = 'joining_based' THEN
        v_new_cycle_start := (v_resident.join_date + (v_cycle_count * INTERVAL '1 month'))::DATE;
        v_new_cycle_end   := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        -- PREPAID: due_date = cycle_start
        v_due_date        := v_new_cycle_start;
      ELSE
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
  'System cron: generates next payment cycle for every active resident. '
  'joining_based: prepaid (due_date = cycle_start). No auth. Idempotent.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DATA MIGRATION: Fix existing joining_based payment_cycles
--    Set due_date = cycle_start for all joining_based hostel cycles
--    ONLY touches joining_based hostels. monthly_fixed cycles untouched.
--    Idempotent: running twice has no additional effect.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.payment_cycles pc
SET due_date = pc.cycle_start,
    updated_at = NOW()
FROM public.hostels h
WHERE pc.hostel_id = h.id
  AND h.rent_cycle_type = 'joining_based'
  AND pc.due_date <> pc.cycle_start;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. AFTER running this migration, manually execute:
--
--    SELECT public.tag_late_cycles();
--
-- This uses Hostelrr's centralized late-payment logic to re-tag statuses
-- correctly after the due_date fix. Do NOT bulk-update statuses directly
-- inside the migration — that duplicates business logic.
-- ─────────────────────────────────────────────────────────────────────────────
