-- =============================================================================
-- 024_bed_layout_templates.sql
-- Add bed layout templates table to store room layouts persistently in database
-- Depends on: 002_tables.sql, 004_rls.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. BED_LAYOUT_TEMPLATES TABLE
--    Stores bed position templates for different sharing types per hostel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bed_layout_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  sharing         SMALLINT NOT NULL CHECK (sharing > 0),  -- Number of beds (1-10+)
  positions       JSONB NOT NULL,                         -- {bedLabel: {x, y, rotated}}
  door            TEXT CHECK (door IS NULL OR door IN ('N', 'S', 'E', 'W')),
  color           TEXT NOT NULL DEFAULT 'Blue',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_template_per_hostel UNIQUE (hostel_id, sharing, id)
);

COMMENT ON TABLE public.bed_layout_templates IS 'Bed position templates for each sharing type, stored per hostel and user account.';
COMMENT ON COLUMN public.bed_layout_templates.sharing IS 'Number of beds this template supports.';
COMMENT ON COLUMN public.bed_layout_templates.positions IS 'JSON object mapping bed labels to {x, y, rotated} coordinates.';
COMMENT ON COLUMN public.bed_layout_templates.color IS 'UI color theme: Blue, Pink, Purple, Amber, Emerald.';

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bed_layout_templates_hostel_id 
  ON public.bed_layout_templates(hostel_id);

CREATE INDEX IF NOT EXISTS idx_bed_layout_templates_hostel_sharing 
  ON public.bed_layout_templates(hostel_id, sharing);

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.bed_layout_templates ENABLE ROW LEVEL SECURITY;

-- Users can only see templates for hostels they own
CREATE POLICY "bed_layout_templates_select"
  ON public.bed_layout_templates FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

-- Users can insert templates for their hostels
CREATE POLICY "bed_layout_templates_insert"
  ON public.bed_layout_templates FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

-- Users can update templates in their hostels
CREATE POLICY "bed_layout_templates_update"
  ON public.bed_layout_templates FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

-- Users can delete templates from their hostels
CREATE POLICY "bed_layout_templates_delete"
  ON public.bed_layout_templates FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 4. TRIGGER: Update updated_at timestamp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_bed_layout_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bed_layout_templates_updated_at ON public.bed_layout_templates;
CREATE TRIGGER trg_bed_layout_templates_updated_at
  BEFORE UPDATE ON public.bed_layout_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bed_layout_templates_timestamp();
