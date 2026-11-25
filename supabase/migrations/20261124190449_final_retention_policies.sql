-- Apply final request and resident retention rules without changing the R2
-- deletion queue, worker, upload flow, or existing five-minute scheduler.

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS personal_data_deleted_at TIMESTAMPTZ;

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
    PERFORM set_config('app.approve_join_request_photo', 'on', true);
    UPDATE public.join_requests
       SET photo_path = NULL
     WHERE resident_id = OLD.id
       AND status = 'approved'
       AND photo_path = v_old_key;
    v_reason := CASE WHEN TG_OP = 'DELETE'
      THEN 'resident_reference_deleted' ELSE 'resident_reference_replaced' END;
  ELSE
    IF OLD.status = 'pending' THEN
      v_not_before := OLD.created_at + INTERVAL '14 days';
      v_reason := 'unanswered_request_photo_retention';
    ELSIF OLD.status = 'rejected' THEN
      v_reason := 'declined_request_deleted';
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
  IF NOT public.user_can_write_hostel(v_request.hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only unanswered join requests can be declined.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.join_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = NOW(), review_notes = p_review_notes
   WHERE id = p_request_id;

  PERFORM public._log_activity(
    v_request.hostel_id, 'join_request_rejected', 'join_request', p_request_id,
    jsonb_build_object('notes', p_review_notes)
  );

  DELETE FROM public.join_requests WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_expired_join_photo_cleanup()
RETURNS TABLE(id BIGINT, object_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.join_requests j
   WHERE j.status = 'pending'
     AND j.created_at < NOW() - INTERVAL '14 days';
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_expired_join_photo_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_join_photo_cleanup() TO service_role;

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
COMMENT ON FUNCTION public.purge_expired_resident_history() IS
  'Purges departed resident data after two Asia/Kolkata calendar months. Preserves finance rows and anonymizes resident rows required by finance foreign keys.';

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
COMMENT ON FUNCTION public.delete_past_resident(UUID) IS
  'Deletes one departed resident for its hostel owner. Preserves linked accounting records by anonymizing residents that finance foreign keys require.';

-- Declined submissions have no dependent records. Their photo trigger queues
-- deletion immediately, subject to the existing reference and upload checks.
DELETE FROM public.join_requests WHERE status = 'rejected';
