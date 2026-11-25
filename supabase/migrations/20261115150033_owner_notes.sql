CREATE TABLE IF NOT EXISTS public.owner_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS owner_notes_hostel_updated_idx
  ON public.owner_notes (hostel_id, updated_at DESC);

ALTER TABLE public.owner_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_notes_select_own_hostel"
  ON public.owner_notes FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "owner_notes_insert_own_hostel"
  ON public.owner_notes FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "owner_notes_update_own_hostel"
  ON public.owner_notes FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "owner_notes_delete_own_hostel"
  ON public.owner_notes FOR DELETE
  USING (public.user_owns_hostel(hostel_id));
