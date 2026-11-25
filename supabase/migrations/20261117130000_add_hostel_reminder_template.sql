ALTER TABLE public.hostels
  ADD COLUMN IF NOT EXISTS reminder_template TEXT;

COMMENT ON COLUMN public.hostels.reminder_template IS
  'Owner-editable WhatsApp rent reminder template for this hostel; Powered by Hostelrr is appended by the application.';
