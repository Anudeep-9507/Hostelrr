-- Record one resident payment across outstanding cycles as a single transaction.
-- A request key makes retries safe; overpayments are rejected because there is no
-- resident advance-credit ledger in the current product.

CREATE TABLE IF NOT EXISTS public.payment_recording_requests (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  resident_id uuid NOT NULL,
  hostel_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL,
  paid_on date NOT NULL,
  notes text,
  payment_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, request_id),
  FOREIGN KEY (resident_id, hostel_id)
    REFERENCES public.residents (id, hostel_id)
);

ALTER TABLE public.payment_recording_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_recording_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_resident_payment(
  p_request_id uuid,
  p_resident_id uuid,
  p_amount integer,
  p_method public.payment_method,
  p_paid_on date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  p_notes text DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_hostel_id uuid;
  v_request public.payment_recording_requests%ROWTYPE;
  v_cycle public.payment_cycles%ROWTYPE;
  v_cycle_ids uuid[] := ARRAY[]::uuid[];
  v_payment_ids uuid[] := ARRAY[]::uuid[];
  v_outstanding integer := 0;
  v_remaining integer;
  v_allocated integer;
  v_payment_id uuid;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A request ID and positive payment amount are required.' USING ERRCODE = '22023';
  END IF;

  SELECT r.hostel_id INTO v_hostel_id
  FROM public.residents r
  WHERE r.id = p_resident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resident not found.' USING ERRCODE = 'P0009';
  END IF;
  IF NOT public.user_owns_hostel(v_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.payment_recording_requests (
    owner_id, request_id, resident_id, hostel_id, amount, method, paid_on, notes
  ) VALUES (
    v_owner_id, p_request_id, p_resident_id, v_hostel_id, p_amount, p_method,
    COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date), p_notes
  ) ON CONFLICT (owner_id, request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.payment_recording_requests
  WHERE owner_id = v_owner_id AND request_id = p_request_id
  FOR UPDATE;

  IF v_request.resident_id IS DISTINCT FROM p_resident_id
     OR v_request.hostel_id IS DISTINCT FROM v_hostel_id
     OR v_request.amount IS DISTINCT FROM p_amount
     OR v_request.method IS DISTINCT FROM p_method
     OR v_request.paid_on IS DISTINCT FROM COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date)
     OR v_request.notes IS DISTINCT FROM p_notes THEN
    RAISE EXCEPTION 'Request ID was already used with different payment details.'
      USING ERRCODE = '22023';
  END IF;

  IF v_request.payment_ids IS NOT NULL THEN
    RETURN v_request.payment_ids;
  END IF;

  -- Lock all open cycles before computing the balance so concurrent payment
  -- requests for this resident cannot allocate the same outstanding amount.
  FOR v_cycle IN
    SELECT pc.*
    FROM public.payment_cycles pc
    WHERE pc.resident_id = p_resident_id
      AND pc.status IN ('pending', 'partial', 'late', 'overdue')
      AND pc.paid_amount < pc.total_amount
    ORDER BY pc.due_date, pc.cycle_start, pc.id
    FOR UPDATE
  LOOP
    v_cycle_ids := array_append(v_cycle_ids, v_cycle.id);
    v_outstanding := v_outstanding + (v_cycle.total_amount - v_cycle.paid_amount);
  END LOOP;

  IF cardinality(v_cycle_ids) = 0 OR v_outstanding = 0 THEN
    RAISE EXCEPTION 'No outstanding rent balance for this resident.' USING ERRCODE = 'P0008';
  END IF;
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding rent balance.' USING ERRCODE = '22023';
  END IF;

  v_remaining := p_amount;
  FOR v_cycle IN
    SELECT pc.*
    FROM public.payment_cycles pc
    WHERE pc.id = ANY(v_cycle_ids)
    ORDER BY pc.due_date, pc.cycle_start, pc.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_allocated := LEAST(v_remaining, v_cycle.total_amount - v_cycle.paid_amount);
    IF v_allocated <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.payments (
      cycle_id, resident_id, hostel_id, amount, method, paid_on, recorded_by, notes
    ) VALUES (
      v_cycle.id, p_resident_id, v_hostel_id, v_allocated, p_method,
      COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date), v_owner_id, p_notes
    ) RETURNING id INTO v_payment_id;

    v_payment_ids := array_append(v_payment_ids, v_payment_id);
    v_remaining := v_remaining - v_allocated;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Payment allocation did not settle the requested amount.';
  END IF;

  UPDATE public.payment_recording_requests
  SET payment_ids = v_payment_ids
  WHERE owner_id = v_owner_id AND request_id = p_request_id;

  PERFORM public._log_activity(
    v_hostel_id,
    'payment_recorded',
    'resident',
    p_resident_id,
    jsonb_build_object(
      'amount', p_amount,
      'method', p_method,
      'paid_on', COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date),
      'payment_ids', v_payment_ids
    )
  );

  RETURN v_payment_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_resident_payment(uuid, uuid, integer, public.payment_method, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_resident_payment(uuid, uuid, integer, public.payment_method, date, text)
  TO authenticated;

-- Rent payments now enter through the idempotent resident-level allocation RPC.
REVOKE ALL ON FUNCTION public.mark_payment(uuid, integer, public.payment_method, text, date, text)
  FROM PUBLIC, anon, authenticated;
