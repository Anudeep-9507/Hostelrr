-- =============================================================================
-- 045_harden_confirm_move_in.sql
--
-- Defensive cleanup for confirm_move_in.
-- - Reject reconfirming non-reserved residents.
-- - Resident status trigger owns bed lifecycle.
-- - Keep all move-in work in one transaction.
-- =============================================================================

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
BEGIN
  SELECT *
  INTO v_resident
  FROM public.residents
  WHERE id = p_resident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident % not found', p_resident_id USING ERRCODE = 'P0009';
  END IF;

  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied: you do not own this hostel' USING ERRCODE = '42501';
  END IF;

  IF v_resident.status <> 'reserved' THEN
    RAISE EXCEPTION 'Resident % is not reserved (current status: %)', p_resident_id, v_resident.status
      USING ERRCODE = 'P0016';
  END IF;

  SELECT * INTO v_hostel
  FROM public.hostels
  WHERE id = v_resident.hostel_id;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE bed_id = v_resident.bed_id
      AND status = 'active'
      AND id <> v_resident.id
  ) THEN
    RAISE EXCEPTION 'Bed % already has active resident', v_resident.bed_id
      USING ERRCODE = 'P0017';
  END IF;

  UPDATE public.residents
  SET status = 'active',
      confirmed_at = NOW(),
      join_date = p_confirmed_date,
      updated_at = NOW()
  WHERE id = p_resident_id;

  v_cycle_start := p_confirmed_date;
  v_cycle_end := (v_cycle_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_due_date := v_cycle_start;

  INSERT INTO public.payment_cycles (
    resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
  ) VALUES (
    p_resident_id, v_resident.hostel_id, v_cycle_start, v_cycle_end, v_due_date, v_resident.monthly_rent, 'pending'
  )
  RETURNING id INTO v_cycle_id;

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
  'Atomically confirm reserved resident: reserved→active, confirmed_at set, bed occupied, first cycle created.';