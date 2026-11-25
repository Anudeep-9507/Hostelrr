-- Let previously generated name-based join links keep working while new QR
-- codes continue using the hostel UUID for an unambiguous destination.
DROP FUNCTION IF EXISTS public.get_public_hostel_for_join(UUID);

CREATE FUNCTION public.get_public_hostel_for_join(p_hostel_ref TEXT)
RETURNS TABLE (id UUID, hostel_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.name::TEXT
  FROM public.hostels h
  WHERE h.id::TEXT = p_hostel_ref
     OR (
       p_hostel_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND trim(both '-' from regexp_replace(lower(h.name), '[^a-z0-9]+', '-', 'g'))
           = trim(both '-' from regexp_replace(lower(p_hostel_ref), '[^a-z0-9]+', '-', 'g'))
       AND (
         SELECT count(*)
         FROM public.hostels h2
         WHERE trim(both '-' from regexp_replace(lower(h2.name), '[^a-z0-9]+', '-', 'g'))
               = trim(both '-' from regexp_replace(lower(p_hostel_ref), '[^a-z0-9]+', '-', 'g'))
       ) = 1
     )
  ORDER BY CASE WHEN h.id::TEXT = p_hostel_ref THEN 0 ELSE 1 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_hostel_for_join(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_hostel_for_join(TEXT) TO anon, authenticated;
