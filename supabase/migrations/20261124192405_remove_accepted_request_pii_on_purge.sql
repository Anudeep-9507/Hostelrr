-- Accepted request rows remain during the resident workflow because they can
-- support photo retrieval. Remove that duplicate PII when resident data expires
-- or the owner permanently deletes History.

CREATE OR REPLACE FUNCTION public.purge_expired_resident_history()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%ROWTYPE;
  v_cutoff DATE := (timezone('Asia/Kolkata', NOW())::DATE - INTERVAL '2 months')::DATE;
  v_affected_count INTEGER := 0;
  v_has_financial_refs BOOLEAN;
BEGIN
  FOR v_resident IN
    SELECT r.*
      FROM public.residents r
     WHERE (r.status = 'left' OR r.deleted_at IS NOT NULL)
       AND r.personal_data_deleted_at IS NULL
       AND COALESCE(r.actual_leave_date,
                    (r.deleted_at AT TIME ZONE 'Asia/Kolkata')::DATE,
                    (r.updated_at AT TIME ZONE 'Asia/Kolkata')::DATE,
                    (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE) < v_cutoff
     ORDER BY r.id
     FOR UPDATE OF r SKIP LOCKED
  LOOP
    DELETE FROM public.join_requests
     WHERE resident_id = v_resident.id AND status = 'approved';

    SELECT EXISTS (SELECT 1 FROM public.payment_cycles pc WHERE pc.resident_id = v_resident.id)
        OR EXISTS (SELECT 1 FROM public.payments p WHERE p.resident_id = v_resident.id)
        OR EXISTS (SELECT 1 FROM public.payment_recording_requests pr WHERE pr.resident_id = v_resident.id)
      INTO v_has_financial_refs;

    IF v_has_financial_refs THEN
      UPDATE public.residents
         SET name = 'Deleted resident',
             phone = 'deleted-' || replace(v_resident.id::TEXT, '-', ''),
             emergency_contact = NULL,
             aadhar_number = NULL,
             photo_path = NULL,
             area_and_city = NULL,
             state = NULL,
             country = NULL,
             personal_data_deleted_at = COALESCE(personal_data_deleted_at, NOW())
       WHERE id = v_resident.id;
    ELSE
      DELETE FROM public.residents WHERE id = v_resident.id;
    END IF;
    v_affected_count := v_affected_count + 1;
  END LOOP;
  RETURN v_affected_count;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_resident_history() FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.delete_past_resident(UUID);
CREATE FUNCTION public.delete_past_resident(p_resident_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%ROWTYPE;
BEGIN
  SELECT * INTO v_resident
    FROM public.residents
   WHERE id = p_resident_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident history not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_owns_hostel(v_resident.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  IF v_resident.status <> 'left' AND v_resident.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Only departed or archived residents can be deleted.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.join_requests
   WHERE resident_id = p_resident_id AND status = 'approved';

  IF EXISTS (SELECT 1 FROM public.payment_cycles pc WHERE pc.resident_id = p_resident_id)
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.resident_id = p_resident_id)
     OR EXISTS (SELECT 1 FROM public.payment_recording_requests pr WHERE pr.resident_id = p_resident_id) THEN
    UPDATE public.residents
       SET name = 'Deleted resident',
           phone = 'deleted-' || replace(v_resident.id::TEXT, '-', ''),
           emergency_contact = NULL,
           aadhar_number = NULL,
           photo_path = NULL,
           area_and_city = NULL,
           state = NULL,
           country = NULL,
           personal_data_deleted_at = COALESCE(personal_data_deleted_at, NOW())
     WHERE id = p_resident_id;
    RETURN 'anonymized';
  END IF;

  DELETE FROM public.residents WHERE id = p_resident_id;
  RETURN 'deleted';
END;
$$;
REVOKE ALL ON FUNCTION public.delete_past_resident(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_past_resident(UUID) TO authenticated;

-- A previous cleanup already redacted these residents. Remove their approved
-- duplicate request rows now without reprocessing or changing resident dates.
DELETE FROM public.join_requests j
 USING public.residents r
 WHERE j.resident_id = r.id
   AND j.status = 'approved'
   AND r.personal_data_deleted_at IS NOT NULL;
