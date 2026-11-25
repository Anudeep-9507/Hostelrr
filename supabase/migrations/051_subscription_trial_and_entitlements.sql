-- Hostel subscription MVP: per-hostel trial, configurable bed tiers, manual UPI review,
-- and read-only enforcement. Prices and UPI details are intentionally not seeded.

CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  min_beds integer NOT NULL CHECK (min_beds > 0),
  max_beds integer CHECK (max_beds IS NULL OR max_beds >= min_beds),
  amount_inr integer NOT NULL CHECK (amount_inr > 0),
  billing_days integer NOT NULL DEFAULT 30 CHECK (billing_days BETWEEN 1 AND 366),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hostel_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id uuid NOT NULL UNIQUE REFERENCES public.hostels(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'expired', 'cancelled')),
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trial_ends_at > trial_started_at),
  CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start)
);

CREATE TABLE public.subscription_payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.hostel_subscriptions(id) ON DELETE CASCADE,
  hostel_id uuid NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  billing_days integer NOT NULL CHECK (billing_days BETWEEN 1 AND 366),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  claimed_amount_inr integer NOT NULL CHECK (claimed_amount_inr > 0),
  payment_reference text NOT NULL CHECK (length(trim(payment_reference)) BETWEEN 3 AND 160),
  claimed_paid_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscription_one_pending_submission_per_hostel
  ON public.subscription_payment_submissions(hostel_id) WHERE status = 'pending';
CREATE INDEX subscription_payment_queue_idx
  ON public.subscription_payment_submissions(status, created_at DESC);

CREATE TABLE public.subscription_platform_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  upi_vpa text,
  payee_name text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.subscription_platform_settings(singleton) VALUES (true);

CREATE TABLE public.subscription_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_admin_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_plans, public.hostel_subscriptions,
  public.subscription_payment_submissions, public.subscription_platform_settings,
  public.subscription_admin_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'platform_role', '') = 'admin';
$function$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hostel_subscription_can_write(p_hostel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hostel_subscriptions s
    WHERE s.hostel_id = p_hostel_id
      AND (
        (s.status IN ('trialing', 'active') AND s.trial_ends_at > now())
        OR (s.status = 'active'
            AND s.current_period_start <= now()
            AND s.current_period_end > now())
      )
  );
$function$;
REVOKE ALL ON FUNCTION public.hostel_subscription_can_write(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hostel_subscription_can_write(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_can_write_hostel(p_hostel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.user_owns_hostel(p_hostel_id)
     AND public.hostel_subscription_can_write(p_hostel_id);
$function$;
REVOKE ALL ON FUNCTION public.user_can_write_hostel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_write_hostel(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_hostel_subscription_trial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.hostel_subscriptions(hostel_id, status, trial_started_at, trial_ends_at)
  VALUES (NEW.id, 'trialing', now(), now() + interval '14 days')
  ON CONFLICT (hostel_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.start_hostel_subscription_trial() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_start_hostel_subscription_trial ON public.hostels;
CREATE TRIGGER trg_start_hostel_subscription_trial
AFTER INSERT ON public.hostels
FOR EACH ROW EXECUTE FUNCTION public.start_hostel_subscription_trial();

-- Existing hostels receive a 14-day transition trial from rollout so enabling
-- enforcement does not immediately lock out established accounts.
INSERT INTO public.hostel_subscriptions(hostel_id, status, trial_started_at, trial_ends_at)
SELECT h.id, 'trialing', now(), now() + interval '14 days'
FROM public.hostels h
ON CONFLICT (hostel_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_hostel_subscription(p_hostel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'subscription', to_jsonb(s),
    'writable', public.hostel_subscription_can_write(p_hostel_id),
    'bed_count', h.total_beds,
    'matched_plan', (
      SELECT to_jsonb(p) FROM public.subscription_plans p
      WHERE p.active AND h.total_beds >= p.min_beds
        AND (p.max_beds IS NULL OR h.total_beds <= p.max_beds)
      ORDER BY p.min_beds DESC LIMIT 1
    ),
    'pending_submission', (
      SELECT to_jsonb(sp) FROM public.subscription_payment_submissions sp
      WHERE sp.hostel_id = p_hostel_id AND sp.status = 'pending'
      ORDER BY sp.created_at DESC LIMIT 1
    ),
    'payment_settings', (SELECT jsonb_build_object('upi_vpa', upi_vpa, 'payee_name', payee_name)
                         FROM public.subscription_platform_settings WHERE singleton)
  ) INTO v_result
  FROM public.hostels h
  JOIN public.hostel_subscriptions s ON s.hostel_id = h.id
  WHERE h.id = p_hostel_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_subscription_payment(
  p_hostel_id uuid,
  p_payment_reference text,
  p_claimed_paid_on date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date)
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_subscription public.hostel_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_beds integer;
  v_submission_id uuid;
BEGIN
  IF NOT public.user_owns_hostel(p_hostel_id) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_subscription FROM public.hostel_subscriptions
  WHERE hostel_id = p_hostel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not initialized.'; END IF;
  SELECT total_beds INTO v_beds FROM public.hostels WHERE id = p_hostel_id;
  SELECT * INTO v_plan FROM public.subscription_plans p
  WHERE p.active AND v_beds >= p.min_beds AND (p.max_beds IS NULL OR v_beds <= p.max_beds)
  ORDER BY p.min_beds DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription price is configured for % beds.', v_beds USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_payment_reference, ''))) < 3 OR length(trim(p_payment_reference)) > 160 THEN
    RAISE EXCEPTION 'Enter a valid UPI transaction reference.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.subscription_payment_submissions(
    subscription_id, hostel_id, plan_id, billing_days, submitted_by, claimed_amount_inr,
    payment_reference, claimed_paid_on
  ) VALUES (
    v_subscription.id, p_hostel_id, v_plan.id, v_plan.billing_days, auth.uid(), v_plan.amount_inr,
    trim(p_payment_reference), coalesce(p_claimed_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ) RETURNING id INTO v_submission_id;
  RETURN v_submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_subscription_plan(
  p_name text, p_min_beds integer, p_max_beds integer,
  p_amount_inr integer, p_billing_days integer DEFAULT 30,
  p_plan_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF p_min_beds <= 0 OR (p_max_beds IS NOT NULL AND p_max_beds < p_min_beds)
     OR p_amount_inr <= 0 OR p_billing_days NOT BETWEEN 1 AND 366 THEN
    RAISE EXCEPTION 'Invalid plan values.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.subscription_plans p
    WHERE p.active AND p.id IS DISTINCT FROM p_plan_id
      AND coalesce(p_max_beds, 2147483647) >= p.min_beds
      AND coalesce(p.max_beds, 2147483647) >= p_min_beds
  ) THEN RAISE EXCEPTION 'Active bed ranges cannot overlap.' USING ERRCODE = '23505'; END IF;

  IF p_plan_id IS NULL THEN
    INSERT INTO public.subscription_plans(name,min_beds,max_beds,amount_inr,billing_days)
    VALUES (trim(p_name),p_min_beds,p_max_beds,p_amount_inr,p_billing_days) RETURNING id INTO v_id;
  ELSE
    UPDATE public.subscription_plans SET name=trim(p_name),min_beds=p_min_beds,max_beds=p_max_beds,
      amount_inr=p_amount_inr,billing_days=p_billing_days,updated_at=now()
    WHERE id=p_plan_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  END IF;
  INSERT INTO public.subscription_admin_audit(admin_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'plan_saved','subscription_plan',v_id,
          jsonb_build_object('name',trim(p_name),'min_beds',p_min_beds,'max_beds',p_max_beds,'amount_inr',p_amount_inr,'billing_days',p_billing_days));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_payment_settings(p_upi_vpa text, p_payee_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(p_upi_vpa,''))) > 120 OR length(trim(coalesce(p_payee_name,''))) > 120 THEN
    RAISE EXCEPTION 'Payment settings are too long.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.subscription_platform_settings SET upi_vpa=nullif(trim(p_upi_vpa),''),
    payee_name=nullif(trim(p_payee_name),''),updated_by=auth.uid(),updated_at=now() WHERE singleton;
  INSERT INTO public.subscription_admin_audit(admin_id,action,entity_type,metadata)
  VALUES(auth.uid(),'payment_settings_saved','platform',jsonb_build_object('upi_configured',nullif(trim(p_upi_vpa),'') IS NOT NULL));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_subscription_payment_settings()
RETURNS TABLE(upi_vpa text,payee_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT s.upi_vpa,s.payee_name FROM public.subscription_platform_settings s WHERE s.singleton;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_plan_active(p_plan_id uuid,p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  UPDATE public.subscription_plans SET active=p_active,updated_at=now() WHERE id=p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  INSERT INTO public.subscription_admin_audit(admin_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),CASE WHEN p_active THEN 'plan_activated' ELSE 'plan_deactivated' END,
    'subscription_plan',p_plan_id,'{}');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_subscription_plans()
RETURNS TABLE(id uuid,name text,min_beds integer,max_beds integer,amount_inr integer,billing_days integer,active boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id,p.name,p.min_beds,p.max_beds,p.amount_inr,p.billing_days,p.active
    FROM public.subscription_plans p ORDER BY p.min_beds,p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_subscription_payments()
RETURNS TABLE(
  id uuid, hostel_id uuid, hostel_name text, owner_id uuid, owner_email text,
  plan_name text, claimed_amount_inr integer, payment_reference text,
  claimed_paid_on date, status text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT sp.id,h.id,h.name,h.user_id,u.email,p.name,sp.claimed_amount_inr,
      sp.payment_reference,sp.claimed_paid_on,sp.status,sp.created_at
    FROM public.subscription_payment_submissions sp
    JOIN public.hostels h ON h.id=sp.hostel_id
    JOIN public.users u ON u.id=h.user_id
    JOIN public.subscription_plans p ON p.id=sp.plan_id
    ORDER BY (sp.status='pending') DESC,sp.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_subscription_payment(
  p_submission_id uuid, p_approve boolean, p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_submission public.subscription_payment_submissions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_start timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_submission FROM public.subscription_payment_submissions
  WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found.'; END IF;
  IF v_submission.status <> 'pending' THEN RAISE EXCEPTION 'Submission has already been reviewed.' USING ERRCODE = '22023'; END IF;
  IF NOT p_approve AND length(trim(coalesce(p_reason,''))) < 3 THEN
    RAISE EXCEPTION 'A rejection reason is required.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.subscription_payment_submissions SET
    status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewer_id=auth.uid(),reviewed_at=now(),review_reason=nullif(trim(p_reason),'')
  WHERE id=p_submission_id;

  IF p_approve THEN
    SELECT greatest(now(),coalesce(s.current_period_end,now()),s.trial_ends_at)
      INTO v_start FROM public.hostel_subscriptions s WHERE id=v_submission.subscription_id FOR UPDATE;
    UPDATE public.hostel_subscriptions SET status='active',plan_id=v_submission.plan_id,
      current_period_start=v_start,
      current_period_end=v_start + make_interval(days => v_submission.billing_days),updated_at=now()
    WHERE id=v_submission.subscription_id;
  END IF;

  INSERT INTO public.subscription_admin_audit(admin_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),CASE WHEN p_approve THEN 'payment_approved' ELSE 'payment_rejected' END,
    'subscription_payment',p_submission_id,jsonb_build_object('reason',nullif(trim(p_reason),'')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_extend_hostel_subscription(p_hostel_id uuid, p_days integer, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_end timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF p_days NOT BETWEEN 1 AND 365 OR length(trim(coalesce(p_reason,''))) < 3 THEN
    RAISE EXCEPTION 'Provide 1–365 extension days and a reason.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hostel_subscriptions SET status='active',
    current_period_start=coalesce(current_period_start,now()),
    current_period_end=greatest(now(),coalesce(current_period_end,now())) + make_interval(days => p_days),
    updated_at=now()
  WHERE hostel_id=p_hostel_id RETURNING current_period_end INTO v_end;
  IF v_end IS NULL THEN RAISE EXCEPTION 'Subscription not found.'; END IF;
  INSERT INTO public.subscription_admin_audit(admin_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'subscription_extended','hostel_subscription',p_hostel_id,
    jsonb_build_object('days',p_days,'reason',trim(p_reason),'new_end',v_end));
END;
$function$;

-- RLS remains readable after expiry; every direct owner write is gated by entitlement.
DROP POLICY IF EXISTS hostels_update_own ON public.hostels;
CREATE POLICY hostels_update_own ON public.hostels FOR UPDATE
  USING (user_id=auth.uid() AND public.hostel_subscription_can_write(id))
  WITH CHECK (user_id=auth.uid() AND public.hostel_subscription_can_write(id));
DROP POLICY IF EXISTS hostels_delete_own ON public.hostels;
CREATE POLICY hostels_delete_own ON public.hostels FOR DELETE
  USING (user_id=auth.uid() AND public.hostel_subscription_can_write(id));

DO $gate_owner_writes$
DECLARE v_table text; v_action text; v_policy text; v_old_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['floors','rooms','beds','residents','bed_layout_templates'] LOOP
    FOREACH v_action IN ARRAY ARRAY['insert','update','delete'] LOOP
      v_policy := v_table || '_' || v_action || '_subscription_gate';
      v_old_policy := CASE WHEN v_table='bed_layout_templates'
        THEN v_table || '_' || v_action
        ELSE v_table || '_' || v_action || '_own_hostel' END;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',v_old_policy,v_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',v_policy,v_table);
      IF v_action='insert' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.user_can_write_hostel(hostel_id))',v_policy,v_table);
      ELSIF v_action='update' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.user_can_write_hostel(hostel_id)) WITH CHECK (public.user_can_write_hostel(hostel_id))',v_policy,v_table);
      ELSIF v_action='delete' AND v_table='residents' THEN
        NULL; -- Resident history is preserved through archive_resident, never hard delete.
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.user_can_write_hostel(hostel_id))',v_policy,v_table);
      END IF;
    END LOOP;
  END LOOP;
END;
$gate_owner_writes$;

DROP POLICY IF EXISTS join_requests_update_own_hostel ON public.join_requests;
CREATE POLICY join_requests_update_own_hostel ON public.join_requests FOR UPDATE
  USING (public.user_can_write_hostel(hostel_id)) WITH CHECK (public.user_can_write_hostel(hostel_id));
DROP POLICY IF EXISTS onboarding_insert_own ON public.onboarding;
CREATE POLICY onboarding_insert_own ON public.onboarding FOR INSERT
  WITH CHECK (user_id=auth.uid() AND public.user_can_write_hostel(hostel_id));
DROP POLICY IF EXISTS onboarding_update_own ON public.onboarding;
CREATE POLICY onboarding_update_own ON public.onboarding FOR UPDATE
  USING (user_id=auth.uid() AND public.user_can_write_hostel(hostel_id))
  WITH CHECK (user_id=auth.uid() AND public.user_can_write_hostel(hostel_id));
DROP POLICY IF EXISTS onboarding_delete_own ON public.onboarding;
CREATE POLICY onboarding_delete_own ON public.onboarding FOR DELETE
  USING (user_id=auth.uid() AND public.user_can_write_hostel(hostel_id));
DROP POLICY IF EXISTS activity_logs_insert_own_hostel ON public.activity_logs;
CREATE POLICY activity_logs_insert_own_hostel ON public.activity_logs FOR INSERT
  WITH CHECK (public.user_can_write_hostel(hostel_id));

-- Stop document uploads/deletes after expiry while keeping public join-request uploads.
DROP POLICY IF EXISTS "Owner can insert resident documents" ON storage.objects;
DROP POLICY IF EXISTS hostelrr_documents_insert ON storage.objects;
CREATE POLICY hostelrr_documents_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id='hostelrr-documents' AND (
      (split_part(name,'/',1)='residents' AND public.user_can_write_hostel(public.storage_object_hostel_id(name)))
      OR (split_part(name,'/',1)='join-requests' AND EXISTS (
        SELECT 1 FROM public.hostels h WHERE h.id=public.storage_object_hostel_id(name)
      ))
    )
  );
DROP POLICY IF EXISTS hostelrr_documents_owner_delete_by_path ON storage.objects;
CREATE POLICY hostelrr_documents_owner_delete_by_path ON storage.objects FOR DELETE
  USING (bucket_id='hostelrr-documents' AND public.user_can_write_hostel(public.storage_object_hostel_id(name)));

-- Gate owner-checked SECURITY DEFINER mutations; keep read RPCs available.
DO $gate_owner_rpcs$
DECLARE v_signature text; v_oid oid; v_definition text; v_rewritten text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.add_resident(uuid, uuid, uuid, text, text, integer, date, integer, boolean, integer, text, text, text, text, text, boolean, boolean, date)',
    'public.approve_join_request(uuid, uuid, uuid, integer, date, integer, boolean, integer, text)',
    'public.archive_resident(uuid, text)',
    'public.confirm_move_in(uuid, date)',
    'public.generate_payment_cycles(uuid)',
    'public.move_bed(uuid, uuid, uuid)',
    'public.record_resident_payment(uuid, uuid, integer, public.payment_method, date, text)',
    'public.reject_join_request(uuid, text)',
    'public.restore_resident(uuid)',
    'public.vacate_resident(uuid, date, text)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected owner RPC missing: %',v_signature; END IF;
    v_definition := pg_get_functiondef(v_oid);
    v_rewritten := replace(v_definition,'public.user_owns_hostel(','public.user_can_write_hostel(');
    IF v_rewritten=v_definition THEN
      RAISE EXCEPTION 'No owner guard found in %, refusing subscription gate rewrite',v_signature;
    END IF;
    EXECUTE v_rewritten;
  END LOOP;
END;
$gate_owner_rpcs$;

-- Subscription APIs
REVOKE ALL ON FUNCTION public.get_hostel_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hostel_subscription(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_subscription_payment(uuid,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment(uuid,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_upsert_subscription_plan(text,integer,integer,integer,integer,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription_payment_settings(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_subscription_payment_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription_plan_active(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_subscription_payments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_subscription_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_subscription_payment(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_extend_hostel_subscription(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_subscription_plan(text,integer,integer,integer,integer,uuid),
  public.admin_set_subscription_payment_settings(text,text),
  public.admin_get_subscription_payment_settings(),
  public.admin_set_subscription_plan_active(uuid,boolean),
  public.admin_list_subscription_plans(),
  public.admin_list_subscription_payments(),
  public.admin_review_subscription_payment(uuid,boolean,text),
  public.admin_extend_hostel_subscription(uuid,integer,text)
  TO authenticated;

COMMENT ON TABLE public.hostel_subscriptions IS 'One subscription and 14-day trial per billable hostel. Rent payments remain separate.';
COMMENT ON TABLE public.subscription_payment_submissions IS 'Manual UPI subscription payment claims awaiting admin review.';
