-- =============================================================================
-- 018_get_join_requests.sql
-- Secure read RPC for dashboard join requests.
-- Depends on: 007_join_requests_storage.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_join_requests(
  p_hostel_id UUID,
  p_status public.join_request_status DEFAULT NULL
)
RETURNS SETOF public.join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.join_requests
  WHERE hostel_id = p_hostel_id
    AND (p_status IS NULL OR status = p_status)
  ORDER BY created_at DESC;
END;
$$;
