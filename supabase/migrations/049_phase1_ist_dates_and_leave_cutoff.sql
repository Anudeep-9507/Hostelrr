-- Keep resident onboarding and rent operations on Hostelrr's IST calendar.
-- Do not replay earlier migrations; this migration adjusts only live billing routines.

DO $phase1_date_defaults$
DECLARE
  v_signature text;
  v_oid oid;
  v_definition text;
  v_rewritten text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.add_resident(uuid, uuid, uuid, text, text, integer, date, integer, boolean, integer, text, text, text, text, text, boolean, boolean, date)',
    'public.add_resident_onboarding(uuid, uuid, uuid, text, text, integer, date, integer, boolean, integer, text, text, text, text, text, boolean)',
    'public.confirm_move_in(uuid, date)',
    'public.mark_payment(uuid, integer, public.payment_method, text, date, text)',
    'public.vacate_resident(uuid, date, text)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Expected billing routine not found: %', v_signature;
    END IF;

    v_definition := pg_get_functiondef(v_oid);
    v_rewritten := replace(
      v_definition,
      'CURRENT_DATE',
      '(now() AT TIME ZONE ''Asia/Kolkata'')::date'
    );
    IF v_rewritten = v_definition THEN
      RAISE NOTICE 'No CURRENT_DATE expression in %; defaults may already be explicit', v_signature;
    ELSE
      EXECUTE v_rewritten;
    END IF;
  END LOOP;
END;
$phase1_date_defaults$;

-- Stop scheduling future cycles after the resident's effective scheduled leave date.
DO $phase1_leave_cutoff$
DECLARE
  v_oid oid := 'private.generate_cycles_for_hostel(uuid)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  v_definition := pg_get_functiondef(v_oid);
  v_rewritten := replace(
    v_definition,
    'SELECT r.id, r.monthly_rent, r.join_date',
    'SELECT r.id, r.monthly_rent, r.join_date, r.vacating_date'
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Cycle generator resident query changed; review before applying leave cutoff';
  END IF;

  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'IF v_new_cycle_start > v_horizon THEN',
    'IF v_new_cycle_start > v_horizon'
      || ' OR (v_resident.vacating_date IS NOT NULL'
      || ' AND v_new_cycle_start > v_resident.vacating_date) THEN'
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Cycle generator horizon guard changed; review before applying leave cutoff';
  END IF;
  EXECUTE v_rewritten;
END;
$phase1_leave_cutoff$;

COMMENT ON FUNCTION private.generate_cycles_for_hostel(uuid) IS
  'Generates idempotent IST billing cycles for active residents, respecting scheduled leave dates.';
