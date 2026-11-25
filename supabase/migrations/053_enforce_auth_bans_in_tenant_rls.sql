-- A Supabase Auth ban blocks future sign-ins. Also block tenant access through
-- previously issued owner JWTs by checking the canonical Auth ban timestamp in
-- the ownership helper used by tenant RLS policies and owner RPCs.
CREATE OR REPLACE FUNCTION public.user_owns_hostel(p_hostel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hostels h
    JOIN auth.users u ON u.id = h.user_id
    WHERE h.id = p_hostel_id
      AND h.user_id = auth.uid()
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
$function$;
