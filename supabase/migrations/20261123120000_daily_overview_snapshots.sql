CREATE TABLE public.daily_overview_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostel_id, snapshot_date)
);

CREATE INDEX daily_overview_snapshots_hostel_date_idx
  ON public.daily_overview_snapshots (hostel_id, snapshot_date DESC);

ALTER TABLE public.daily_overview_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read daily overview snapshots"
  ON public.daily_overview_snapshots FOR SELECT TO authenticated
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "Owners can save daily overview snapshots"
  ON public.daily_overview_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "Owners can update daily overview snapshots"
  ON public.daily_overview_snapshots FOR UPDATE TO authenticated
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

GRANT SELECT, INSERT, UPDATE ON public.daily_overview_snapshots TO authenticated;
