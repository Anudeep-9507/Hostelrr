-- Browser PUT URLs target staging only. The service reserves and promotes an
-- immutable final key after byte validation; intents retain both keys for cleanup.
ALTER TABLE public.resident_photo_uploads ADD COLUMN final_object_key TEXT UNIQUE;
ALTER TABLE public.join_photo_upload_intents ADD COLUMN final_object_key TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.enqueue_r2_photo_delete(p_object_key TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_object_key IS NULL OR p_object_key !~ '^(staging/)?(residents|join-requests)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$' THEN
    RAISE EXCEPTION 'Invalid R2 object key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.r2_photo_delete_queue(object_key, reason)
  VALUES (p_object_key, COALESCE(NULLIF(p_reason, ''), 'abandoned_upload'))
  ON CONFLICT (object_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_resident_photo_final_key(p_upload_id UUID, p_user_id UUID, p_final_object_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.resident_photo_uploads%ROWTYPE; k TEXT;
BEGIN
  SELECT * INTO u FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.created_by<>p_user_id OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW() THEN RETURN NULL; END IF;
  IF p_final_object_key !~ ('^residents/'||u.hostel_id::TEXT||'/'||u.resident_id::TEXT||'/[0-9a-f-]+\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'Invalid final photo key'; END IF;
  IF u.final_object_key IS NULL THEN UPDATE public.resident_photo_uploads SET final_object_key=p_final_object_key WHERE id=p_upload_id RETURNING final_object_key INTO k;
  ELSE k:=u.final_object_key; END IF;
  RETURN k;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_resident_photo_final_key(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resident_photo_final_key(UUID,UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_join_photo_final_key(p_upload_id UUID, p_token_hash TEXT, p_hostel_id UUID, p_final_object_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.join_photo_upload_intents%ROWTYPE; k TEXT;
BEGIN
  SELECT * INTO u FROM public.join_photo_upload_intents WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW() OR u.token_hash IS DISTINCT FROM p_token_hash OR u.hostel_id<>p_hostel_id THEN RETURN NULL; END IF;
  IF p_final_object_key !~ ('^join-requests/'||u.hostel_id::TEXT||'/'||u.request_id::TEXT||'/[0-9a-f-]+\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'Invalid final photo key'; END IF;
  IF u.final_object_key IS NULL THEN UPDATE public.join_photo_upload_intents SET final_object_key=p_final_object_key WHERE id=p_upload_id RETURNING final_object_key INTO k;
  ELSE k:=u.final_object_key; END IF;
  RETURN k;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_join_photo_final_key(UUID,TEXT,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_join_photo_final_key(UUID,TEXT,UUID,TEXT) TO service_role;

DROP FUNCTION public.finalize_resident_photo_upload(UUID,UUID);
CREATE FUNCTION public.finalize_resident_photo_upload_staged(p_upload_id UUID,p_user_id UUID,p_final_object_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.resident_photo_uploads%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.created_by<>p_user_id OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW() OR u.final_object_key IS DISTINCT FROM p_final_object_key THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.residents WHERE id=u.resident_id AND hostel_id=u.hostel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  -- SECURITY DEFINER runs as the function owner, while JWT role remains
  -- authenticated. Explicitly mark this guarded service-side attachment.
  PERFORM set_config('app.approve_join_request_photo','on',true);
  UPDATE public.residents SET photo_path=p_final_object_key,updated_at=NOW() WHERE id=u.resident_id AND hostel_id=u.hostel_id;
  UPDATE public.resident_photo_uploads SET consumed_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(u.object_key,'resident_staging_promoted');
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_resident_photo_upload_staged(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_resident_photo_upload_staged(UUID,UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.abort_resident_photo_upload(p_upload_id UUID,p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.resident_photo_uploads%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.created_by<>p_user_id OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL THEN RETURN FALSE; END IF;
  UPDATE public.resident_photo_uploads SET aborted_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(u.object_key,'resident_upload_aborted');
  IF u.final_object_key IS NOT NULL THEN PERFORM public.enqueue_r2_photo_delete(u.final_object_key,'resident_upload_aborted'); END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_join_request_with_photo_intent(
 p_upload_id UUID,p_token_hash TEXT,p_request_id UUID,p_hostel_id UUID,p_name TEXT,p_phone TEXT,
 p_emergency_contact TEXT DEFAULT NULL,p_occupation TEXT DEFAULT NULL,p_preferred_room TEXT DEFAULT NULL,
 p_aadhar_number TEXT DEFAULT NULL,p_photo_path TEXT DEFAULT NULL,p_area_and_city TEXT DEFAULT NULL,
 p_state TEXT DEFAULT NULL,p_country TEXT DEFAULT 'India',p_preferred_sharing TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.join_photo_upload_intents%ROWTYPE;
BEGIN
  IF NOT public.hostel_accepts_public_join(p_hostel_id) THEN RAISE EXCEPTION 'Hostel not found or not accepting join requests.' USING ERRCODE='P0003'; END IF;
  IF p_upload_id IS NOT NULL THEN
    SELECT * INTO u FROM public.join_photo_upload_intents WHERE id=p_upload_id FOR UPDATE;
    IF NOT FOUND OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW() OR u.token_hash IS DISTINCT FROM p_token_hash OR u.hostel_id<>p_hostel_id OR u.request_id<>p_request_id OR u.final_object_key IS DISTINCT FROM p_photo_path THEN RAISE EXCEPTION 'Upload intent expired or invalid.' USING ERRCODE='42501'; END IF;
  ELSIF p_photo_path IS NOT NULL THEN RAISE EXCEPTION 'Photo requires a valid upload intent.' USING ERRCODE='42501'; END IF;
  IF p_photo_path IS NOT NULL AND p_photo_path !~ ('^join-requests/'||p_hostel_id::TEXT||'/'||p_request_id::TEXT||'/[0-9a-f-]+\.(jpg|png|webp)$') THEN RAISE EXCEPTION 'Invalid join photo key.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.join_requests(id,hostel_id,name,phone,emergency_contact,occupation,preferred_room,aadhar_number,photo_path,area_and_city,state,country,preferred_sharing)
  VALUES(p_request_id,p_hostel_id,TRIM(p_name),TRIM(p_phone),NULLIF(TRIM(COALESCE(p_emergency_contact,'')),''),NULLIF(TRIM(COALESCE(p_occupation,'')),''),NULLIF(TRIM(COALESCE(p_preferred_room,'')),''),NULLIF(TRIM(COALESCE(p_aadhar_number,'')),''),p_photo_path,NULLIF(TRIM(COALESCE(p_area_and_city,'')),''),NULLIF(TRIM(COALESCE(p_state,'')),''),COALESCE(p_country,'India'),NULLIF(TRIM(COALESCE(p_preferred_sharing,'')),''));
  IF p_upload_id IS NOT NULL THEN
    UPDATE public.join_photo_upload_intents SET consumed_at=NOW() WHERE id=p_upload_id;
    PERFORM public.enqueue_r2_photo_delete(u.object_key,'join_staging_promoted');
  END IF;
  PERFORM public._log_activity(p_hostel_id,'join_request_submitted','join_request',p_request_id,jsonb_build_object('preferred_sharing',p_preferred_sharing));
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_join_request_with_photo_intent(UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_join_request_with_photo_intent(UUID,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.abort_join_photo_upload(p_upload_id UUID,p_token_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.join_photo_upload_intents%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.join_photo_upload_intents WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.consumed_at IS NOT NULL OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW() OR u.token_hash IS DISTINCT FROM p_token_hash THEN RETURN FALSE; END IF;
  UPDATE public.join_photo_upload_intents SET aborted_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(u.object_key,'join_upload_aborted');
  IF u.final_object_key IS NOT NULL THEN PERFORM public.enqueue_r2_photo_delete(u.final_object_key,'join_upload_aborted'); END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_r2_photo_delete_queue(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(id BIGINT,object_key TEXT,claim_token UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c RECORD; t UUID; lim INTEGER:=LEAST(GREATEST(COALESCE(p_limit,1),1),500);
BEGIN
  FOR c IN SELECT q.id,q.object_key FROM public.r2_photo_delete_queue q WHERE q.deleted_at IS NULL AND (q.claimed_at IS NULL OR q.claimed_at<NOW()-INTERVAL '30 minutes') ORDER BY q.created_at LIMIT lim FOR UPDATE OF q SKIP LOCKED LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(c.object_key,0));
    IF NOT EXISTS(SELECT 1 FROM public.residents r WHERE r.photo_path=c.object_key) AND NOT EXISTS(SELECT 1 FROM public.join_requests j WHERE j.photo_path=c.object_key)
      AND NOT EXISTS(SELECT 1 FROM public.resident_photo_uploads u WHERE (u.object_key=c.object_key OR u.final_object_key=c.object_key) AND (u.consumed_at IS NULL OR u.expires_at>NOW()-INTERVAL '24 hours'))
      AND NOT EXISTS(SELECT 1 FROM public.join_photo_upload_intents u WHERE (u.object_key=c.object_key OR u.final_object_key=c.object_key) AND (u.consumed_at IS NULL OR u.expires_at>NOW()-INTERVAL '24 hours')) THEN
      t:=gen_random_uuid(); UPDATE public.r2_photo_delete_queue q SET claimed_at=NOW(),claim_token=t WHERE q.id=c.id AND q.deleted_at IS NULL;
      IF FOUND THEN RETURN QUERY SELECT c.id,c.object_key,t; END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_r2_photo_delete_queue(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_photo_uploads()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER:=0; r RECORD;
BEGIN
  FOR r IN SELECT id,object_key,final_object_key FROM public.join_photo_upload_intents WHERE consumed_at IS NULL AND expires_at<NOW()-INTERVAL '24 hours' ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    DELETE FROM public.join_photo_upload_intents WHERE id=r.id;
    PERFORM public.enqueue_r2_photo_delete(r.object_key,'abandoned_join_upload');
    IF r.final_object_key IS NOT NULL THEN PERFORM public.enqueue_r2_photo_delete(r.final_object_key,'abandoned_join_upload'); END IF;
    n:=n+1;
  END LOOP;
  FOR r IN SELECT id,object_key,final_object_key FROM public.resident_photo_uploads WHERE consumed_at IS NULL AND expires_at<NOW()-INTERVAL '24 hours' ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    DELETE FROM public.resident_photo_uploads WHERE id=r.id;
    PERFORM public.enqueue_r2_photo_delete(r.object_key,'abandoned_resident_upload');
    IF r.final_object_key IS NOT NULL THEN PERFORM public.enqueue_r2_photo_delete(r.final_object_key,'abandoned_resident_upload'); END IF;
    n:=n+1;
  END LOOP;
  DELETE FROM public.join_photo_upload_intents WHERE consumed_at IS NOT NULL AND consumed_at<NOW()-INTERVAL '30 days'; GET DIAGNOSTICS n=ROW_COUNT;
  DELETE FROM public.resident_photo_uploads WHERE consumed_at IS NOT NULL AND consumed_at<NOW()-INTERVAL '30 days';
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_abandoned_photo_uploads() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_photo_uploads() TO service_role;
