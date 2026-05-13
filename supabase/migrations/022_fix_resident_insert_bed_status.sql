-- 022_fix_resident_insert_bed_status.sql
--
-- Fix bed status assignment on resident insert.
-- Residents should occupy the bed by default.
-- Reserved beds are only set explicitly from the add-resident flow.
--

CREATE OR REPLACE FUNCTION public._on_resident_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beds
  SET status = 'occupied'::public.bed_status
  WHERE id = NEW.bed_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_after_resident_insert
  AFTER INSERT ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public._on_resident_inserted();
