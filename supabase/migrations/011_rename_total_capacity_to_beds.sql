-- =============================================================================
-- 011_rename_total_capacity_to_beds.sql
-- Rename total_capacity to total_beds as it was already applied
-- =============================================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hostels' AND column_name='total_capacity') THEN
    ALTER TABLE public.hostels RENAME COLUMN total_capacity TO total_beds;
  END IF;
END $$;
