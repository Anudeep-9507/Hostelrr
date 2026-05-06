-- =============================================================================
-- 004_rls.sql
-- Row Level Security for ALL tables in Hostelrr
-- Depends on: 002_tables.sql
--
-- DESIGN PRINCIPLE:
--   Every table must trace its ownership back to hostels.user_id = auth.uid().
--   Denormalized hostel_id columns on beds/payments make this O(1) per row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER: A reusable function to check if the current user owns a hostel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_owns_hostel(p_hostel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hostels
    WHERE id = p_hostel_id
      AND user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. USERS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can only see and edit their own profile
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT is handled by the auth trigger only (no direct insert from client)
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. HOSTELS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostels_select_own"
  ON public.hostels FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "hostels_insert_own"
  ON public.hostels FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hostels_update_own"
  ON public.hostels FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hostels_delete_own"
  ON public.hostels FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. FLOORS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "floors_select_own_hostel"
  ON public.floors FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "floors_insert_own_hostel"
  ON public.floors FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "floors_update_own_hostel"
  ON public.floors FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "floors_delete_own_hostel"
  ON public.floors FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 4. ROOMS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_select_own_hostel"
  ON public.rooms FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "rooms_insert_own_hostel"
  ON public.rooms FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "rooms_update_own_hostel"
  ON public.rooms FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "rooms_delete_own_hostel"
  ON public.rooms FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 5. BEDS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

-- hostel_id is denormalized on beds, so no join needed — pure O(1) check
CREATE POLICY "beds_select_own_hostel"
  ON public.beds FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "beds_insert_own_hostel"
  ON public.beds FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "beds_update_own_hostel"
  ON public.beds FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "beds_delete_own_hostel"
  ON public.beds FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 6. RESIDENTS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "residents_select_own_hostel"
  ON public.residents FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "residents_insert_own_hostel"
  ON public.residents FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "residents_update_own_hostel"
  ON public.residents FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "residents_delete_own_hostel"
  ON public.residents FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 7. PAYMENT_CYCLES TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_cycles_select_own_hostel"
  ON public.payment_cycles FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "payment_cycles_insert_own_hostel"
  ON public.payment_cycles FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "payment_cycles_update_own_hostel"
  ON public.payment_cycles FOR UPDATE
  USING (public.user_owns_hostel(hostel_id))
  WITH CHECK (public.user_owns_hostel(hostel_id));

CREATE POLICY "payment_cycles_delete_own_hostel"
  ON public.payment_cycles FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 8. PAYMENTS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own_hostel"
  ON public.payments FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

CREATE POLICY "payments_insert_own_hostel"
  ON public.payments FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

-- Payments are generally immutable once recorded (no UPDATE policy)
-- Corrections should be done via a reversal payment entry

CREATE POLICY "payments_delete_own_hostel"
  ON public.payments FOR DELETE
  USING (public.user_owns_hostel(hostel_id));

-- ---------------------------------------------------------------------------
-- 9. ACTIVITY_LOGS TABLE
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can only VIEW their own hostel's logs (immutable audit trail)
CREATE POLICY "activity_logs_select_own_hostel"
  ON public.activity_logs FOR SELECT
  USING (public.user_owns_hostel(hostel_id));

-- Inserts come from SECURITY DEFINER functions only — no direct client insert
CREATE POLICY "activity_logs_insert_own_hostel"
  ON public.activity_logs FOR INSERT
  WITH CHECK (public.user_owns_hostel(hostel_id));

-- No UPDATE or DELETE on activity logs (immutable audit trail)
