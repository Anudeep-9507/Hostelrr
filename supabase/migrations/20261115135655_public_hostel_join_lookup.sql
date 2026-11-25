-- Public join pages need the hostel's display name without an owner session.
-- Expose only the minimum fields needed by the QR form.
CREATE OR REPLACE FUNCTION public.get_public_hostel_for_join(p_hostel_id UUID)
RETURNS TABLE (id UUID, hostel_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.name::TEXT
  FROM public.hostels h
  WHERE h.id = p_hostel_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_hostel_for_join(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_hostel_for_join(UUID) TO anon, authenticated;
