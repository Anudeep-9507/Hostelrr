-- =============================================================================
-- 023_hostel_country_drop_grace_period.sql
-- Add country to hostels, drop grace period from hostels, and refresh payment
-- cycle helpers to use fixed monthly rules only.
-- =============================================================================

ALTER TABLE public.hostels
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'India';

ALTER TABLE public.hostels
  DROP COLUMN IF EXISTS address;

ALTER TABLE public.hostels
  DROP COLUMN IF EXISTS grace_period_days;

COMMENT ON COLUMN public.hostels.country IS 'Hostel country. Current UI supports India only.';


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
    v_due_date := DATE_TRUNC('month', p_cycle_start)::DATE
                  + (COALESCE(p_rent_due_day, 1) - 1) * INTERVAL '1 day';
    IF v_due_date < p_cycle_start THEN
      v_due_date := v_due_date + INTERVAL '1 month';
    END IF;
  ELSE
    v_due_date := (p_cycle_start + INTERVAL '1 month')::DATE;
  END IF;

  RETURN v_due_date;
END;
$$;


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
    stay_duration_days, emergency_contact, aadhar_number, email
  )
  VALUES (
    p_hostel_id, p_room_id, p_bed_id, p_name, p_phone,
    p_monthly_rent, p_join_date, p_security_deposit, p_is_deposit_paid,
    p_stay_duration_days, p_emergency_contact, p_aadhar_number, p_email
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
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := public._compute_due_date(
      v_cycle_start,
      v_hostel.rent_cycle_type,
      NULL
    );

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
      v_due_date := (v_resident.join_date + ((v_cycle_count + 1) * INTERVAL '1 month'))::DATE;
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
        v_due_date        := (v_resident.join_date + ((v_cycle_count + 1) * INTERVAL '1 month'))::DATE;
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