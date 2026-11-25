-- Keep date-only billing rules on the Hostelrr business timezone (Asia/Kolkata).
-- Scheduled work runs inside PostgreSQL and privileged RPCs are not public APIs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.generate_cycles_for_hostel(p_hostel_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_hostel public.hostels%ROWTYPE;
  v_resident RECORD;
  v_cycle_count integer;
  v_last_cycle_start date;
  v_new_cycle_start date;
  v_next_cycle_start date;
  v_new_cycle_end date;
  v_due_date date;
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_horizon date := (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)
                      + interval '2 months - 1 day')::date;
  v_created_count integer := 0;
BEGIN
  SELECT * INTO v_hostel
  FROM public.hostels
  WHERE id = p_hostel_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_resident IN
    SELECT r.id, r.monthly_rent, r.join_date
    FROM public.residents r
    WHERE r.hostel_id = p_hostel_id
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  LOOP
    SELECT count(*), max(pc.cycle_start)
      INTO v_cycle_count, v_last_cycle_start
    FROM public.payment_cycles pc
    WHERE pc.resident_id = v_resident.id;

    IF v_hostel.rent_cycle_type = 'joining_based' THEN
      IF v_cycle_count = 0 THEN
        IF date_trunc('month', v_resident.join_date)::date < date_trunc('month', v_today_ist)::date THEN
          -- Historical stays start billing in the current IST month, on their recurring day.
          v_new_cycle_start := public._clamp_day_to_month(
            extract(year from v_today_ist)::integer,
            extract(month from v_today_ist)::integer,
            extract(day from v_resident.join_date)::integer
          );
        ELSE
          v_new_cycle_start := v_resident.join_date;
        END IF;
      ELSE
        -- Anchor each recurrence to the previous actual start. If a month clamps
        -- Jan 31 to Feb 28, the 28th remains the recurring day from then on.
        v_next_cycle_start := date_trunc('month', v_last_cycle_start) + interval '1 month';
        v_new_cycle_start := public._clamp_day_to_month(
          extract(year from v_next_cycle_start)::integer,
          extract(month from v_next_cycle_start)::integer,
          extract(day from v_last_cycle_start)::integer
        );
      END IF;

      v_next_cycle_start := date_trunc('month', v_new_cycle_start) + interval '1 month';
      v_next_cycle_start := public._clamp_day_to_month(
        extract(year from v_next_cycle_start)::integer,
        extract(month from v_next_cycle_start)::integer,
        extract(day from v_new_cycle_start)::integer
      );
      v_new_cycle_end := v_next_cycle_start - 1;
      v_due_date := v_new_cycle_start;
    ELSE
      IF v_cycle_count = 0 THEN
        v_new_cycle_start := date_trunc('month', v_today_ist)::date;
      ELSE
        v_new_cycle_start := (date_trunc('month', v_last_cycle_start) + interval '1 month')::date;
      END IF;

      v_new_cycle_end := (date_trunc('month', v_new_cycle_start)
                           + interval '1 month - 1 day')::date;
      v_due_date := public._compute_due_date(
        v_new_cycle_start,
        v_hostel.rent_cycle_type,
        v_hostel.rent_due_day
      );
    END IF;

    IF v_new_cycle_start > v_horizon THEN
      CONTINUE;
    END IF;

    INSERT INTO public.payment_cycles (
      resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
    ) VALUES (
      v_resident.id, p_hostel_id, v_new_cycle_start, v_new_cycle_end,
      v_due_date, v_resident.monthly_rent, 'pending'
    )
    ON CONFLICT (resident_id, cycle_start) DO NOTHING;

    IF FOUND THEN
      v_created_count := v_created_count + 1;
    END IF;
  END LOOP;

  RETURN v_created_count;
END;
$function$;

REVOKE ALL ON FUNCTION private.generate_cycles_for_hostel(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_payment_cycles(p_hostel_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  RETURN private.generate_cycles_for_hostel(p_hostel_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_all_payment_cycles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_hostel_id uuid;
  v_total_created integer := 0;
BEGIN
  FOR v_hostel_id IN SELECT id FROM public.hostels LOOP
    v_total_created := v_total_created
      + private.generate_cycles_for_hostel(v_hostel_id);
  END LOOP;
  RETURN v_total_created;
END;
$function$;

CREATE OR REPLACE FUNCTION public._refresh_cycle_status(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_paid integer;
  v_total integer;
  v_due_date date;
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT paid_amount, total_amount, due_date
    INTO v_paid, v_total, v_due_date
  FROM public.payment_cycles
  WHERE id = p_cycle_id;

  UPDATE public.payment_cycles
  SET status = CASE
    WHEN v_paid >= v_total THEN 'paid'::public.payment_status
    WHEN v_due_date < v_today_ist THEN 'late'::public.payment_status
    WHEN v_paid > 0 THEN 'partial'::public.payment_status
    ELSE 'pending'::public.payment_status
  END,
  updated_at = now()
  WHERE id = p_cycle_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_late_cycles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_updated_count integer;
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  UPDATE public.payment_cycles
  SET status = CASE
        WHEN paid_amount >= total_amount THEN 'paid'::public.payment_status
        ELSE 'late'::public.payment_status
      END,
      updated_at = now()
  WHERE due_date < v_today_ist
    AND status IN ('pending', 'partial', 'late', 'overdue');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$function$;

-- Do not expose system-wide billing jobs or privileged bed/log helpers through PostgREST.
DO $function_grants$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function.signature
    );
  END LOOP;
END;
$function_grants$;

-- Explicitly expose only owner-checked application RPCs and the two public join flows.
GRANT EXECUTE ON FUNCTION public.user_owns_hostel(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_object_hostel_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hostel(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_join_request(uuid, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_join_request(uuid, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_resident(uuid, uuid, uuid, text, text, integer, date, integer, boolean, integer, text, text, text, text, text, boolean, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_resident_onboarding(uuid, uuid, uuid, text, text, integer, date, integer, boolean, integer, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid, uuid, uuid, integer, date, integer, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_resident(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_move_in(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_join_requests(uuid, public.join_request_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resident_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment(uuid, integer, public.payment_method, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_bed(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_join_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_resident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vacate_resident(uuid, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_payment_cycles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payment_cycles(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_all_payment_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_all_payment_cycles() TO service_role;
REVOKE ALL ON FUNCTION public.tag_late_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_late_cycles() TO service_role;
REVOKE ALL ON FUNCTION public._occupy_bed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._vacate_bed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._log_activity(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_payment(uuid, uuid, uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._refresh_cycle_status(uuid) FROM PUBLIC, anon, authenticated;

-- Financial writes go through the atomic, owner-checked mark_payment RPC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_cycles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;

-- Dashboard collection month follows IST even though the database timezone is UTC.
DO $dashboard_ist$
DECLARE
  v_definition text;
  v_old text := 'DATE_TRUNC(''month'', CURRENT_DATE)::DATE';
  v_new text := 'DATE_TRUNC(''month'', (now() AT TIME ZONE ''Asia/Kolkata'')::date)::DATE';
BEGIN
  v_definition := pg_get_functiondef('public.get_dashboard_stats(uuid)'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'get_dashboard_stats date expression changed; update this migration after reviewing its definition';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'status IN (''pending'', ''late'', ''partial'')';
  v_new := 'status IN (''pending'', ''late'', ''partial'', ''overdue'')';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'get_dashboard_stats status set changed; update this migration after reviewing its definition';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$dashboard_ist$;

-- Enforce cycle/resident/hostel identity at the database boundary, even for direct REST writes.
CREATE UNIQUE INDEX IF NOT EXISTS residents_id_hostel_id_key
  ON public.residents (id, hostel_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_cycles_id_resident_hostel_key
  ON public.payment_cycles (id, resident_id, hostel_id);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_cycles_resident_hostel_consistency_fkey'
      AND conrelid = 'public.payment_cycles'::regclass
  ) THEN
    ALTER TABLE public.payment_cycles
      ADD CONSTRAINT payment_cycles_resident_hostel_consistency_fkey
      FOREIGN KEY (resident_id, hostel_id)
      REFERENCES public.residents (id, hostel_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_cycle_resident_hostel_consistency_fkey'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_cycle_resident_hostel_consistency_fkey
      FOREIGN KEY (cycle_id, resident_id, hostel_id)
      REFERENCES public.payment_cycles (id, resident_id, hostel_id);
  END IF;
END;
$constraints$;

-- Run protected billing functions inside PostgreSQL at IST midnight. pg_cron uses
-- UTC here: 18:30 UTC = 00:00 IST, and late tagging follows at 00:02 IST.
SELECT cron.alter_job(
  job_id := 5,
  schedule := '30 18 * * *',
  command := 'SELECT public.generate_all_payment_cycles();'
);

SELECT cron.alter_job(
  job_id := 6,
  schedule := '32 18 * * *',
  command := 'SELECT public.tag_late_cycles();'
);

-- Reconcile all overdue states once, including balances from departed residents.
SELECT public.tag_late_cycles();
