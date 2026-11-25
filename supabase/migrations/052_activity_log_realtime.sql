-- Reuse the existing hostel-scoped activity feed for live owner notifications.
-- RLS/SELECT policies remain the authorization boundary for Realtime delivery.
DO $activity_realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Expected Supabase publication supabase_realtime is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs';
  END IF;
END;
$activity_realtime$;
