-- =============================================================================
-- 029_drop_legacy_add_resident_email_overloads.sql
-- Remove legacy add_resident overloads that still include p_email.
-- These overloads conflict with current no-email version from 027 and can cause
-- ambiguous function resolution or runtime errors (residents.email removed).
-- =============================================================================

-- Old variant (before location fields)
DROP FUNCTION IF EXISTS public.add_resident(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, DATE, INTEGER, BOOLEAN,
  INTEGER, TEXT, TEXT, TEXT
);

-- Legacy variant (with location fields + p_email)
DROP FUNCTION IF EXISTS public.add_resident(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, DATE, INTEGER, BOOLEAN,
  INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);
