-- Capture each applicant's room and sharing preferences for owner review.
ALTER TABLE public.join_requests
  ADD COLUMN IF NOT EXISTS preferred_sharing TEXT;

CREATE OR REPLACE FUNCTION public.create_join_request(
  p_hostel_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_emergency_contact TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_preferred_room TEXT DEFAULT NULL,
  p_aadhar_number TEXT DEFAULT NULL,
  p_photo_path TEXT DEFAULT NULL,
  p_aadhar_document_path TEXT DEFAULT NULL,
  p_area_and_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'India',
  p_preferred_sharing TEXT DEFAULT NULL
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
    aadhar_number, photo_path, aadhar_document_path, area_and_city, state,
    country, preferred_sharing
  )
  VALUES (
    p_hostel_id,
    TRIM(p_name),
    TRIM(p_phone),
    NULLIF(TRIM(COALESCE(p_emergency_contact, '')), ''),
    NULLIF(TRIM(COALESCE(p_occupation, '')), ''),
    NULLIF(TRIM(COALESCE(p_preferred_room, '')), ''),
    NULLIF(TRIM(COALESCE(p_aadhar_number, '')), ''),
    p_photo_path,
    p_aadhar_document_path,
    NULLIF(TRIM(COALESCE(p_area_and_city, '')), ''),
    NULLIF(TRIM(COALESCE(p_state, '')), ''),
    COALESCE(p_country, 'India'),
    NULLIF(TRIM(COALESCE(p_preferred_sharing, '')), '')
  )
  RETURNING id INTO v_request_id;

  PERFORM public._log_activity(
    p_hostel_id,
    'join_request_submitted',
    'join_request',
    v_request_id,
    jsonb_build_object(
      'name', p_name,
      'phone', p_phone,
      'preferred_room', p_preferred_room,
      'preferred_sharing', p_preferred_sharing
    )
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_join_request(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_join_request(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- Calculate the expected end date from join date + stay duration in the same
-- transaction that approves and creates the resident.
DROP FUNCTION IF EXISTS public.approve_join_request(
  UUID, UUID, UUID, INTEGER, DATE, INTEGER, BOOLEAN, INTEGER, TEXT
);

CREATE FUNCTION public.approve_join_request(
  p_request_id UUID,
  p_room_id UUID,
  p_bed_id UUID,
  p_monthly_rent INTEGER,
  p_join_date DATE DEFAULT CURRENT_DATE,
  p_security_deposit INTEGER DEFAULT 0,
  p_is_deposit_paid BOOLEAN DEFAULT FALSE,
  p_stay_duration_days INTEGER DEFAULT NULL,
  p_review_notes TEXT DEFAULT NULL,
  p_vacating_date DATE DEFAULT NULL
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

  IF NOT public.user_can_write_hostel(v_request.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  v_resident_id := public.add_resident_onboarding(
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
    v_request.area_and_city,
    v_request.state,
    v_request.country,
    FALSE
  );

  UPDATE public.residents
  SET photo_path = v_request.photo_path,
      aadhar_document_path = v_request.aadhar_document_path,
      vacating_date = p_vacating_date,
      updated_at = NOW()
  WHERE id = v_resident_id
    AND hostel_id = v_request.hostel_id;

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

REVOKE ALL ON FUNCTION public.approve_join_request(
  UUID, UUID, UUID, INTEGER, DATE, INTEGER, BOOLEAN, INTEGER, TEXT, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(
  UUID, UUID, UUID, INTEGER, DATE, INTEGER, BOOLEAN, INTEGER, TEXT, DATE
) TO authenticated;
