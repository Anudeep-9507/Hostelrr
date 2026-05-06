-- =============================================================================
-- 006_rpc.sql
-- Public RPC Functions for Hostelrr
-- These are called directly from the Supabase JS client:
--   supabase.rpc('function_name', { param: value })
--
-- All functions are SECURITY DEFINER so they execute with elevated privileges
-- but still validate the caller owns the data being operated on.
-- Depends on: 005_functions.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- RPC 1: add_resident
--
-- Atomically:
--   1. Validates bed belongs to the given hostel and is vacant/reserved
--   2. Inserts the resident row (triggers bed status update + bed guard)
--   3. Generates the first payment cycle
--   4. Logs the activity
--
-- Returns: The newly created resident's UUID
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
  -- The _guard_bed_availability trigger fires here and prevents double-occupancy.
  -- The _on_resident_inserted trigger fires here and updates bed status.
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
    -- Cycle covers current calendar month
    v_cycle_start := DATE_TRUNC('month', p_join_date)::DATE;
    v_cycle_end   := (DATE_TRUNC('month', p_join_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Pro-rate first month if joining mid-month
    DECLARE
      v_days_in_month INTEGER := EXTRACT(DAY FROM (DATE_TRUNC('month', p_join_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
      v_days_remaining INTEGER := v_days_in_month - EXTRACT(DAY FROM p_join_date)::INTEGER + 1;
      v_prorated_rent INTEGER;
    BEGIN
      v_prorated_rent := ROUND((p_monthly_rent::NUMERIC / v_days_in_month) * v_days_remaining);
      -- Use full month rent if joining on or before the due day
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
    -- joining_based: month 1 starts on join date
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := public._compute_due_date(
      v_cycle_start,
      v_hostel.rent_cycle_type,
      NULL,
      v_hostel.grace_period_days
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

COMMENT ON FUNCTION public.add_resident IS 'Atomically add a resident, validate bed availability, and create first payment cycle.';


-- ---------------------------------------------------------------------------
-- RPC 2: mark_payment
--
-- Atomically:
--   1. Validates cycle belongs to caller's hostel
--   2. Handles overpayment (caps at total_amount)
--   3. Inserts payment row (trigger updates cycle paid_amount + status)
--   4. Logs the activity
--
-- Returns: The new payment UUID
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payment(
  p_cycle_id        UUID,
  p_amount          INTEGER,
  p_method          payment_method,
  p_transaction_ref TEXT DEFAULT NULL,
  p_paid_on         DATE DEFAULT CURRENT_DATE,
  p_notes           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle           public.payment_cycles%ROWTYPE;
  v_new_payment_id  UUID;
  v_effective_amount INTEGER;
  v_max_payable     INTEGER;
BEGIN
  -- ── FETCH AND LOCK CYCLE ──────────────────────────────────────────────────
  SELECT * INTO v_cycle FROM public.payment_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment cycle % not found', p_cycle_id USING ERRCODE = 'P0006';
  END IF;

  -- ── AUTHORIZATION CHECK ──────────────────────────────────────────────────
  IF NOT public.user_owns_hostel(v_cycle.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  -- ── VALIDATE AMOUNT ───────────────────────────────────────────────────────
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive.' USING ERRCODE = 'P0007';
  END IF;

  -- ── CAP OVERPAYMENTS ─────────────────────────────────────────────────────
  -- We allow paying up to total_amount. Excess is treated as advance (future: credit wallet)
  v_max_payable := v_cycle.total_amount - v_cycle.paid_amount;
  v_effective_amount := LEAST(p_amount, v_max_payable + 1000); -- allow up to ₹1000 excess for rounding

  IF v_effective_amount <= 0 THEN
    RAISE EXCEPTION 'This cycle is already fully paid.' USING ERRCODE = 'P0008';
  END IF;

  -- ── INSERT PAYMENT ────────────────────────────────────────────────────────
  -- The _on_payment_inserted trigger fires here and updates paid_amount + status on the cycle
  INSERT INTO public.payments (
    cycle_id, resident_id, hostel_id, amount, method, transaction_ref, paid_on, recorded_by, notes
  )
  VALUES (
    p_cycle_id, v_cycle.resident_id, v_cycle.hostel_id,
    v_effective_amount, p_method, p_transaction_ref, p_paid_on, auth.uid(), p_notes
  )
  RETURNING id INTO v_new_payment_id;

  -- ── LOG ACTIVITY ──────────────────────────────────────────────────────────
  PERFORM public._log_activity(
    v_cycle.hostel_id,
    'payment_recorded',
    'payment',
    v_new_payment_id,
    jsonb_build_object(
      'cycle_id', p_cycle_id,
      'resident_id', v_cycle.resident_id,
      'amount', v_effective_amount,
      'method', p_method
    )
  );

  RETURN v_new_payment_id;
END;
$$;

COMMENT ON FUNCTION public.mark_payment IS 'Record a payment against a billing cycle, auto-updating cycle status.';


-- ---------------------------------------------------------------------------
-- RPC 3: move_bed
--
-- Atomically:
--   1. Validates both beds belong to the same hostel (owned by caller)
--   2. Validates target bed is vacant
--   3. Frees the old bed
--   4. Occupies the new bed
--   5. Updates resident's room_id and bed_id
--   6. Logs activity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_bed(
  p_resident_id   UUID,
  p_new_bed_id    UUID,
  p_new_room_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident    public.residents%ROWTYPE;
  v_new_bed     public.beds%ROWTYPE;
BEGIN
  -- ── LOCK AND FETCH RESIDENT ───────────────────────────────────────────────
  SELECT * INTO v_resident FROM public.residents WHERE id = p_resident_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active resident % not found.', p_resident_id USING ERRCODE = 'P0009';
  END IF;

  -- ── AUTHORIZATION CHECK ──────────────────────────────────────────────────
  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  -- ── VALIDATE NEW BED ──────────────────────────────────────────────────────
  SELECT * INTO v_new_bed FROM public.beds WHERE id = p_new_bed_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed % not found.', p_new_bed_id USING ERRCODE = 'P0010';
  END IF;

  IF v_new_bed.hostel_id <> v_resident.hostel_id THEN
    RAISE EXCEPTION 'Target bed belongs to a different hostel.' USING ERRCODE = 'P0011';
  END IF;

  IF v_new_bed.room_id <> p_new_room_id THEN
    RAISE EXCEPTION 'Bed % does not belong to room %.', p_new_bed_id, p_new_room_id USING ERRCODE = 'P0012';
  END IF;

  IF v_new_bed.status = 'occupied' THEN
    RAISE EXCEPTION 'Target bed % is already occupied.', p_new_bed_id USING ERRCODE = 'P0001';
  END IF;

  IF p_new_bed_id = v_resident.bed_id THEN
    RAISE EXCEPTION 'Resident is already in bed %.', p_new_bed_id USING ERRCODE = 'P0013';
  END IF;

  -- ── FREE OLD BED ──────────────────────────────────────────────────────────
  UPDATE public.beds
  SET status = 'vacant'
  WHERE id = v_resident.bed_id;

  -- ── OCCUPY NEW BED ────────────────────────────────────────────────────────
  UPDATE public.beds
  SET status = 'occupied'
  WHERE id = p_new_bed_id;

  -- ── UPDATE RESIDENT ───────────────────────────────────────────────────────
  UPDATE public.residents
  SET bed_id = p_new_bed_id,
      room_id = p_new_room_id,
      updated_at = NOW()
  WHERE id = p_resident_id;

  -- ── LOG ACTIVITY ──────────────────────────────────────────────────────────
  PERFORM public._log_activity(
    v_resident.hostel_id,
    'resident_moved_bed',
    'resident',
    p_resident_id,
    jsonb_build_object(
      'old_bed_id', v_resident.bed_id,
      'old_room_id', v_resident.room_id,
      'new_bed_id', p_new_bed_id,
      'new_room_id', p_new_room_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.move_bed IS 'Atomically move a resident to a different bed, maintaining full data consistency.';


-- ---------------------------------------------------------------------------
-- RPC 4: vacate_resident
--
-- Marks a resident as 'left', records their leave date,
-- frees their bed, and logs the action.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vacate_resident(
  p_resident_id     UUID,
  p_leave_date      DATE DEFAULT CURRENT_DATE,
  p_notes           TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%ROWTYPE;
BEGIN
  SELECT * INTO v_resident FROM public.residents WHERE id = p_resident_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active resident % not found.', p_resident_id USING ERRCODE = 'P0009';
  END IF;

  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  -- Update resident — the _on_resident_status_changed trigger frees the bed
  UPDATE public.residents
  SET status = 'left',
      actual_leave_date = p_leave_date,
      updated_at = NOW()
  WHERE id = p_resident_id;

  PERFORM public._log_activity(
    v_resident.hostel_id,
    'resident_vacated',
    'resident',
    p_resident_id,
    jsonb_build_object('leave_date', p_leave_date, 'notes', p_notes)
  );
END;
$$;

COMMENT ON FUNCTION public.vacate_resident IS 'Mark a resident as left, freeing their bed automatically.';


-- ---------------------------------------------------------------------------
-- RPC 5: get_dashboard_stats
--
-- Returns a single JSON object with key metrics for the hostel dashboard.
-- Callable from Supabase JS as: supabase.rpc('get_dashboard_stats', { p_hostel_id: '...' })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_hostel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_beds        INTEGER;
  v_occupied_beds     INTEGER;
  v_vacant_beds       INTEGER;
  v_reserved_beds     INTEGER;
  v_pending_amount    BIGINT;
  v_collected_month   BIGINT;
  v_active_residents  INTEGER;
  v_late_cycles       INTEGER;
  v_month_start       DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  -- Bed counts
  SELECT
    COUNT(*)                                              INTO v_total_beds
  FROM public.beds WHERE hostel_id = p_hostel_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'occupied')          INTO v_occupied_beds
  FROM public.beds WHERE hostel_id = p_hostel_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'vacant')            INTO v_vacant_beds
  FROM public.beds WHERE hostel_id = p_hostel_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'reserved')          INTO v_reserved_beds
  FROM public.beds WHERE hostel_id = p_hostel_id;

  -- Active resident count
  SELECT COUNT(*) INTO v_active_residents
  FROM public.residents WHERE hostel_id = p_hostel_id AND status = 'active';

  -- Total outstanding (pending + late + partial cycles)
  SELECT COALESCE(SUM(total_amount - paid_amount), 0) INTO v_pending_amount
  FROM public.payment_cycles
  WHERE hostel_id = p_hostel_id
    AND status IN ('pending', 'late', 'partial');

  -- Total collected this calendar month
  SELECT COALESCE(SUM(amount), 0) INTO v_collected_month
  FROM public.payments
  WHERE hostel_id = p_hostel_id
    AND paid_on >= v_month_start
    AND paid_on < v_month_start + INTERVAL '1 month';

  -- Count of late cycles
  SELECT COUNT(*) INTO v_late_cycles
  FROM public.payment_cycles
  WHERE hostel_id = p_hostel_id AND status = 'late';

  RETURN jsonb_build_object(
    'total_beds',         v_total_beds,
    'occupied_beds',      v_occupied_beds,
    'vacant_beds',        v_vacant_beds,
    'reserved_beds',      v_reserved_beds,
    'occupancy_rate',     CASE WHEN v_total_beds > 0
                            THEN ROUND((v_occupied_beds::NUMERIC / v_total_beds) * 100, 1)
                            ELSE 0 END,
    'active_residents',   v_active_residents,
    'pending_amount',     v_pending_amount,
    'collected_this_month', v_collected_month,
    'late_cycles',        v_late_cycles
  );
END;
$$;

COMMENT ON FUNCTION public.get_dashboard_stats IS 'Returns aggregate occupancy and financial metrics for the hostel dashboard.';


-- ---------------------------------------------------------------------------
-- RPC 6: get_resident_profile
--
-- Returns full resident profile with their complete payment cycle history
-- and individual payment transactions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_profile(p_resident_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident    public.residents%ROWTYPE;
  v_room        public.rooms%ROWTYPE;
  v_bed         public.beds%ROWTYPE;
  v_cycles      JSONB;
BEGIN
  SELECT * INTO v_resident FROM public.residents WHERE id = p_resident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident % not found.', p_resident_id USING ERRCODE = 'P0009';
  END IF;

  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = v_resident.room_id;
  SELECT * INTO v_bed  FROM public.beds  WHERE id = v_resident.bed_id;

  -- Aggregate payment cycles with their payments as nested JSON
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           pc.id,
      'cycle_start',  pc.cycle_start,
      'cycle_end',    pc.cycle_end,
      'due_date',     pc.due_date,
      'total_amount', pc.total_amount,
      'paid_amount',  pc.paid_amount,
      'status',       pc.status,
      'notes',        pc.notes,
      'payments', (
        SELECT jsonb_agg(jsonb_build_object(
          'id',              p.id,
          'amount',          p.amount,
          'method',          p.method,
          'transaction_ref', p.transaction_ref,
          'paid_on',         p.paid_on,
          'notes',           p.notes
        ) ORDER BY p.paid_on DESC)
        FROM public.payments p WHERE p.cycle_id = pc.id
      )
    )
    ORDER BY pc.cycle_start DESC
  )
  INTO v_cycles
  FROM public.payment_cycles pc
  WHERE pc.resident_id = p_resident_id;

  RETURN jsonb_build_object(
    'id',                   v_resident.id,
    'name',                 v_resident.name,
    'phone',                v_resident.phone,
    'emergency_contact',    v_resident.emergency_contact,
    'aadhar_number',        v_resident.aadhar_number,
    'email',                v_resident.email,
    'join_date',            v_resident.join_date,
    'expected_leave_date',  v_resident.expected_leave_date,
    'actual_leave_date',    v_resident.actual_leave_date,
    'monthly_rent',         v_resident.monthly_rent,
    'security_deposit',     v_resident.security_deposit,
    'is_deposit_paid',      v_resident.is_deposit_paid,
    'stay_duration_days',   v_resident.stay_duration_days,
    'status',               v_resident.status,
    'room',                 jsonb_build_object('id', v_room.id, 'number', v_room.room_number),
    'bed',                  jsonb_build_object('id', v_bed.id, 'label', v_bed.label),
    'payment_cycles',       COALESCE(v_cycles, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_resident_profile IS 'Returns complete resident profile with nested payment cycle and payment history.';


-- ---------------------------------------------------------------------------
-- RPC 7: generate_payment_cycles
--
-- Generates the next billing cycle for all active residents in a hostel.
-- Safe to call multiple times — the UNIQUE index on (resident_id, cycle_start)
-- prevents duplicate cycles from being created.
--
-- Intended to be called as a monthly cron job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payment_cycles(p_hostel_id UUID)
RETURNS INTEGER  -- returns number of cycles created
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostel          public.hostels%ROWTYPE;
  v_resident        RECORD;
  v_new_cycle_start DATE;
  v_new_cycle_end   DATE;
  v_due_date        DATE;
  v_created_count   INTEGER := 0;
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
    -- Determine start of the NEXT cycle (one after the most recent)
    SELECT
      (MAX(cycle_end) + INTERVAL '1 day')::DATE INTO v_new_cycle_start
    FROM public.payment_cycles
    WHERE resident_id = v_resident.id;

    -- Default if no cycles exist yet (shouldn't happen — add_resident creates one)
    IF v_new_cycle_start IS NULL THEN
      v_new_cycle_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    END IF;

    -- Only generate if the new cycle starts this month or earlier
    IF v_new_cycle_start > DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')::DATE THEN
      CONTINUE;
    END IF;

    IF v_hostel.rent_cycle_type = 'monthly_fixed' THEN
      v_new_cycle_end := (DATE_TRUNC('month', v_new_cycle_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSE
      v_new_cycle_end := (v_new_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;

    v_due_date := public._compute_due_date(
      v_new_cycle_start,
      v_hostel.rent_cycle_type,
      v_hostel.rent_due_day,
      v_hostel.grace_period_days
    );

    -- ON CONFLICT DO NOTHING prevents duplicate cycles
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

COMMENT ON FUNCTION public.generate_payment_cycles IS 'Monthly cron: generates next billing cycle for all active residents. Idempotent.';


-- ---------------------------------------------------------------------------
-- RPC 8: tag_late_cycles
--
-- Scans all unpaid / partial cycles past their due date and marks them 'late'.
-- Intended to run as a daily cron job via Supabase Edge Functions or pg_cron.
-- Returns count of cycles updated.
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
  SET status = 'late', updated_at = NOW()
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.tag_late_cycles IS 'Daily cron: marks all past-due unpaid/partial cycles as late. No auth required (system function).';
