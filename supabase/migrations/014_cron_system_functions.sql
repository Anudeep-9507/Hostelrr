-- =============================================================================
-- 014_cron_system_functions.sql
--
-- Creates system-level functions callable by pg_cron without a user session.
-- Then schedules them.
--
-- Problem: generate_payment_cycles(hostel_id) checks user_owns_hostel() which
-- requires auth.uid() — pg_cron has no user session, so auth.uid() = NULL → fails.
--
-- Fix: create generate_all_payment_cycles() — SECURITY DEFINER, no auth check,
-- iterates ALL hostels internally.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. System wrapper: generate cycles for ALL hostels (no auth check)
--    Called by pg_cron monthly. Same logic as generate_payment_cycles (013)
--    but loops over every hostel without ownership verification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_all_payment_cycles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostel          public.hostels%ROWTYPE;
  v_resident        RECORD;
  v_cycle_count     INTEGER;
  v_new_cycle_start DATE;
  v_new_cycle_end   DATE;
  v_due_date        DATE;
  v_total_created   INTEGER := 0;
BEGIN
  FOR v_hostel IN SELECT * FROM public.hostels LOOP

    FOR v_resident IN
      SELECT r.id, r.monthly_rent, r.join_date
      FROM public.residents r
      WHERE r.hostel_id = v_hostel.id AND r.status = 'active'
    LOOP
      -- Count existing cycles to anchor next cycle to join_date day-of-month
      SELECT COUNT(*) INTO v_cycle_count
      FROM public.payment_cycles
      WHERE resident_id = v_resident.id;

      IF v_hostel.rent_cycle_type = 'joining_based' THEN
        -- Cycle N starts on join_date + N months (no drift)
        v_new_cycle_start := (v_resident.join_date + (v_cycle_count  * INTERVAL '1 month'))::DATE;
        v_new_cycle_end   := (v_new_cycle_start    + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        -- Due = join_date + (N+1) months (same calendar day every month)
        v_due_date        := (v_resident.join_date + ((v_cycle_count + 1) * INTERVAL '1 month'))::DATE;

      ELSE -- monthly_fixed
        SELECT (MAX(cycle_end) + INTERVAL '1 day')::DATE INTO v_new_cycle_start
        FROM public.payment_cycles WHERE resident_id = v_resident.id;

        IF v_new_cycle_start IS NULL THEN
          v_new_cycle_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
        END IF;

        v_new_cycle_end := (DATE_TRUNC('month', v_new_cycle_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_due_date := public._compute_due_date(
          v_new_cycle_start,
          v_hostel.rent_cycle_type,
          v_hostel.rent_due_day,
          v_hostel.grace_period_days
        );
      END IF;

      -- Only generate if cycle starts within next billing window
      IF v_new_cycle_start > (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE THEN
        CONTINUE;
      END IF;

      INSERT INTO public.payment_cycles (
        resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount, status
      )
      VALUES (
        v_resident.id, v_hostel.id, v_new_cycle_start, v_new_cycle_end,
        v_due_date, v_resident.monthly_rent, 'pending'
      )
      ON CONFLICT (resident_id, cycle_start) DO NOTHING;

      IF FOUND THEN
        v_total_created := v_total_created + 1;
      END IF;
    END LOOP;

  END LOOP;

  RETURN v_total_created;
END;
$$;

COMMENT ON FUNCTION public.generate_all_payment_cycles IS
  'System cron function: generates next payment cycle for every active resident '
  'across all hostels. No auth check — intended for pg_cron use only. '
  'joining_based: anchored to join_date day-of-month. Idempotent.';


-- ---------------------------------------------------------------------------
-- 2. Enable pg_cron and pg_net extensions (safe if already enabled)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ---------------------------------------------------------------------------
-- 3. Schedule tag_late_cycles — runs every day at midnight UTC
--    Marks past-due pending/partial cycles as 'late'
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'tag-late-cycles-daily',          -- job name
  '0 0 * * *',                      -- every day at 00:00 UTC
  'SELECT public.tag_late_cycles()'
);


-- ---------------------------------------------------------------------------
-- 4. Schedule generate_all_payment_cycles — runs 1st of month at 00:05 UTC
--    Creates next billing cycle for all active residents across all hostels
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'generate-payment-cycles-monthly', -- job name
  '5 0 1 * *',                       -- 1st of every month at 00:05 UTC
  'SELECT public.generate_all_payment_cycles()'
);
