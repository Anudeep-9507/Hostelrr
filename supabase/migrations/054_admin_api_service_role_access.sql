-- The browser roles retain no access to subscription administration tables. The
-- server-side Edge Function uses service_role and receives only the operations it
-- needs for its live dashboard and audit log.
GRANT SELECT ON TABLE public.hostel_subscriptions TO service_role;
GRANT SELECT ON TABLE public.subscription_plans TO service_role;
GRANT SELECT ON TABLE public.subscription_payment_submissions TO service_role;
GRANT SELECT, INSERT ON TABLE public.subscription_admin_audit TO service_role;
