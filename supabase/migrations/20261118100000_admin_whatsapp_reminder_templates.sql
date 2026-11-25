ALTER TABLE public.subscription_platform_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_template text NOT NULL DEFAULT 'Hello {{name}}, your hostel rent of *₹{{amount}}* for Room {{room}} is currently pending.

Due Date: *{{due_date}}*

Please make the payment soon and reply *PAID* once done.

Thank you,
{{hostel_name}}';

UPDATE public.hostels
SET reminder_template = (SELECT whatsapp_reminder_template FROM public.subscription_platform_settings WHERE singleton)
WHERE reminder_template IS NULL;

CREATE OR REPLACE FUNCTION public.apply_default_hostel_reminder_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reminder_template IS NULL THEN
    SELECT whatsapp_reminder_template INTO NEW.reminder_template
    FROM public.subscription_platform_settings WHERE singleton;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_hostel_reminder_template ON public.hostels;
CREATE TRIGGER trg_default_hostel_reminder_template
BEFORE INSERT ON public.hostels
FOR EACH ROW EXECUTE FUNCTION public.apply_default_hostel_reminder_template();
REVOKE ALL ON FUNCTION public.apply_default_hostel_reminder_template() FROM PUBLIC, anon, authenticated;
