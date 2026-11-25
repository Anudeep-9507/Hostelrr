CREATE TABLE public.monthly_overview_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (EXTRACT(DAY FROM month_start) = 1),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostel_id, month_start)
);

CREATE INDEX monthly_overview_snapshots_hostel_month_idx
  ON public.monthly_overview_snapshots (hostel_id, month_start DESC);

ALTER TABLE public.monthly_overview_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read monthly overview snapshots"
  ON public.monthly_overview_snapshots FOR SELECT TO authenticated
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "Owners can save monthly overview snapshots"
  ON public.monthly_overview_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "Owners can update monthly overview snapshots"
  ON public.monthly_overview_snapshots FOR UPDATE TO authenticated
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

GRANT SELECT, INSERT, UPDATE ON public.monthly_overview_snapshots TO authenticated;
