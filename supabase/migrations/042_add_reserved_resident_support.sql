-- =============================================================================
-- 042_add_reserved_resident_support.sql
--
-- Update add_resident RPC to support reserved residents.
-- Add confirm_move_in RPC for atomically activating reserved residents.
--
-- CRITICAL CHANGES:
-- 1. add_resident now accepts p_is_reserved parameter
--    - If TRUE: create resident with status='reserved', set bed='reserved', skip cycles
--    - If FALSE: existing behavior (status='active', create cycles)
--
-- 2. confirm_move_in RPC performs atomic transition:
--    - resident.status: reserved → active
--    - resident.confirmed_at = NOW()
--    - bed.status: reserved → occupied
--    - join_date finalized
--    - first payment cycle created in same transaction
--    - If any step fails: ROLLBACK all
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DROP and RECREATE add_resident with p_is_reserved parameter
--    Backward compatible: p_is_reserved defaults to FALSE
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_resident(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, DATE, INTEGER, BOOLEAN,
  INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  p_country             TEXT DEFAULT 'India',
  p_is_reserved         BOOLEAN DEFAULT FALSE
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

  -- For reserved residents, we allow duplicate phones (not enforcing uniqueness until confirmed)
  -- For active residents, enforce phone uniqueness
  IF NOT p_is_reserved THEN
    IF EXISTS (
      SELECT 1 FROM public.residents
      WHERE hostel_id = p_hostel_id AND phone = p_phone AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'An active resident with phone % already exists in this hostel.', p_phone
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  -- ── INSERT RESIDENT ────────────────────────────────────────────────────────
  INSERT INTO public.residents (
    hostel_id, room_id, bed_id, name, phone,
    monthly_rent, join_date, security_deposit, is_deposit_paid,
    stay_duration_days, emergency_contact, aadhar_number,
    area_and_city, state, country,
    status
  )
  VALUES (
    p_hostel_id, p_room_id, p_bed_id, p_name, p_phone,
    p_monthly_rent, p_join_date, p_security_deposit, p_is_deposit_paid,
    p_stay_duration_days, p_emergency_contact, p_aadhar_number,
    NULLIF(TRIM(COALESCE(p_area_and_city, '')), ''), NULLIF(TRIM(COALESCE(p_state, '')), ''),
    COALESCE(p_country, 'India'),
    CASE WHEN p_is_reserved THEN 'reserved'::public.resident_status ELSE 'active'::public.resident_status END
  )
  RETURNING id INTO v_new_resident_id;

  -- ── RESERVED RESIDENT: Skip cycle generation, just log ────────────────────
  IF p_is_reserved THEN
    -- Bed status is set to 'reserved' by trigger _on_resident_inserted
    PERFORM public._log_activity(
      p_hostel_id,
      'bed_reserved',
      'resident',
      v_new_resident_id,
      jsonb_build_object(
        'name', p_name,
        'phone', p_phone,
        'bed_id', p_bed_id,
        'reserved_for_future_occupancy', true
      )
    );
    RETURN v_new_resident_id;
  END IF;

  -- ── ACTIVE RESIDENT: Create first payment cycle ────────────────────────────
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
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := v_cycle_start;

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

COMMENT ON FUNCTION public.add_resident(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, DATE, INTEGER, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) IS
  'Atomically add a resident (active or reserved). '
  'If p_is_reserved=true: status=reserved, no cycles. '
  'If p_is_reserved=false (default): status=active, create first cycle. '
  'joining_based: prepaid (due_date = cycle_start). monthly_fixed: prorated first month.';


-- ---------------------------------------------------------------------------
-- 2. CREATE confirm_move_in RPC — ATOMIC transition reserved → active
--    Must handle payment cycle generation in same transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_move_in(
  p_resident_id         UUID,
  p_confirmed_date      DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident            public.residents%ROWTYPE;
  v_hostel              public.hostels%ROWTYPE;
  v_cycle_start         DATE;
  v_cycle_end           DATE;
  v_due_date            DATE;
  v_cycle_id            UUID;
  v_days_in_month       INTEGER;
  v_days_remaining      INTEGER;
  v_prorated_rent       INTEGER;
BEGIN
  -- ── FETCH RESIDENT ────────────────────────────────────────────────────────
  SELECT * INTO v_resident FROM public.residents
  WHERE id = p_resident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident % not found', p_resident_id USING ERRCODE = 'P0009';
  END IF;

  -- Verify ownership
  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied: you do not own this hostel' USING ERRCODE = '42501';
  END IF;

  -- Verify resident is actually reserved
  IF v_resident.status <> 'reserved' THEN
    RAISE EXCEPTION 'Resident % is not reserved (current status: %)', p_resident_id, v_resident.status
      USING ERRCODE = 'P0016';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.beds
    WHERE id = v_resident.bed_id
      AND status = 'occupied'
  ) THEN
    RAISE EXCEPTION 'Bed % is already occupied', v_resident.bed_id
      USING ERRCODE = 'P0017';
  END IF;

  -- ── FETCH HOSTEL SETTINGS ─────────────────────────────────────────────────
  SELECT * INTO v_hostel FROM public.hostels WHERE id = v_resident.hostel_id;

  -- ── ATOMIC TRANSACTION: Update resident + bed + create cycle ───────────────
  -- Step 1: Update resident status to active + set confirmed_at
  UPDATE public.residents
  SET status = 'active',
      confirmed_at = NOW(),
      join_date = p_confirmed_date,  -- Allow owner to finalize join date at confirmation
      updated_at = NOW()
  WHERE id = p_resident_id;

  -- Step 2: Create first payment cycle (same logic as add_resident)
  v_cycle_start := p_confirmed_date;

  IF v_hostel.rent_cycle_type = 'monthly_fixed' THEN
    v_cycle_start := DATE_TRUNC('month', p_confirmed_date)::DATE;
    v_cycle_end   := (DATE_TRUNC('month', p_confirmed_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    v_days_in_month  := EXTRACT(DAY FROM (DATE_TRUNC('month', p_confirmed_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_days_remaining := v_days_in_month - EXTRACT(DAY FROM p_confirmed_date)::INTEGER + 1;
    v_prorated_rent  := ROUND((v_resident.monthly_rent::NUMERIC / v_days_in_month) * v_days_remaining);

    IF EXTRACT(DAY FROM p_confirmed_date)::INTEGER <= COALESCE(v_hostel.rent_due_day, 1) THEN
      v_prorated_rent := v_resident.monthly_rent;
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
      p_resident_id, v_resident.hostel_id, v_cycle_start, v_cycle_end, v_due_date, v_prorated_rent, 'pending'
    )
    RETURNING id INTO v_cycle_id;
  ELSE
    -- joining_based: cycle is aligned with join_date
    v_cycle_end := (p_confirmed_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := p_confirmed_date;  -- prepaid

    INSERT INTO public.payment_cycles (
      resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
    )
    VALUES (
      p_resident_id, v_resident.hostel_id, v_cycle_start, v_cycle_end, v_due_date, v_resident.monthly_rent, 'pending'
    )
    RETURNING id INTO v_cycle_id;
  END IF;

  -- ── LOG CONFIRMATION ──────────────────────────────────────────────────────
  PERFORM public._log_activity(
    v_resident.hostel_id,
    'resident_confirmed_move_in',
    'resident',
    p_resident_id,
    jsonb_build_object(
      'name', v_resident.name,
      'confirmed_date', p_confirmed_date,
      'bed_id', v_resident.bed_id,
      'first_cycle_id', v_cycle_id
    )
  );

  RETURN p_resident_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_move_in IS
  'Atomically confirm a reserved resident: '
  'status reserved→active, confirmed_at=NOW(), bed reserved→occupied, '
  'create first payment cycle. All-or-nothing transaction.';
