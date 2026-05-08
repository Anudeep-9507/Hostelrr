-- =============================================================================
-- 027_remove_unused_resident_fields.sql
-- Remove email and expected_leave_date columns from residents table
-- These fields were never populated or used in the application
-- =============================================================================

-- Drop the email column (never populated or used)
ALTER TABLE public.residents
  DROP COLUMN IF EXISTS email CASCADE;

-- Drop the expected_leave_date column (never used in business logic)
ALTER TABLE public.residents
  DROP COLUMN IF EXISTS expected_leave_date CASCADE;

-- Update add_resident function to remove the p_email parameter and its usage
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
    v_cycle_end := (p_join_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_due_date  := public._compute_due_date(
      v_cycle_start,
      v_hostel.rent_cycle_type,
      NULL::SMALLINT
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

-- Update get_resident_profile function to remove email and expected_leave_date from return
CREATE OR REPLACE FUNCTION public.get_resident_profile(p_resident_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident          public.residents%ROWTYPE;
  v_room              public.rooms%ROWTYPE;
  v_bed               public.beds%ROWTYPE;
  v_cycles            jsonb;
BEGIN
  IF NOT public.user_owns_hostel((
    SELECT hostel_id FROM public.residents WHERE id = p_resident_id
  )) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_resident
  FROM public.residents
  WHERE id = p_resident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident % not found', p_resident_id USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = v_resident.room_id;
  SELECT * INTO v_bed FROM public.beds WHERE id = v_resident.bed_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',             pc.id,
      'cycle_start',    pc.cycle_start,
      'cycle_end',      pc.cycle_end,
      'due_date',       pc.due_date,
      'total_amount',   pc.total_amount,
      'paid_amount',    pc.paid_amount,
      'status',         pc.status,
      'payments',       COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               p.id,
            'amount',           p.amount,
            'method',           p.method,
            'transaction_ref',  p.transaction_ref,
            'paid_on',          p.paid_on
          )
          ORDER BY p.paid_on DESC
        )
        FROM public.payments p
        WHERE p.cycle_id = pc.id
      ), '[]'::jsonb)
    )
    ORDER BY pc.cycle_start DESC
  ), '[]'::jsonb)
  INTO v_cycles
  FROM public.payment_cycles pc
  WHERE pc.resident_id = p_resident_id;

  RETURN jsonb_build_object(
    'id',                   v_resident.id,
    'name',                 v_resident.name,
    'phone',                v_resident.phone,
    'emergency_contact',    v_resident.emergency_contact,
    'aadhar_number',        v_resident.aadhar_number,
    'join_date',            v_resident.join_date,
    'actual_leave_date',    v_resident.actual_leave_date,
    'monthly_rent',         v_resident.monthly_rent,
    'security_deposit',     v_resident.security_deposit,
    'is_deposit_paid',      v_resident.is_deposit_paid,
    'stay_duration_days',   v_resident.stay_duration_days,
    'status',               v_resident.status,
    'area_and_city',        v_resident.area_and_city,
    'state',                v_resident.state,
    'country',              v_resident.country,
    'room',                 jsonb_build_object('id', v_room.id, 'number', v_room.room_number),
    'bed',                  jsonb_build_object('id', v_bed.id, 'label', v_bed.label),
    'payment_cycles',       COALESCE(v_cycles, '[]'::jsonb)
  );
END;
$$;
