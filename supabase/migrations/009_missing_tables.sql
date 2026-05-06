-- =============================================================================
-- 008_missing_tables.sql
-- Add complaints table and its policies
-- =============================================================================

CREATE TYPE public.complaint_status AS ENUM ('pending', 'in_progress', 'resolved');

CREATE TABLE IF NOT EXISTS public.complaints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  resident_id     UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          public.complaint_status NOT NULL DEFAULT 'pending',
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.complaints IS 'Resident complaints.';

CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "complaints_select_own_hostel"
  ON public.complaints FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "complaints_update_own_hostel"
  ON public.complaints FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "complaints_insert_own_hostel"
  ON public.complaints FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));
