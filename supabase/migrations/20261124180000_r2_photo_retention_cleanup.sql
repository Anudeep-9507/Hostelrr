-- Complete R2 photo retention, durable deletion retries, and five-minute cleanup.
-- R2 remains private and all deletions flow through the reference-aware queue.

ALTER TABLE public.r2_photo_delete_queue
  ADD COLUMN IF NOT EXISTS not_before TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_r2_photo_delete_ready
  ON public.r2_photo_delete_queue(next_attempt_at, created_at)
  WHERE deleted_at IS NULL;

-- Detach accepted-request duplicate reference when resident photo changes or
-- resident is permanently deleted. A linked key stays while resident remains.
CREATE OR REPLACE FUNCTION public.queue_r2_photo_reference_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_key TEXT;
  v_not_before TIMESTAMPTZ := NOW();
  v_reason TEXT;
BEGIN
  v_old_key := OLD.photo_path;
  IF v_old_key IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.photo_path IS NOT DISTINCT FROM v_old_key THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'residents' THEN
    -- The join row is only a duplicate accepted-applicant reference. Clearing
    -- it in this transaction lets the old key be removed with the resident key.
    PERFORM set_config('app.approve_join_request_photo', 'on', true);
    UPDATE public.join_requests
       SET photo_path = NULL
     WHERE resident_id = OLD.id
       AND status = 'approved'
       AND photo_path = v_old_key;
    v_reason := CASE WHEN TG_OP = 'DELETE'
      THEN 'resident_reference_deleted' ELSE 'resident_reference_replaced' END;
  ELSE
    IF OLD.status = 'rejected' THEN
      v_not_before := COALESCE(OLD.reviewed_at, OLD.created_at) + INTERVAL '14 days';
      v_reason := 'declined_request_photo_retention';
    ELSIF OLD.status = 'pending' THEN
      v_not_before := OLD.created_at + INTERVAL '14 days';
      v_reason := 'unanswered_request_photo_retention';
    ELSE
      v_reason := 'join_request_reference_removed';
    END IF;
  END IF;

  INSERT INTO public.r2_photo_delete_queue(object_key, reason, not_before, next_attempt_at)
  VALUES (v_old_key, v_reason, v_not_before, v_not_before)
  ON CONFLICT (object_key) DO UPDATE
    SET not_before = LEAST(public.r2_photo_delete_queue.not_before, EXCLUDED.not_before),
        next_attempt_at = LEAST(public.r2_photo_delete_queue.next_attempt_at, EXCLUDED.next_attempt_at);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_queue_old_r2_photo ON public.residents;
CREATE TRIGGER residents_queue_old_r2_photo
  AFTER UPDATE OF photo_path OR DELETE ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.queue_r2_photo_reference_change();

DROP TRIGGER IF EXISTS join_requests_queue_old_r2_photo ON public.join_requests;
CREATE TRIGGER join_requests_queue_old_r2_photo
  AFTER UPDATE OF photo_path OR DELETE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.queue_r2_photo_reference_change();

-- Cascaded intent deletion (resident/hostel deletion) must not orphan staging
-- objects. Existing cleanup RPCs remain responsible for ordinary expiry.
CREATE OR REPLACE FUNCTION public.queue_deleted_photo_upload_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_r2_photo_delete(OLD.object_key, 'upload_intent_removed');
  IF OLD.final_object_key IS NOT NULL THEN
    PERFORM public.enqueue_r2_photo_delete(OLD.final_object_key, 'upload_intent_removed');
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_deleted_photo_upload_intent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resident_photo_uploads_queue_deleted_keys ON public.resident_photo_uploads;
CREATE TRIGGER resident_photo_uploads_queue_deleted_keys
  AFTER DELETE ON public.resident_photo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_photo_upload_intent();

DROP TRIGGER IF EXISTS join_photo_upload_intents_queue_deleted_keys ON public.join_photo_upload_intents;
CREATE TRIGGER join_photo_upload_intents_queue_deleted_keys
  AFTER DELETE ON public.join_photo_upload_intents
  FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_photo_upload_intent();

-- Claim each ready row once. Existing advisory locks and reference checks remain
-- authoritative; claim token blocks new photo references while R2 call runs.
CREATE OR REPLACE FUNCTION public.claim_r2_photo_delete_queue(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(id BIGINT, object_key TEXT, claim_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  t UUID;
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
BEGIN
  FOR c IN
    SELECT q.id, q.object_key
      FROM public.r2_photo_delete_queue q
     WHERE q.deleted_at IS NULL
       AND q.not_before <= NOW()
       AND ((q.claimed_at IS NULL AND q.next_attempt_at <= NOW())
         OR q.claimed_at < NOW() - INTERVAL '30 minutes')
     ORDER BY q.next_attempt_at, q.created_at
     LIMIT lim
     FOR UPDATE OF q SKIP LOCKED
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(c.object_key, 0));
    IF NOT EXISTS (SELECT 1 FROM public.residents r WHERE r.photo_path = c.object_key)
       AND NOT EXISTS (SELECT 1 FROM public.join_requests j WHERE j.photo_path = c.object_key)
       AND NOT EXISTS (
         SELECT 1 FROM public.resident_photo_uploads u
          WHERE (u.object_key = c.object_key OR u.final_object_key = c.object_key)
            AND (u.consumed_at IS NULL OR u.expires_at > NOW() - INTERVAL '24 hours')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.join_photo_upload_intents u
          WHERE (u.object_key = c.object_key OR u.final_object_key = c.object_key)
            AND (u.consumed_at IS NULL OR u.expires_at > NOW() - INTERVAL '24 hours')
       ) THEN
      t := gen_random_uuid();
      UPDATE public.r2_photo_delete_queue q
         SET claimed_at = NOW(), claim_token = t,
             attempt_count = q.attempt_count + 1,
             last_attempt_at = NOW()
       WHERE q.id = c.id AND q.deleted_at IS NULL;
      IF FOUND THEN RETURN QUERY SELECT c.id, c.object_key, t; END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) TO service_role;

-- Success only after worker confirms absence. Failures retain error and get
-- capped exponential retry delay; stale claims recover after 30 minutes.
CREATE OR REPLACE FUNCTION public.finish_r2_photo_delete(
  p_queue_id BIGINT, p_claim_token UUID, p_deleted BOOLEAN, p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_deleted THEN
    UPDATE public.r2_photo_delete_queue q
       SET deleted_at = NOW(), claimed_at = NULL, claim_token = NULL,
           last_error = NULL
     WHERE q.id = p_queue_id AND q.claim_token = p_claim_token
       AND q.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.residents r WHERE r.photo_path = q.object_key)
       AND NOT EXISTS (SELECT 1 FROM public.join_requests j WHERE j.photo_path = q.object_key)
       AND NOT EXISTS (
         SELECT 1 FROM public.resident_photo_uploads u
          WHERE (u.object_key = q.object_key OR u.final_object_key = q.object_key)
            AND (u.consumed_at IS NULL OR u.expires_at > NOW() - INTERVAL '24 hours')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.join_photo_upload_intents u
          WHERE (u.object_key = q.object_key OR u.final_object_key = q.object_key)
            AND (u.consumed_at IS NULL OR u.expires_at > NOW() - INTERVAL '24 hours')
       );
  ELSE
    UPDATE public.r2_photo_delete_queue q
       SET claimed_at = NULL, claim_token = NULL,
           next_attempt_at = NOW() + make_interval(mins =>
             LEAST(5 * power(2::NUMERIC, LEAST(q.attempt_count - 1, 7)), 360)::INTEGER),
           last_error = LEFT(COALESCE(NULLIF(p_error, ''), 'R2 deletion failed'), 1000)
     WHERE q.id = p_queue_id AND q.claim_token = p_claim_token
       AND q.deleted_at IS NULL;
  END IF;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_r2_photo_delete(BIGINT, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_r2_photo_delete(BIGINT, UUID, BOOLEAN, TEXT) TO service_role;

-- Keep old RPC signature compatible for any already-deployed worker.
CREATE OR REPLACE FUNCTION public.finish_r2_photo_delete(p_queue_id BIGINT, p_claim_token UUID, p_deleted BOOLEAN)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.finish_r2_photo_delete(p_queue_id, p_claim_token, p_deleted, NULL); $$;
REVOKE ALL ON FUNCTION public.finish_r2_photo_delete(BIGINT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_r2_photo_delete(BIGINT, UUID, BOOLEAN) TO service_role;

-- Preserve rent, payment-cycle, and idempotency history. Resident
-- history with such dependencies remains archived; photo remains referenced.
CREATE OR REPLACE FUNCTION public.purge_expired_resident_history()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.residents r
   WHERE (r.status = 'left' OR r.deleted_at IS NOT NULL)
     AND COALESCE(r.actual_leave_date::TIMESTAMPTZ, r.deleted_at, r.updated_at, r.created_at)
         < NOW() - INTERVAL '2 months'
     AND NOT EXISTS (SELECT 1 FROM public.payment_cycles pc WHERE pc.resident_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.resident_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM public.payment_recording_requests pr WHERE pr.resident_id = r.id);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_resident_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_resident_history() TO service_role;
COMMENT ON FUNCTION public.purge_expired_resident_history() IS
  'Deletes left/archived residents after two calendar months only when no retained payment, cycle, or idempotency record depends on them.';

CREATE OR REPLACE FUNCTION public.delete_past_resident(p_resident_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_resident public.residents%ROWTYPE;
BEGIN
  SELECT * INTO v_resident FROM public.residents WHERE id = p_resident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resident history not found.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501'; END IF;
  IF v_resident.status <> 'left' AND v_resident.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Only departed or archived residents can be deleted.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_cycles WHERE resident_id = p_resident_id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE resident_id = p_resident_id)
     OR EXISTS (SELECT 1 FROM public.payment_recording_requests WHERE resident_id = p_resident_id) THEN
    RAISE EXCEPTION 'Resident history has retained financial records; permanent deletion is blocked.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.residents WHERE id = p_resident_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_past_resident(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_past_resident(UUID) TO authenticated;
COMMENT ON FUNCTION public.delete_past_resident(UUID) IS
  'Permanently deletes eligible archived/departed resident records only when no retained finance or idempotency rows depend on them.';

-- Vault holds a generated cleanup bearer. Neither token nor service-role key is
-- embedded in cron SQL. Edge Function validates this token via service-only RPC.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'r2_photo_cleanup_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'r2_photo_cleanup_token',
      'Bearer token for scheduled resident-photo cleanup'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_r2_photo_cleanup(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_token IS NOT NULL AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
     WHERE name = 'r2_photo_cleanup_token'
       AND decrypted_secret = p_token
  );
$$;
REVOKE ALL ON FUNCTION public.authorize_r2_photo_cleanup(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_r2_photo_cleanup(TEXT) TO service_role;

-- Replace only this named job, making migration reruns idempotent.
DO $$
DECLARE v_job_id BIGINT;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'r2-photo-cleanup-every-5-minutes' LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule(
    'r2-photo-cleanup-every-5-minutes',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://lfgouwvdwxlkirqqlwmt.supabase.co/functions/v1/resident-photo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'r2_photo_cleanup_token' LIMIT 1
          )
        ),
        body := '{"action":"cleanup"}'::jsonb
      );
    $job$
  );
END;
$$;
