-- Read-only catalog assertions for R2 photo retention and deletion safety.
DO $assert_r2_photo_retention$
DECLARE
  v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'r2_photo_delete_queue'
       AND column_name = 'next_attempt_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'r2_photo_delete_queue'
       AND column_name = 'last_error'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'r2_photo_delete_queue'
       AND column_name = 'not_before'
  ) THEN
    RAISE EXCEPTION 'Queue retry/retention state columns missing';
  END IF;

  SELECT pg_get_functiondef('public.queue_r2_photo_reference_change()'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%INTERVAL ''14 days''%'
     OR v_def NOT ILIKE '%status = ''approved''%'
     OR v_def NOT ILIKE '%join_requests%'
     OR v_def NOT ILIKE '%r2_photo_delete_queue%' THEN
    RAISE EXCEPTION 'Reference trigger must retain join photos and detach accepted duplicate references';
  END IF;

  SELECT pg_get_functiondef('public.claim_r2_photo_delete_queue(integer)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%pg_advisory_xact_lock%'
     OR v_def NOT ILIKE '%FOR UPDATE OF q SKIP LOCKED%'
     OR v_def NOT ILIKE '%resident_photo_uploads%'
     OR v_def NOT ILIKE '%join_photo_upload_intents%'
     OR v_def NOT ILIKE '%not_before%' THEN
    RAISE EXCEPTION 'Queue claim missing lock, intent, or retention protections';
  END IF;

  SELECT pg_get_functiondef('public.finish_r2_photo_delete(bigint,uuid,boolean,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%next_attempt_at%'
     OR v_def NOT ILIKE '%last_error%'
     OR v_def NOT ILIKE '%resident_photo_uploads%'
     OR v_def NOT ILIKE '%join_photo_upload_intents%' THEN
    RAISE EXCEPTION 'Queue completion must retain errors/retry and recheck references';
  END IF;

  SELECT pg_get_functiondef('public.purge_expired_resident_history()'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%INTERVAL ''2 months''%'
     OR v_def NOT ILIKE '%actual_leave_date%'
     OR v_def NOT ILIKE '%payment_cycles%'
     OR v_def NOT ILIKE '%payments%'
     OR v_def NOT ILIKE '%payment_recording_requests%'
     OR v_def NOT ILIKE '%Asia/Kolkata%'
     OR v_def NOT ILIKE '%personal_data_deleted_at%' THEN
    RAISE EXCEPTION 'Resident purge must use IST calendar months, preserve accounting dependencies, and skip redacted rows';
  END IF;

  SELECT pg_get_functiondef('public.reject_join_request(uuid,text)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%DELETE FROM public.join_requests%'
     OR v_def NOT ILIKE '%status <> ''pending''%' THEN
    RAISE EXCEPTION 'Decline must delete only pending request rows';
  END IF;

  SELECT pg_get_functiondef('public.claim_expired_join_photo_cleanup()'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%DELETE FROM public.join_requests%'
     OR v_def NOT ILIKE '%status = ''pending''%'
     OR v_def NOT ILIKE '%created_at%'
     OR v_def ILIKE '%status = ''rejected''%' THEN
    RAISE EXCEPTION 'Fourteen-day cleanup must delete only unanswered requests by original creation time';
  END IF;

  SELECT pg_get_functiondef('public.delete_past_resident(uuid)'::regprocedure) INTO v_def;
  IF v_def NOT ILIKE '%RETURNS text%'
     OR v_def NOT ILIKE '%anonymized%'
     OR v_def NOT ILIKE '%payment_cycles%'
     OR v_def NOT ILIKE '%payment_recording_requests%' THEN
    RAISE EXCEPTION 'Manual history delete must preserve finance dependencies and report anonymization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='residents'
       AND column_name='personal_data_deleted_at'
  ) THEN
    RAISE EXCEPTION 'Resident personal-data deletion marker missing';
  END IF;

  IF has_function_privilege('anon', 'public.authorize_r2_photo_cleanup(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.authorize_r2_photo_cleanup(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Cleanup authorization RPC must not be callable by client roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'r2-photo-cleanup-every-5-minutes'
       AND schedule = '*/5 * * * *' AND active
       AND command ILIKE '%timeout_milliseconds := 120000%'
  ) THEN
    RAISE EXCEPTION 'Five-minute R2 cleanup cron job missing or inactive';
  END IF;
END;
$assert_r2_photo_retention$;

SELECT 'R2 photo retention catalog assertions passed' AS result;
