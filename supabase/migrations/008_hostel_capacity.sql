-- =============================================================================
-- 008_hostel_capacity.sql
-- Preserve onboarding-planned bed capacity on the hostel record so the product
-- can show meaningful totals before every room is fully configured.
-- =============================================================================

ALTER TABLE public.hostels
ADD COLUMN IF NOT EXISTS total_beds INTEGER NOT NULL DEFAULT 0
CHECK (total_beds >= 0);

COMMENT ON COLUMN public.hostels.total_beds IS
'Planned total bed capacity captured during onboarding. Used as a dashboard fallback until all rooms are fully configured.';
