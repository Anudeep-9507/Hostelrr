-- Move resident/join-request photos to R2 and retire document-only fields.
-- Apply after R2 secrets are configured; deploy resident-photo after all R2 migrations.

-- Existing photo references are disposable Supabase Storage demo data. Clear
-- them before installing any R2 reference or deletion triggers. This performs
-- no Storage or R2 object operation and deliberately queues no deletion.
UPDATE public.residents SET photo_path = NULL WHERE photo_path IS NOT NULL;
UPDATE public.join_requests SET photo_path = NULL WHERE photo_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.resident_photo_uploads (
  id UUID PRIMARY KEY,
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  hostel_id UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  expected_size INTEGER NOT NULL CHECK (expected_size > 0 AND expected_size <= 3145728),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);
ALTER TABLE public.resident_photo_uploads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.join_photo_upload_intents (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  hostel_id UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  expected_size INTEGER NOT NULL CHECK (expected_size > 0 AND expected_size <= 1048576),
  token_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_join_photo_intents_ip_created
  ON public.join_photo_upload_intents(ip_hash, created_at DESC);
ALTER TABLE public.join_photo_upload_intents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.join_photo_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count > 0)
);
ALTER TABLE public.join_photo_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.r2_photo_delete_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.r2_photo_delete_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.resident_photo_uploads, public.join_photo_upload_intents, public.join_photo_rate_limits, public.r2_photo_delete_queue FROM anon, authenticated;
GRANT ALL ON public.resident_photo_uploads, public.join_photo_upload_intents, public.join_photo_rate_limits, public.r2_photo_delete_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.r2_photo_delete_queue_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.consume_join_photo_rate_limit(p_ip_hash TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hits INTEGER; v_window TIMESTAMPTZ := date_trunc('hour', NOW());
BEGIN
  INSERT INTO public.join_photo_rate_limits(ip_hash, window_start, hit_count)
  VALUES (p_ip_hash, v_window, 1)
  ON CONFLICT (ip_hash) DO UPDATE SET
    window_start = EXCLUDED.window_start,
    hit_count = CASE WHEN join_photo_rate_limits.window_start < EXCLUDED.window_start
      THEN 1 ELSE join_photo_rate_limits.hit_count + 1 END
  RETURNING hit_count INTO v_hits;
  RETURN v_hits;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_join_photo_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_join_photo_rate_limit(TEXT) TO service_role;

-- Lock photo references to the trusted Edge Function. The approval RPC copies
-- the already-verified join request key under an explicit transaction marker.
CREATE OR REPLACE FUNCTION public.guard_r2_photo_key()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.photo_path IS DISTINCT FROM OLD.photo_path
     AND auth.role() <> 'service_role'
     AND current_setting('app.approve_join_request_photo', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Photo key must be changed through the photo service.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_guard_r2_photo_key ON public.residents;
CREATE TRIGGER residents_guard_r2_photo_key
  BEFORE UPDATE OF photo_path ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.guard_r2_photo_key();
DROP TRIGGER IF EXISTS join_requests_guard_r2_photo_key ON public.join_requests;
CREATE TRIGGER join_requests_guard_r2_photo_key
  BEFORE UPDATE OF photo_path ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_r2_photo_key();

-- Server-only join submission, invoked after the Edge Function verifies the
-- upload intent and object metadata. Caller cannot choose an existing key.
CREATE OR REPLACE FUNCTION public.create_join_request_secure(
  p_request_id UUID,
  p_hostel_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_emergency_contact TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_preferred_room TEXT DEFAULT NULL,
  p_aadhar_number TEXT DEFAULT NULL,
  p_photo_path TEXT DEFAULT NULL,
  p_area_and_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'India',
  p_preferred_sharing TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hostels WHERE id = p_hostel_id) THEN
    RAISE EXCEPTION 'Hostel not found' USING ERRCODE = 'P0003';
  END IF;
  IF p_photo_path IS NOT NULL AND p_photo_path !~ ('^join-requests/' || p_hostel_id::TEXT || '/' || p_request_id::TEXT || '/[0-9a-f-]+\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid join photo key' USING ERRCODE = '22023';
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
  PERFORM public._log_activity(p_hostel_id, 'join_request_submitted', 'join_request', p_request_id,
    jsonb_build_object('preferred_sharing', p_preferred_sharing));
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_join_request_secure(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_join_request_secure(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
REVOKE INSERT ON public.join_requests FROM anon, authenticated;
DROP POLICY IF EXISTS join_requests_insert_public ON public.join_requests;

-- Preserve the current approval behavior and atomically copy the exact R2 key.
DROP FUNCTION IF EXISTS public.approve_join_request(UUID, UUID, UUID, INTEGER, DATE, INTEGER, BOOLEAN, INTEGER, TEXT, DATE);
CREATE FUNCTION public.approve_join_request(
  p_request_id UUID, p_room_id UUID, p_bed_id UUID, p_monthly_rent INTEGER,
  p_join_date DATE DEFAULT CURRENT_DATE, p_security_deposit INTEGER DEFAULT 0,
  p_is_deposit_paid BOOLEAN DEFAULT FALSE, p_stay_duration_days INTEGER DEFAULT NULL,
  p_review_notes TEXT DEFAULT NULL, p_vacating_date DATE DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request public.join_requests%ROWTYPE; v_resident_id UUID;
BEGIN
  SELECT * INTO v_request FROM public.join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join request not found' USING ERRCODE = 'P0014'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Join request has already been reviewed.' USING ERRCODE = 'P0015'; END IF;
  IF NOT public.user_can_write_hostel(v_request.hostel_id) THEN RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501'; END IF;
  IF v_request.photo_path IS NOT NULL
     AND v_request.photo_path !~ ('^join-requests/' || v_request.hostel_id::TEXT || '/' || v_request.id::TEXT || '/[0-9a-f-]+\.(jpg|png|webp)$')
     AND v_request.photo_path !~ ('^join-requests/' || v_request.hostel_id::TEXT || '/photo/[A-Za-z0-9._-]+\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Join photo key is invalid' USING ERRCODE = '22023';
  END IF;
  v_resident_id := public.add_resident_onboarding(
    v_request.hostel_id, p_room_id, p_bed_id, v_request.name, v_request.phone,
    p_monthly_rent, p_join_date, p_security_deposit, p_is_deposit_paid,
    p_stay_duration_days, v_request.emergency_contact, v_request.aadhar_number,
    v_request.area_and_city, v_request.state, v_request.country, FALSE
  );
  PERFORM set_config('app.approve_join_request_photo', 'on', true);
  UPDATE public.residents SET photo_path = v_request.photo_path, vacating_date = p_vacating_date, updated_at = NOW()
    WHERE id = v_resident_id AND hostel_id = v_request.hostel_id;
  UPDATE public.join_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = NOW(),
    review_notes = p_review_notes, resident_id = v_resident_id WHERE id = p_request_id;
  PERFORM public._log_activity(v_request.hostel_id, 'join_request_approved', 'join_request', p_request_id,
    jsonb_build_object('resident_id', v_resident_id));
  RETURN v_resident_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_join_request(UUID,UUID,UUID,INTEGER,DATE,INTEGER,BOOLEAN,INTEGER,TEXT,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(UUID,UUID,UUID,INTEGER,DATE,INTEGER,BOOLEAN,INTEGER,TEXT,DATE) TO authenticated;

-- Remove public legacy RPC entry points that accepted arbitrary photo paths.
DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_join_request'
  LOOP EXECUTE 'DROP FUNCTION ' || f.signature; END LOOP;
END $$;

-- Retire document-only data after document UI/API removal.
ALTER TABLE public.residents DROP COLUMN IF EXISTS aadhar_document_path, DROP COLUMN IF EXISTS hostel_form_path;
ALTER TABLE public.join_requests DROP COLUMN IF EXISTS aadhar_document_path;


-- Atomically detach photos eligible for retention cleanup. Approval locks the
-- same request row, so an accepted photo can never be queued by this function.
CREATE OR REPLACE FUNCTION public.claim_expired_join_photo_cleanup()
RETURNS TABLE(id BIGINT, object_key TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT j.id AS request_id, j.photo_path AS key
    FROM public.join_requests j
    WHERE j.photo_path IS NOT NULL
      AND ((j.status='rejected' AND j.reviewed_at < NOW()-INTERVAL '14 days')
        OR (j.status='pending' AND j.created_at < NOW()-INTERVAL '14 days'))
      AND NOT EXISTS (SELECT 1 FROM public.residents r WHERE r.photo_path=j.photo_path)
    FOR UPDATE OF j SKIP LOCKED
  ), detached AS (
    UPDATE public.join_requests j SET photo_path=NULL FROM eligible e
      WHERE j.id=e.request_id RETURNING e.key
  ), queued AS (
    INSERT INTO public.r2_photo_delete_queue(object_key,reason)
      SELECT key,'expired_join_request' FROM detached ON CONFLICT(object_key) DO NOTHING
      RETURNING r2_photo_delete_queue.id,r2_photo_delete_queue.object_key
  ) SELECT queued.id, queued.object_key FROM queued;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_expired_join_photo_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_join_photo_cleanup() TO service_role;
