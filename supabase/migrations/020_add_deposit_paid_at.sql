-- Add deposit_paid_at timestamp to track when security deposit was marked as paid
ALTER TABLE public.residents
ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.residents.deposit_paid_at IS 'Timestamp when security deposit was marked as paid. NULL if not yet paid.';
