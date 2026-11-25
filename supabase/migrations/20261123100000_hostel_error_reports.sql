CREATE TABLE public.hostel_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  error_name text NOT NULL CHECK (char_length(error_name) <= 200),
  error_message text NOT NULL CHECK (char_length(error_message) <= 3000),
  error_stack text CHECK (error_stack IS NULL OR char_length(error_stack) <= 12000),
  component_stack text CHECK (component_stack IS NULL OR char_length(component_stack) <= 12000),
  route text NOT NULL CHECK (char_length(route) <= 500),
  browser text CHECK (browser IS NULL OR char_length(browser) <= 500),
  environment text CHECK (environment IS NULL OR char_length(environment) <= 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hostel_error_reports_hostel_created_idx
  ON public.hostel_error_reports (hostel_id, created_at DESC);

ALTER TABLE public.hostel_error_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hostel_error_reports FROM PUBLIC, anon, authenticated;
GRANT INSERT (hostel_id, reporter_id, comment, error_name, error_message, error_stack, component_stack, route, browser, environment)
  ON TABLE public.hostel_error_reports TO authenticated;
GRANT SELECT ON TABLE public.hostel_error_reports TO service_role;

CREATE POLICY hostel_error_reports_owner_insert
  ON public.hostel_error_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND public.user_owns_hostel(hostel_id));
