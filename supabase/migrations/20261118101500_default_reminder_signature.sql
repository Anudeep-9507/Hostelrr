ALTER TABLE public.subscription_platform_settings
  ALTER COLUMN whatsapp_reminder_template SET DEFAULT E'Hello {{name}}, your hostel rent of *₹{{amount}}* for Room {{room}} is currently pending.\n\nDue Date: *{{due_date}}*\n\nPlease make the payment soon and reply *PAID* once done.\n\nThank you,\n{{hostel_name}}\n\nPowered by Hostelrr';

UPDATE public.subscription_platform_settings
SET whatsapp_reminder_template = E'Hello {{name}}, your hostel rent of *₹{{amount}}* for Room {{room}} is currently pending.\n\nDue Date: *{{due_date}}*\n\nPlease make the payment soon and reply *PAID* once done.\n\nThank you,\n{{hostel_name}}\n\nPowered by Hostelrr'
WHERE singleton AND whatsapp_reminder_template NOT LIKE E'%\nPowered by Hostelrr';

UPDATE public.hostels
SET reminder_template = (SELECT whatsapp_reminder_template FROM public.subscription_platform_settings WHERE singleton)
WHERE reminder_template IS NULL;
