-- Permanently remove departed/archived resident history after two months.
-- Resident payments and payment cycles use ON DELETE CASCADE and are removed
-- with the resident; the resident photo delete trigger queues its object too.
CREATE OR REPLACE FUNCTION public.purge_expired_resident_history()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.residents
  WHERE (status = 'left' OR deleted_at IS NOT NULL)
    AND COALESCE(actual_leave_date::timestamptz, deleted_at, updated_at, created_at)
        < NOW() - INTERVAL '2 months';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_resident_history() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.purge_expired_resident_history() IS
  'Daily system job: permanently deletes departed or archived resident records after two months, including cascaded payment history.';

CREATE OR REPLACE FUNCTION public.delete_past_resident(p_resident_id UUID)
RETURNS VOID
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

  DELETE FROM public.residents WHERE id = p_resident_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_past_resident(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_past_resident(UUID) TO authenticated;
COMMENT ON FUNCTION public.delete_past_resident(UUID) IS
  'Permanently deletes one departed or archived resident history record for its hostel owner, including cascaded payment history.';

SELECT cron.schedule(
  'purge-expired-resident-history-daily',
  '15 0 * * *',
  'SELECT public.purge_expired_resident_history()'
);
