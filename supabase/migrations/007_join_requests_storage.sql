-- =============================================================================
-- 007_join_requests_storage.sql
-- Persistent public join requests + private document storage for Hostelrr.
-- Additive migration; run after 006_rpc.sql.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'join_request_status') THEN
    CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_document_path TEXT;

CREATE TABLE IF NOT EXISTS public.join_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id             UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  emergency_contact     TEXT,
  occupation            TEXT,
  preferred_room        TEXT,
  aadhar_number         TEXT,
  photo_path            TEXT,
  aadhar_document_path  TEXT,
  status                public.join_request_status NOT NULL DEFAULT 'pending',
  reviewed_by           UUID REFERENCES public.users(id),
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  resident_id           UUID REFERENCES public.residents(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_join_requests_updated_at
  BEFORE UPDATE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_join_requests_hostel_status
  ON public.join_requests (hostel_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_join_requests_phone
  ON public.join_requests (hostel_id, phone);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "join_requests_select_own_hostel"
  ON public.join_requests FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "join_requests_insert_public"
  ON public.join_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.hostels h WHERE h.id = hostel_id));

CREATE POLICY "join_requests_update_own_hostel"
  ON public.join_requests FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hostelrr-documents',
  'hostelrr-documents',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "hostelrr_documents_owner_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hostelrr-documents'
    AND (
      ((storage.foldername(name))[1] = 'residents'
        AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
      OR
      ((storage.foldername(name))[1] = 'join-requests'
        AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
    )
  );

CREATE POLICY "hostelrr_documents_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hostelrr-documents'
    AND (
      ((storage.foldername(name))[1] = 'residents'
        AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
      OR
      ((storage.foldername(name))[1] = 'join-requests'
        AND EXISTS (SELECT 1 FROM public.hostels h WHERE h.id = ((storage.foldername(name))[2])::UUID))
    )
  );

CREATE POLICY "hostelrr_documents_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'hostelrr-documents'
    AND ((storage.foldername(name))[1] = 'residents'
      AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
  )
  WITH CHECK (
    bucket_id = 'hostelrr-documents'
    AND ((storage.foldername(name))[1] = 'residents'
      AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
  );

CREATE POLICY "hostelrr_documents_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hostelrr-documents'
    AND (
      ((storage.foldername(name))[1] = 'residents'
        AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
      OR
      ((storage.foldername(name))[1] = 'join-requests'
        AND public.user_owns_hostel(((storage.foldername(name))[2])::UUID))
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_hostel(p_hostel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostel public.hostels%ROWTYPE;
BEGIN
  SELECT * INTO v_hostel FROM public.hostels WHERE id = p_hostel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hostel % not found', p_hostel_id USING ERRCODE = 'P0003';
  END IF;

  RETURN jsonb_build_object(
    'id', v_hostel.id,
    'name', v_hostel.name,
    'city', v_hostel.city,
    'state', v_hostel.state,
    'phone', v_hostel.phone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_join_request(
  p_hostel_id             UUID,
  p_name                  TEXT,
  p_phone                 TEXT,
  p_emergency_contact     TEXT DEFAULT NULL,
  p_occupation            TEXT DEFAULT NULL,
  p_preferred_room        TEXT DEFAULT NULL,
  p_aadhar_number         TEXT DEFAULT NULL,
  p_photo_path            TEXT DEFAULT NULL,
  p_aadhar_document_path  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hostels WHERE id = p_hostel_id) THEN
    RAISE EXCEPTION 'Hostel % not found', p_hostel_id USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.join_requests (
    hostel_id, name, phone, emergency_contact, occupation, preferred_room,
    aadhar_number, photo_path, aadhar_document_path
  )
  VALUES (
    p_hostel_id, TRIM(p_name), TRIM(p_phone), NULLIF(TRIM(COALESCE(p_emergency_contact, '')), ''),
    NULLIF(TRIM(COALESCE(p_occupation, '')), ''), NULLIF(TRIM(COALESCE(p_preferred_room, '')), ''),
    NULLIF(TRIM(COALESCE(p_aadhar_number, '')), ''), p_photo_path, p_aadhar_document_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public._log_activity(
    p_hostel_id,
    'join_request_submitted',
    'join_request',
    v_request_id,
    jsonb_build_object('name', p_name, 'phone', p_phone, 'preferred_room', p_preferred_room)
  );

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_join_request(
  p_request_id            UUID,
  p_room_id               UUID,
  p_bed_id                UUID,
  p_monthly_rent          INTEGER,
  p_join_date             DATE DEFAULT CURRENT_DATE,
  p_security_deposit      INTEGER DEFAULT 0,
  p_is_deposit_paid       BOOLEAN DEFAULT FALSE,
  p_stay_duration_days    INTEGER DEFAULT NULL,
  p_review_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.join_requests%ROWTYPE;
  v_resident_id UUID;
BEGIN
  SELECT * INTO v_request
  FROM public.join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request % not found', p_request_id USING ERRCODE = 'P0014';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Join request has already been reviewed.' USING ERRCODE = 'P0015';
  END IF;

  IF NOT public.user_owns_hostel(v_request.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  v_resident_id := public.add_resident(
    v_request.hostel_id,
    p_room_id,
    p_bed_id,
    v_request.name,
    v_request.phone,
    p_monthly_rent,
    p_join_date,
    p_security_deposit,
    p_is_deposit_paid,
    p_stay_duration_days,
    v_request.emergency_contact,
    v_request.aadhar_number,
    NULL
  );

  UPDATE public.residents
  SET photo_path = v_request.photo_path,
      aadhar_document_path = v_request.aadhar_document_path,
      updated_at = NOW()
  WHERE id = v_resident_id;

  UPDATE public.join_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      review_notes = p_review_notes,
      resident_id = v_resident_id
  WHERE id = p_request_id;

  PERFORM public._log_activity(
    v_request.hostel_id,
    'join_request_approved',
    'join_request',
    p_request_id,
    jsonb_build_object('resident_id', v_resident_id)
  );

  RETURN v_resident_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_join_request(
  p_request_id UUID,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.join_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request % not found', p_request_id USING ERRCODE = 'P0014';
  END IF;

  IF NOT public.user_owns_hostel(v_request.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.join_requests
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      review_notes = p_review_notes
  WHERE id = p_request_id;

  PERFORM public._log_activity(
    v_request.hostel_id,
    'join_request_rejected',
    'join_request',
    p_request_id,
    jsonb_build_object('notes', p_review_notes)
  );
END;
$$;

COMMENT ON TABLE public.join_requests IS 'Public join-form submissions for a hostel. Owners review and convert them to residents.';
