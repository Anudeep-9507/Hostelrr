-- Read-only database assertions for the deployed subscription MVP.
-- Run against a test or production project with a database owner connection.
DO $assert_subscription_invariants$
DECLARE
  v_table text;
  v_proc regprocedure;
  v_definition text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.hostels h
    LEFT JOIN public.hostel_subscriptions s ON s.hostel_id = h.id
    WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every hostel must have a subscription row';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hostel_subscriptions
    WHERE abs(extract(epoch FROM (trial_ends_at - trial_started_at)) - 1209600) > 0.001
  ) THEN
    RAISE EXCEPTION 'Every initial trial must last exactly 14 days';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'subscription_plans', 'hostel_subscriptions', 'subscription_payment_submissions',
    'subscription_platform_settings', 'subscription_admin_audit'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', v_table;
    END IF;
    IF has_table_privilege('anon', format('public.%I', v_table), 'select')
      OR has_table_privilege('authenticated', format('public.%I', v_table), 'select')
      OR has_table_privilege('authenticated', format('public.%I', v_table), 'insert') THEN
      RAISE EXCEPTION 'Unexpected direct table privilege on public.%', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.admin_list_subscription_payments()', 'execute') THEN
    RAISE EXCEPTION 'Anonymous users must not execute subscription admin RPCs';
  END IF;
  IF public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthenticated database context must not be a platform admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_logs'
  ) THEN
    RAISE EXCEPTION 'Activity notifications are not present in Supabase Realtime';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_logs'
      AND cmd = 'SELECT'
      AND qual ILIKE '%user_owns_hostel%'
  ) THEN
    RAISE EXCEPTION 'Activity Realtime lacks a hostel-scoped SELECT policy';
  END IF;

  IF (
    SELECT count(DISTINCT tablename)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'hostels', 'floors', 'rooms', 'beds', 'residents', 'bed_layout_templates',
        'join_requests', 'onboarding', 'activity_logs'
      ])
      AND ((coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%user_can_write_hostel%'
        OR (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%hostel_subscription_can_write%')
  ) <> 9 THEN
    RAISE EXCEPTION 'Subscription write gate is missing from one or more owner write tables';
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'public.add_resident(uuid,uuid,uuid,text,text,integer,date,integer,boolean,integer,text,text,text,text,text,boolean,boolean,date)'::regprocedure,
    'public.approve_join_request(uuid,uuid,uuid,integer,date,integer,boolean,integer,text)'::regprocedure,
    'public.archive_resident(uuid,text)'::regprocedure,
    'public.confirm_move_in(uuid,date)'::regprocedure,
    'public.generate_payment_cycles(uuid)'::regprocedure,
    'public.move_bed(uuid,uuid,uuid)'::regprocedure,
    'public.record_resident_payment(uuid,uuid,integer,public.payment_method,date,text)'::regprocedure,
    'public.reject_join_request(uuid,text)'::regprocedure,
    'public.restore_resident(uuid)'::regprocedure,
    'public.vacate_resident(uuid,date,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_proc) INTO v_definition;
    IF v_definition NOT ILIKE '%user_can_write_hostel%' THEN
      RAISE EXCEPTION 'Subscription gate missing from %', v_proc;
    END IF;
  END LOOP;
END;
$assert_subscription_invariants$;

SELECT 'Subscription invariants passed' AS result;
