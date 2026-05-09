-- =============================================================================
-- 031_fix_onboarding_permissions.sql
-- Fix permission denied errors for onboarding table access from authenticated users.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onboarding TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onboarding TO service_role;
