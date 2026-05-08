-- =============================================================================
-- 028_drop_activity_logs_ip_address.sql
-- Remove unused ip_address column from activity_logs table
-- =============================================================================

ALTER TABLE public.activity_logs
  DROP COLUMN IF EXISTS ip_address;

COMMENT ON TABLE public.activity_logs IS 'Immutable audit trail for all hostel operations.';
