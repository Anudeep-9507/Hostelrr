-- =============================================================================
-- 030_add_onboarding_table.sql
-- Stores onboarding form payload + explicit field mapping snapshots.
-- Does NOT change onboarding workflow; only persists onboarding data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.onboarding (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hostel_id          UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,

  -- Raw onboarding payload from UI
  payload            JSONB NOT NULL,

  -- Flattened onboarding fields for easy querying
  hostel_name        TEXT,
  owner_name         TEXT,
  phone              TEXT,
  city               TEXT,
  state              TEXT,
  country            TEXT,
  pincode            TEXT,
  number_of_floors   INTEGER NOT NULL DEFAULT 1 CHECK (number_of_floors > 0),
  number_of_rooms    INTEGER NOT NULL DEFAULT 0 CHECK (number_of_rooms >= 0),
  rooms_per_floor    JSONB NOT NULL DEFAULT '{}'::JSONB,
  total_beds         INTEGER NOT NULL DEFAULT 0 CHECK (total_beds >= 0),
  sharing_configs    JSONB NOT NULL DEFAULT '[]'::JSONB,
  rent_due_type      TEXT,
  rent_due_date      SMALLINT,
  security_deposit   INTEGER NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),

  -- Declarative map: onboarding field -> source/target table+column snapshot
  field_mappings     JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hostel_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user_id
  ON public.onboarding (user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_created_at
  ON public.onboarding (created_at DESC);

CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON public.onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_select_own" ON public.onboarding;
CREATE POLICY "onboarding_select_own"
  ON public.onboarding FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "onboarding_insert_own" ON public.onboarding;
CREATE POLICY "onboarding_insert_own"
  ON public.onboarding FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_owns_hostel(hostel_id)
  );

DROP POLICY IF EXISTS "onboarding_update_own" ON public.onboarding;
CREATE POLICY "onboarding_update_own"
  ON public.onboarding FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.user_owns_hostel(hostel_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_owns_hostel(hostel_id)
  );

DROP POLICY IF EXISTS "onboarding_delete_own" ON public.onboarding;
CREATE POLICY "onboarding_delete_own"
  ON public.onboarding FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.user_owns_hostel(hostel_id)
  );
