-- Run after both R2 migrations on a local or staging Supabase database.
-- These catalog assertions complement function-level integration tests.
DO $assert_r2_photo_security$
DECLARE
  v_def TEXT;
  v_fn REGPROCEDURE;
  v_table TEXT;
  v_tgname TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_join_request_with_photo_intent(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.abort_join_photo_upload(uuid,text)'::regprocedure,
    'public.abort_resident_photo_upload(uuid,uuid)'::regprocedure,
    'public.finalize_resident_photo_upload(uuid,uuid)'::regprocedure,
    'public.claim_r2_photo_delete_queue(integer)'::regprocedure,
    'public.finish_r2_photo_delete(bigint,uuid,boolean)'::regprocedure,
    'public.cleanup_abandoned_photo_uploads()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'execute')
       OR has_function_privilege('authenticated', v_fn, 'execute')
       OR NOT has_function_privilege('service_role', v_fn, 'execute') THEN
      RAISE EXCEPTION 'Unexpected execute grants on %', v_fn;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_join_request'
  ) THEN
    RAISE EXCEPTION 'Legacy public create_join_request overload remains';
  END IF;
  IF has_table_privilege('anon','public.join_requests','insert')
     OR has_table_privilege('authenticated','public.join_requests','insert') THEN
    RAISE EXCEPTION 'Direct join_requests insert remains exposed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='join_requests' AND cmd='INSERT'
  ) THEN
    RAISE EXCEPTION 'Unexpected join_requests INSERT policy remains';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['residents','join_requests'] LOOP
    v_tgname := CASE WHEN v_table='residents' THEN 'residents_guard_r2_photo_key' ELSE 'join_requests_guard_r2_photo_key' END;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid = format('public.%I', v_table)::regclass
        AND t.tgname = v_tgname AND NOT t.tgisinternal
        AND (t.tgtype & 4) = 4 AND (t.tgtype & 16) = 16
    ) THEN
      RAISE EXCEPTION 'Photo guard must cover INSERT and UPDATE on %', v_table;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef('public.create_join_request_with_photo_intent(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure)
    INTO v_def;
  IF v_def NOT ILIKE '%FOR UPDATE%' OR v_def NOT ILIKE '%consumed_at IS NOT NULL%'
     OR v_def NOT ILIKE '%expires_at <= NOW()%' OR v_def NOT ILIKE '%SET consumed_at=NOW()%'
     OR v_def NOT ILIKE '%final_object_key IS DISTINCT FROM p_photo_path%'
     OR v_def NOT ILIKE '%join_staging_promoted%' THEN
    RAISE EXCEPTION 'Join submission must lock, validate, and consume token atomically';
  END IF;

  SELECT pg_get_functiondef('public.abort_join_photo_upload(uuid,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%consumed_at IS NOT NULL%' OR v_def NOT ILIKE '%enqueue_r2_photo_delete%' THEN
    RAISE EXCEPTION 'Join abort must reject consumed intents and queue object deletion';
  END IF;

  SELECT pg_get_functiondef('public.claim_r2_photo_delete_queue(integer)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%FROM public.residents%' OR v_def NOT ILIKE '%FROM public.join_requests%'
     OR v_def NOT ILIKE '%SKIP LOCKED%' OR v_def NOT ILIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'Queue claim must serialize and check both photo-reference tables';
  END IF;

  SELECT pg_get_functiondef('public.guard_r2_photo_key()'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%pg_advisory_xact_lock%' OR v_def NOT ILIKE '%claimed_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'Photo attachment must serialize against deletion claims';
  END IF;

  SELECT pg_get_functiondef('public.consume_join_photo_rate_limit(text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%ON CONFLICT%' THEN
    RAISE EXCEPTION 'Rate limit increment must serialize concurrent requests';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='resident_photo_uploads' AND column_name='final_object_key')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='join_photo_upload_intents' AND column_name='final_object_key') THEN
    RAISE EXCEPTION 'Staging and final keys must be stored separately';
  END IF;
  SELECT pg_get_functiondef('public.reserve_join_photo_final_key(uuid,text,uuid,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%FOR UPDATE%' OR v_def NOT ILIKE '%consumed_at IS NOT NULL%' OR v_def NOT ILIKE '%final_object_key%' THEN
    RAISE EXCEPTION 'Final key reservation must lock and reject replay';
  END IF;
  SELECT pg_get_functiondef('public.abort_resident_photo_upload(uuid,uuid)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%resident_upload_aborted%' OR v_def NOT ILIKE '%final_object_key%' THEN
    RAISE EXCEPTION 'Resident abort must queue staged and reserved final objects';
  END IF;
  SELECT pg_get_functiondef('public.abort_join_photo_upload(uuid,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%join_upload_aborted%' OR v_def NOT ILIKE '%final_object_key%' THEN
    RAISE EXCEPTION 'Join abort must queue staged and reserved final objects';
  END IF;
  SELECT pg_get_functiondef('public.finalize_resident_photo_upload_staged(uuid,uuid,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%final_object_key IS DISTINCT FROM p_final_object_key%' OR v_def NOT ILIKE '%SET photo_path=p_final_object_key%' OR v_def NOT ILIKE '%enqueue_r2_photo_delete%' THEN
    RAISE EXCEPTION 'Resident finalization must attach final key and queue staging';
  END IF;
  SELECT pg_get_functiondef('public.cleanup_abandoned_photo_uploads()'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%final_object_key%' OR v_def NOT ILIKE '%abandoned_resident_upload%' OR v_def NOT ILIKE '%abandoned_join_upload%' THEN
    RAISE EXCEPTION 'Failed or expired finalization must queue staged and reserved objects';
  END IF;
  SELECT pg_get_functiondef('public.claim_r2_photo_delete_queue(integer)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%u.final_object_key=c.object_key%' OR v_def NOT ILIKE '%INTERVAL ''24 hours''%' THEN
    RAISE EXCEPTION 'Delete claims must preserve active URLs and final key reservations';
  END IF;
END;
$assert_r2_photo_security$;

SELECT 'R2 photo security catalog assertions passed' AS result;
