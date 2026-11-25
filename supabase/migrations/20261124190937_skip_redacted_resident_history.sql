-- Already-redacted financial-history rows must not be reprocessed by every
-- five-minute cleanup run.
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
