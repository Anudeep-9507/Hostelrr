-- =============================================================================
-- 035_fix_add_resident_due_date.sql
-- FIX: add_resident joining_based due_date must equal cycle_start (PREPAID)
--
-- Problem:  Migration 034 fixed _compute_due_date, generate_payment_cycles,
--           and generate_all_payment_cycles — but did NOT re-create add_resident
--           with an explicit inline due_date = cycle_start for joining_based.
--
--           add_resident still delegated to _compute_due_date(), which IS fixed,
--           BUT if the old _compute_due_date was cached or if 034 was not fully
--           applied, new residents would get the OLD due_date = cycle_start + 1mo.
--
-- Fix:      Inline the prepaid logic in add_resident's joining_based branch:
--             due_date := cycle_start   (no _compute_due_date call)
--           This matches how generate_payment_cycles and generate_all_payment_cycles
--           were fixed in 034.
--
-- Scope:    1. Re-create add_resident  — joining_based branch inlined
--           2. Data migration          — fix any broken rows from post-034 creates
--
-- Safe:     Idempotent. monthly_fixed untouched. Carry-forward/late/automation intact.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Re-create add_resident with explicit prepaid due_date for joining_based
-- ─────────────────────────────────────────────────────────────────────────────
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
  p_area_and_city       TEXT DEFAULT NULL,
  p_state               TEXT DEFAULT NULL,
  p_country             TEXT DEFAULT 'India'
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
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied: you do not own hostel %', p_hostel_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hostel FROM public.hostels WHERE id = p_hostel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hostel % not found', p_hostel_id USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.beds
    WHERE id = p_bed_id AND room_id = p_room_id AND hostel_id = p_hostel_id
  ) THEN
    RAISE EXCEPTION 'Bed % does not belong to room % in hostel %',
      p_bed_id, p_room_id, p_hostel_id USING ERRCODE = 'P0004';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.residents
    WHERE hostel_id = p_hostel_id AND phone = p_phone AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active resident with phone % already exists in this hostel.', p_phone
      USING ERRCODE = 'P0005';
  END IF;

  INSERT INTO public.residents (
    hostel_id, room_id, bed_id, name, phone,
    monthly_rent, join_date, security_deposit, is_deposit_paid,
    stay_duration_days, emergency_contact, aadhar_number,
    area_and_city, state, country
  )
  VALUES (
    p_hostel_id, p_room_id, p_bed_id, p_name, p_phone,
    p_monthly_rent, p_join_date, p_security_deposit, p_is_deposit_paid,
    p_stay_duration_days, p_emergency_contact, p_aadhar_number,
    NULLIF(TRIM(COALESCE(p_area_and_city, '')), ''), NULLIF(TRIM(COALESCE(p_state, '')), ''),
    COALESCE(p_country, 'India')
  )
  RETURNING id INTO v_new_resident_id;

  v_cycle_start := p_join_date;

  IF v_hostel.rent_cycle_type = 'monthly_fixed' THEN
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
        v_hostel.rent_due_day
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
    -- ═══════════════════════════════════════════════════════════════════════
    -- JOINING_BASED: PREPAID — due_date = cycle_start
    -- Rent is due the day the occupancy period begins.
    -- Explicitly inlined (not delegated to _compute_due_date) to guarantee
    -- correctness regardless of function cache or overload resolution.
    -- ═══════════════════════════════════════════════════════════════════════
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := v_cycle_start;  -- PREPAID: due_date = cycle_start

    INSERT INTO public.payment_cycles (
      resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
    )
    VALUES (
      v_new_resident_id, p_hostel_id, v_cycle_start, v_cycle_end, v_due_date, p_monthly_rent, 'pending'
    )
    RETURNING id INTO v_cycle_id;
  END IF;

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

COMMENT ON FUNCTION public.add_resident IS
  'Atomically add a resident, validate bed, create first payment cycle. '
  'joining_based: prepaid (due_date = cycle_start). monthly_fixed: prorated first month.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DATA MIGRATION: Fix any joining_based rows created after 034
--    where due_date != cycle_start (safety net)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.payment_cycles pc
SET due_date = pc.cycle_start,
    updated_at = NOW()
FROM public.hostels h
WHERE pc.hostel_id = h.id
  AND h.rent_cycle_type = 'joining_based'
  AND pc.due_date <> pc.cycle_start;
