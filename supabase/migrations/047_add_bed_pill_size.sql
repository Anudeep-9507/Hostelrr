-- 047_add_bed_pill_size.sql
-- Add pill_size column to bed_layout_templates to allow customizing bed size in UI

ALTER TABLE public.bed_layout_templates 
ADD COLUMN pill_size NUMERIC DEFAULT 1.0 CHECK (pill_size >= 0.5 AND pill_size <= 2.0);

COMMENT ON COLUMN public.bed_layout_templates.pill_size IS 'Scale factor for bed pills in UI (0.5 to 2.0). Default is 1.0.';
