-- =============================================================================
-- 012_fix_joining_based_due_date.sql
-- Changes joining_based due_date logic:
--   OLD: due_date = cycle_start + grace_period_days   (e.g. Jan 3 + 5d = Jan 8)
--   NEW: due_date = cycle_start + 1 month             (e.g. Jan 3 → Feb 3)
--
-- Late rule: CURRENT_DATE > due_date
--   Joined Jan 3 → due Feb 3
--   Today Feb 3  → NOT late (due today)
--   Today Feb 4  → LATE
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Update _compute_due_date: joining_based now uses cycle_start + 1 month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._compute_due_date(
  p_cycle_start     DATE,
  p_rent_cycle_type rent_cycle_type,
  p_rent_due_day    SMALLINT DEFAULT NULL,
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
    -- If that day is already past relative to cycle_start, push to next month
    IF v_due_date < p_cycle_start THEN
      v_due_date := v_due_date + INTERVAL '1 month';
    END IF;
  ELSE
    -- joining_based: due exactly 1 month after cycle start (same day next month)
    -- e.g. joined Jan 3 → due Feb 3; joined Jan 31 → due Feb 28/29
    v_due_date := (p_cycle_start + INTERVAL '1 month')::DATE;
  END IF;

  RETURN v_due_date;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. Rewrite add_resident: drop the min-due-date floor, use clean logic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_resident(
  p_hostel_id           UUID,
  p_room_id             UUID,
  p_bed_id              UUID,
  p_name                TEXT,
  p_phone               TEXT,
  p_monthly_rent        INTEGER,
  p_join_date           DATE DEFAULT CURRENT_DATE,
  p_security_deposit    INTEGER DEFAULT 0,
  p_is_deposit_paid     BOOLEAN DEFAULT FALSE,
  p_stay_duration_days  INTEGER DEFAULT NULL,
  p_emergency_contact   TEXT DEFAULT NULL,
  p_aadhar_number       TEXT DEFAULT NULL,
  p_email               TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_resident_id     UUID;
  v_hostel              public.hostels%ROWTYPE;
  v_cycle_start         DATE;
  v_cycle_end           DATE;
  v_due_date            DATE;
  v_cycle_id            UUID;
BEGIN
  -- ── AUTHORIZATION CHECK ──────────────────────────────────────────────────
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied: you do not own hostel %', p_hostel_id
      USING ERRCODE = '42501';
  END IF;

  -- ── FETCH HOSTEL CONFIG ───────────────────────────────────────────────────
  SELECT * INTO v_hostel FROM public.hostels WHERE id = p_hostel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hostel % not found', p_hostel_id USING ERRCODE = 'P0003';
  END IF;

  -- ── VALIDATE BED OWNERSHIP ────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.beds
    WHERE id = p_bed_id AND room_id = p_room_id AND hostel_id = p_hostel_id
  ) THEN
    RAISE EXCEPTION 'Bed % does not belong to room % in hostel %',
      p_bed_id, p_room_id, p_hostel_id USING ERRCODE = 'P0004';
  END IF;

  -- ── PHONE UNIQUENESS CHECK (per hostel, active residents only) ────────────
  IF EXISTS (
    SELECT 1 FROM public.residents
    WHERE hostel_id = p_hostel_id AND phone = p_phone AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active resident with phone % already exists in this hostel.', p_phone
      USING ERRCODE = 'P0005';
  END IF;

  -- ── INSERT RESIDENT ───────────────────────────────────────────────────────
  INSERT INTO public.residents (
    hostel_id, room_id, bed_id, name, phone,
    monthly_rent, join_date, security_deposit, is_deposit_paid,
    stay_duration_days, emergency_contact, aadhar_number, email
  )
  VALUES (
    p_hostel_id, p_room_id, p_bed_id, p_name, p_phone,
    p_monthly_rent, p_join_date, p_security_deposit, p_is_deposit_paid,
    p_stay_duration_days, p_emergency_contact, p_aadhar_number, p_email
  )
  RETURNING id INTO v_new_resident_id;

  -- ── CREATE FIRST PAYMENT CYCLE ────────────────────────────────────────────
  v_cycle_start := p_join_date;

  IF v_hostel.rent_cycle_type = 'monthly_fixed' THEN
    -- Cycle covers current calendar month; pro-rate if joining mid-month
    v_cycle_start := DATE_TRUNC('month', p_join_date)::DATE;
    v_cycle_end   := (DATE_TRUNC('month', p_join_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    DECLARE
      v_days_in_month  INTEGER := EXTRACT(DAY FROM (DATE_TRUNC('month', p_join_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
      v_days_remaining INTEGER := v_days_in_month - EXTRACT(DAY FROM p_join_date)::INTEGER + 1;
      v_prorated_rent  INTEGER;
    BEGIN
      v_prorated_rent := ROUND((p_monthly_rent::NUMERIC / v_days_in_month) * v_days_remaining);
      IF EXTRACT(DAY FROM p_join_date)::INTEGER <= COALESCE(v_hostel.rent_due_day, 1) THEN
        v_prorated_rent := p_monthly_rent;
      END IF;

      v_due_date := public._compute_due_date(
        v_cycle_start,
        v_hostel.rent_cycle_type,
        v_hostel.rent_due_day,
        v_hostel.grace_period_days
      );

      INSERT INTO public.payment_cycles (
        resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
      )
      VALUES (
        v_new_resident_id, p_hostel_id, v_cycle_start, v_cycle_end, v_due_date, v_prorated_rent, 'pending'
      )
      RETURNING id INTO v_cycle_id;
    END;

  ELSE
    -- joining_based: cycle starts on join_date, due exactly 1 month later
    -- e.g. joined Jan 3 → cycle Jan 3–Feb 2, due Feb 3
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := public._compute_due_date(
      v_cycle_start,
      v_hostel.rent_cycle_type,
      NULL,
      v_hostel.grace_period_days  -- ignored for joining_based now, kept for signature compat
    );

    INSERT INTO public.payment_cycles (
      resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
    )
    VALUES (
      v_new_resident_id, p_hostel_id, v_cycle_start, v_cycle_end, v_due_date, p_monthly_rent, 'pending'
    )
    RETURNING id INTO v_cycle_id;
  END IF;

  -- ── LOG ACTIVITY ──────────────────────────────────────────────────────────
  PERFORM public._log_activity(
    p_hostel_id,
    'resident_added',
    'resident',
    v_new_resident_id,
    jsonb_build_object('name', p_name, 'phone', p_phone, 'bed_id', p_bed_id, 'first_cycle_id', v_cycle_id)
  );

  RETURN v_new_resident_id;
END;
$$;

COMMENT ON FUNCTION public._compute_due_date IS 'Compute due date for a payment cycle. joining_based: due = cycle_start + 1 month. monthly_fixed: due = fixed day of month + grace.';
COMMENT ON FUNCTION public.add_resident IS 'Atomically add a resident, validate bed availability, and create first payment cycle. joining_based due_date = join_date + 1 month (no grace window).';
