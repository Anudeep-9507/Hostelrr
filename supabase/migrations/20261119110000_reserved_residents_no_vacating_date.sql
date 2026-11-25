-- Reserved residents have not moved in, so they cannot have a planned vacating date.
UPDATE public.residents
SET vacating_date = NULL,
    updated_at = now()
WHERE status = 'reserved'::public.resident_status
  AND vacating_date IS NOT NULL;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_reserved_no_vacating_date
  CHECK (status <> 'reserved'::public.resident_status OR vacating_date IS NULL);
