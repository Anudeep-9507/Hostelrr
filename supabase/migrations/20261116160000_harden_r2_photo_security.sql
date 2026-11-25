-- Harden R2 photo upload lifecycle and reference-safe deletion.
-- Apply only after reviewing against the target migration history.

ALTER TABLE public.resident_photo_uploads
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aborted_at TIMESTAMPTZ;
ALTER TABLE public.join_photo_upload_intents
  ADD COLUMN IF NOT EXISTS aborted_at TIMESTAMPTZ;
ALTER TABLE public.r2_photo_delete_queue
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token UUID;
CREATE INDEX IF NOT EXISTS idx_r2_photo_delete_pending
  ON public.r2_photo_delete_queue(created_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_join_photo_intents_consumed
  ON public.join_photo_upload_intents(consumed_at)
  WHERE consumed_at IS NOT NULL;

-- There is no active/accepting flag in the deployed hostels schema. The
-- current public join flow admits every existing hostel; this helper codifies
-- that exact existing rule for both upload intent and final submission.
CREATE OR REPLACE FUNCTION public.hostel_accepts_public_join(p_hostel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.hostels WHERE id = p_hostel_id); $$;
REVOKE ALL ON FUNCTION public.hostel_accepts_public_join(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hostel_accepts_public_join(UUID) TO service_role;

-- Photo keys can only be attached by the service role or by the existing
-- approval transaction. This runs for INSERT as well as UPDATE.
CREATE OR REPLACE FUNCTION public.guard_r2_photo_key()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF NEW.photo_path IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'residents' THEN
    IF NEW.photo_path !~ ('^residents/' || NEW.hostel_id::TEXT || '/' || NEW.id::TEXT || '/[0-9a-f-]+\.(jpg|png|webp)$')
       AND NEW.photo_path !~ ('^join-requests/' || NEW.hostel_id::TEXT || '/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$')
       AND NEW.photo_path !~ ('^join-requests/' || NEW.hostel_id::TEXT || '/photo/[A-Za-z0-9._-]+\.(jpg|png|webp)$') THEN
      RAISE EXCEPTION 'Photo key does not belong to this resident.' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF NEW.photo_path !~ ('^join-requests/' || NEW.hostel_id::TEXT || '/' || NEW.id::TEXT || '/[0-9a-f-]+\.(jpg|png|webp)$')
       AND NEW.photo_path !~ ('^join-requests/' || NEW.hostel_id::TEXT || '/photo/[A-Za-z0-9._-]+\.(jpg|png|webp)$') THEN
      RAISE EXCEPTION 'Photo key does not belong to this join request.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Serialize attachment against the queue worker's reference check/claim.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.photo_path, 0));

  IF EXISTS (
    SELECT 1 FROM public.r2_photo_delete_queue q
    WHERE q.object_key = NEW.photo_path AND (q.claimed_at IS NOT NULL OR q.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Photo key is being deleted or has already been deleted.' USING ERRCODE = '55000';
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' AND current_user <> 'service_role'
     AND current_setting('app.approve_join_request_photo', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Photo key must be changed through the photo service.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_guard_r2_photo_key ON public.residents;
CREATE TRIGGER residents_guard_r2_photo_key
  BEFORE INSERT OR UPDATE OF photo_path ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.guard_r2_photo_key();
DROP TRIGGER IF EXISTS join_requests_guard_r2_photo_key ON public.join_requests;
CREATE TRIGGER join_requests_guard_r2_photo_key
  BEFORE INSERT OR UPDATE OF photo_path ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_r2_photo_key();

-- Any detachment/deletion creates a retryable queue row. Queue processing
-- checks both reference tables and claims keys before contacting R2.
CREATE OR REPLACE FUNCTION public.queue_r2_photo_reference_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old_key TEXT;
BEGIN
  v_old_key := OLD.photo_path;
  IF v_old_key IS NOT NULL AND TG_OP = 'DELETE' THEN
    INSERT INTO public.r2_photo_delete_queue(object_key, reason)
    VALUES (v_old_key, CASE WHEN TG_TABLE_NAME = 'residents' THEN 'resident_reference_removed' ELSE 'join_request_reference_removed' END)
    ON CONFLICT (object_key) DO NOTHING;
  ELSIF v_old_key IS NOT NULL AND NEW.photo_path IS DISTINCT FROM v_old_key THEN
    INSERT INTO public.r2_photo_delete_queue(object_key, reason)
    VALUES (v_old_key, CASE WHEN TG_TABLE_NAME = 'residents' THEN 'resident_reference_removed' ELSE 'join_request_reference_removed' END)
    ON CONFLICT (object_key) DO NOTHING;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_r2_photo_reference_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS residents_queue_old_r2_photo ON public.residents;
CREATE TRIGGER residents_queue_old_r2_photo
  AFTER UPDATE OF photo_path OR DELETE ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.queue_r2_photo_reference_change();
DROP TRIGGER IF EXISTS join_requests_queue_old_r2_photo ON public.join_requests;
CREATE TRIGGER join_requests_queue_old_r2_photo
  AFTER UPDATE OF photo_path OR DELETE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.queue_r2_photo_reference_change();

CREATE OR REPLACE FUNCTION public.enqueue_r2_photo_delete(p_object_key TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_object_key IS NULL OR p_object_key !~ '^(residents|join-requests)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$' THEN
    RAISE EXCEPTION 'Invalid R2 object key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.r2_photo_delete_queue(object_key, reason)
  VALUES (p_object_key, COALESCE(NULLIF(p_reason, ''), 'abandoned_upload'))
  ON CONFLICT (object_key) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_r2_photo_delete(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_r2_photo_delete(TEXT,TEXT) TO service_role;

-- Atomic resident finalize/abort closes the race between finalize, abort, and
-- cleanup. New photo references and replaced-key queueing share one txn.
CREATE OR REPLACE FUNCTION public.finalize_resident_photo_upload(p_upload_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_upload public.resident_photo_uploads%ROWTYPE;
BEGIN
  SELECT * INTO v_upload FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR v_upload.created_by <> p_user_id OR v_upload.consumed_at IS NOT NULL OR v_upload.aborted_at IS NOT NULL OR v_upload.expires_at <= NOW() THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.residents WHERE id=v_upload.resident_id AND hostel_id=v_upload.hostel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE public.residents SET photo_path=v_upload.object_key, updated_at=NOW()
    WHERE id=v_upload.resident_id AND hostel_id=v_upload.hostel_id;
  DELETE FROM public.resident_photo_uploads WHERE id=p_upload_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_resident_photo_upload(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_resident_photo_upload(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.abort_resident_photo_upload(p_upload_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_upload public.resident_photo_uploads%ROWTYPE;
BEGIN
  SELECT * INTO v_upload FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR v_upload.created_by <> p_user_id OR v_upload.consumed_at IS NOT NULL OR v_upload.aborted_at IS NOT NULL THEN RETURN FALSE; END IF;
  UPDATE public.resident_photo_uploads SET aborted_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(v_upload.object_key, 'resident_upload_aborted');
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.abort_resident_photo_upload(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_resident_photo_upload(UUID,UUID) TO service_role;

-- Lock intent, verify one-time token and expiry, create row, consume token in
-- the same transaction. No replay or double-submit can create a second row.
CREATE OR REPLACE FUNCTION public.create_join_request_with_photo_intent(
  p_upload_id UUID, p_token_hash TEXT, p_request_id UUID, p_hostel_id UUID,
  p_name TEXT, p_phone TEXT, p_emergency_contact TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL, p_preferred_room TEXT DEFAULT NULL,
  p_aadhar_number TEXT DEFAULT NULL, p_photo_path TEXT DEFAULT NULL,
  p_area_and_city TEXT DEFAULT NULL, p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'India', p_preferred_sharing TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_intent public.join_photo_upload_intents%ROWTYPE;
BEGIN
  IF NOT public.hostel_accepts_public_join(p_hostel_id) THEN
    RAISE EXCEPTION 'Hostel not found or not accepting join requests.' USING ERRCODE = 'P0003';
  END IF;
  IF p_upload_id IS NOT NULL THEN
    SELECT * INTO v_intent FROM public.join_photo_upload_intents WHERE id=p_upload_id FOR UPDATE;
    IF NOT FOUND OR v_intent.consumed_at IS NOT NULL OR v_intent.aborted_at IS NOT NULL OR v_intent.expires_at <= NOW()
       OR v_intent.token_hash IS DISTINCT FROM p_token_hash
       OR v_intent.hostel_id <> p_hostel_id OR v_intent.request_id <> p_request_id
       OR v_intent.object_key IS DISTINCT FROM p_photo_path THEN
      RAISE EXCEPTION 'Upload intent expired or invalid.' USING ERRCODE = '42501';
    END IF;
  ELSIF p_photo_path IS NOT NULL THEN
    RAISE EXCEPTION 'Photo requires a valid upload intent.' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NOT NULL AND p_photo_path !~ ('^join-requests/' || p_hostel_id::TEXT || '/' || p_request_id::TEXT || '/[0-9a-f-]+\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid join photo key.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.join_requests (
    id, hostel_id, name, phone, emergency_contact, occupation, preferred_room,
    aadhar_number, photo_path, area_and_city, state, country, preferred_sharing
  ) VALUES (
    p_request_id, p_hostel_id, TRIM(p_name), TRIM(p_phone),
    NULLIF(TRIM(COALESCE(p_emergency_contact,'')), ''), NULLIF(TRIM(COALESCE(p_occupation,'')), ''),
    NULLIF(TRIM(COALESCE(p_preferred_room,'')), ''), NULLIF(TRIM(COALESCE(p_aadhar_number,'')), ''),
    p_photo_path, NULLIF(TRIM(COALESCE(p_area_and_city,'')), ''), NULLIF(TRIM(COALESCE(p_state,'')), ''),
    COALESCE(p_country,'India'), NULLIF(TRIM(COALESCE(p_preferred_sharing,'')), '')
  );
  IF p_upload_id IS NOT NULL THEN
    UPDATE public.join_photo_upload_intents SET consumed_at=NOW() WHERE id=p_upload_id;
  END IF;
  PERFORM public._log_activity(p_hostel_id, 'join_request_submitted', 'join_request', p_request_id,
    jsonb_build_object('preferred_sharing', p_preferred_sharing));
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_join_request_with_photo_intent(UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_join_request_with_photo_intent(UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
DROP FUNCTION IF EXISTS public.create_join_request_secure(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

-- Repeat the public-insert lock here as a deployment invariant, including any
-- inherited PUBLIC grant and unexpected legacy overloads.
REVOKE INSERT ON public.join_requests FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS join_requests_insert_public ON public.join_requests;
DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_join_request'
  LOOP
    EXECUTE 'DROP FUNCTION ' || f.signature;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.abort_join_photo_upload(p_upload_id UUID, p_token_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_intent public.join_photo_upload_intents%ROWTYPE;
BEGIN
  SELECT * INTO v_intent FROM public.join_photo_upload_intents WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR v_intent.consumed_at IS NOT NULL OR v_intent.aborted_at IS NOT NULL OR v_intent.expires_at <= NOW()
     OR v_intent.token_hash IS DISTINCT FROM p_token_hash THEN RETURN FALSE; END IF;
  UPDATE public.join_photo_upload_intents SET aborted_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(v_intent.object_key, 'join_upload_aborted');
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.abort_join_photo_upload(UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_join_photo_upload(UUID,TEXT) TO service_role;

-- Safe queue claim: reference checks and claim are atomic. Triggers reject
-- attaching a key after it is claimed; failed R2 operations release the claim.
CREATE OR REPLACE FUNCTION public.claim_r2_photo_delete_queue(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(id BIGINT, object_key TEXT, claim_token UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_candidate RECORD; v_token UUID; v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit,1),1),500);
BEGIN
  FOR v_candidate IN
    SELECT q.id, q.object_key FROM public.r2_photo_delete_queue q
    WHERE q.deleted_at IS NULL
      AND (q.claimed_at IS NULL OR q.claimed_at < NOW()-INTERVAL '30 minutes')
    ORDER BY q.created_at
    LIMIT v_limit
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.object_key, 0));
    IF NOT EXISTS (SELECT 1 FROM public.residents r WHERE r.photo_path=v_candidate.object_key)
       AND NOT EXISTS (SELECT 1 FROM public.join_requests j WHERE j.photo_path=v_candidate.object_key)
       AND NOT EXISTS (SELECT 1 FROM public.resident_photo_uploads u WHERE u.object_key=v_candidate.object_key)
       AND NOT EXISTS (SELECT 1 FROM public.join_photo_upload_intents u WHERE u.object_key=v_candidate.object_key) THEN
      v_token := gen_random_uuid();
      UPDATE public.r2_photo_delete_queue q
        SET claimed_at=NOW(), claim_token=v_token
        WHERE q.id=v_candidate.id AND q.deleted_at IS NULL;
      IF FOUND THEN
        RETURN QUERY SELECT v_candidate.id, v_candidate.object_key, v_token;
      END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_r2_photo_delete(p_queue_id BIGINT, p_claim_token UUID, p_deleted BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_deleted THEN
    UPDATE public.r2_photo_delete_queue SET deleted_at=NOW(), claimed_at=NULL, claim_token=NULL
      WHERE id=p_queue_id AND claim_token=p_claim_token AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.residents r WHERE r.photo_path=r2_photo_delete_queue.object_key)
        AND NOT EXISTS (SELECT 1 FROM public.join_requests j WHERE j.photo_path=r2_photo_delete_queue.object_key);
  ELSE
    UPDATE public.r2_photo_delete_queue SET claimed_at=NULL, claim_token=NULL
      WHERE id=p_queue_id AND claim_token=p_claim_token AND deleted_at IS NULL;
  END IF;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_r2_photo_delete(BIGINT,UUID,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_r2_photo_delete(BIGINT,UUID,BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_photo_uploads()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER := 0; v_deleted INTEGER := 0; v_row RECORD;
BEGIN
  FOR v_row IN SELECT id, object_key FROM public.join_photo_upload_intents
    WHERE consumed_at IS NULL AND expires_at < NOW()-INTERVAL '24 hours'
    ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.join_photo_upload_intents WHERE id=v_row.id;
    PERFORM public.enqueue_r2_photo_delete(v_row.object_key, 'abandoned_join_upload');
    v_count := v_count + 1;
  END LOOP;
  FOR v_row IN SELECT id, object_key FROM public.resident_photo_uploads
    WHERE consumed_at IS NULL AND expires_at < NOW()-INTERVAL '24 hours'
    ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.resident_photo_uploads WHERE id=v_row.id;
    PERFORM public.enqueue_r2_photo_delete(v_row.object_key, 'abandoned_resident_upload');
    v_count := v_count + 1;
  END LOOP;
  DELETE FROM public.join_photo_upload_intents
    WHERE consumed_at IS NOT NULL AND consumed_at < NOW()-INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_count := v_count + v_deleted;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_abandoned_photo_uploads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_photo_uploads() TO service_role;

-- Security-definer RPCs must not inherit PUBLIC execute.
REVOKE ALL ON FUNCTION public.consume_join_photo_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_join_photo_rate_limit(TEXT) TO service_role;
