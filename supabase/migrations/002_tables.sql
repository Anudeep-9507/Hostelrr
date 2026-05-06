-- =============================================================================
-- 002_tables.sql
-- Full normalized schema for Hostelrr
-- Depends on: 001_enums.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. USERS
--    One-to-one mirror of auth.users. Populated via trigger on signup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT UNIQUE,
  email           TEXT UNIQUE NOT NULL,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Application-level user profiles mirroring auth.users.';

-- ---------------------------------------------------------------------------
-- 2. HOSTELS
--    Each owner (user) can own multiple hostels.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  address             TEXT,
  city                TEXT NOT NULL,
  state               TEXT NOT NULL,
  pincode             TEXT,
  phone               TEXT,

  -- Rent configuration
  rent_cycle_type     rent_cycle_type NOT NULL DEFAULT 'monthly_fixed',
  rent_due_day        SMALLINT CHECK (rent_due_day BETWEEN 1 AND 28), -- fixed day (1–28) for monthly_fixed
  grace_period_days   SMALLINT NOT NULL DEFAULT 5 CHECK (grace_period_days >= 0),
  security_deposit    INTEGER NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),

  -- Derived counts (kept as computed columns, not stored)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.hostels IS 'Hostel properties owned by users.';
COMMENT ON COLUMN public.hostels.rent_due_day IS 'Day of month rent is due; only relevant for monthly_fixed cycle type.';

-- ---------------------------------------------------------------------------
-- 3. FLOORS
--    A hostel is divided into floors. Optional but first-class.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.floors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  floor_number    SMALLINT NOT NULL CHECK (floor_number >= 0),
  label           TEXT,                               -- e.g. "Ground Floor", "1st Floor"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hostel_id, floor_number)                   -- No two floors with same number per hostel
);

COMMENT ON TABLE public.floors IS 'Floors within a hostel building.';

-- ---------------------------------------------------------------------------
-- 4. ROOMS
--    Rooms belong to a floor (and transitively to a hostel).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  floor_id        UUID REFERENCES public.floors(id) ON DELETE SET NULL,  -- optional floor assignment
  room_number     TEXT NOT NULL,
  base_rent       INTEGER CHECK (base_rent >= 0),     -- Default rent for this room's sharing type
  layout_id       TEXT,                               -- References a bed layout template (frontend-managed)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hostel_id, room_number)                    -- Room numbers unique per hostel
);

COMMENT ON TABLE public.rooms IS 'Rooms within a hostel floor.';

-- ---------------------------------------------------------------------------
-- 5. BEDS
--    Beds are the atomic unit of occupancy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE, -- denormalized for RLS efficiency
  label           TEXT NOT NULL,                       -- 'A', 'B', 'C' ...
  status          bed_status NOT NULL DEFAULT 'vacant',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (room_id, label)                             -- Bed labels unique per room
);

COMMENT ON TABLE public.beds IS 'Individual beds within rooms.';
COMMENT ON COLUMN public.beds.hostel_id IS 'Denormalized from room for efficient RLS and query performance.';

-- ---------------------------------------------------------------------------
-- 6. RESIDENTS
--    A resident occupies exactly ONE bed at a time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.residents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id             UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  room_id               UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  bed_id                UUID NOT NULL REFERENCES public.beds(id) ON DELETE RESTRICT,

  -- Personal details
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  emergency_contact     TEXT,
  aadhar_number         TEXT,
  email                 TEXT,

  -- Tenancy
  join_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_leave_date   DATE,                          -- optional
  actual_leave_date     DATE,

  -- Financial
  monthly_rent          INTEGER NOT NULL CHECK (monthly_rent > 0),
  security_deposit      INTEGER NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  is_deposit_paid       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Stay duration (user configurable)
  stay_duration_days    INTEGER CHECK (stay_duration_days > 0),

  -- Status
  status                resident_status NOT NULL DEFAULT 'active',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.residents IS 'People residing in the hostel.';

-- Enforce: Only ONE active resident per bed at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_bed
  ON public.residents (bed_id)
  WHERE status = 'active';

-- Enforce: Resident phone should be unique per hostel (not globally, different hostels may share)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_resident_phone_per_hostel
  ON public.residents (hostel_id, phone)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 7. PAYMENT_CYCLES
--    One cycle per billing period per resident.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_cycles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id     UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,  -- denormalized

  cycle_start     DATE NOT NULL,
  cycle_end       DATE NOT NULL,
  due_date        DATE NOT NULL,

  total_amount    INTEGER NOT NULL CHECK (total_amount > 0),
  paid_amount     INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),

  status          payment_status NOT NULL DEFAULT 'pending',

  notes           TEXT,                               -- e.g. 'Partial rent for first month'

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dates CHECK (cycle_end >= cycle_start),
  CONSTRAINT chk_paid_not_exceed_total CHECK (paid_amount <= total_amount + 1000) -- allow small overpayments (deposit adjustments)
);

COMMENT ON TABLE public.payment_cycles IS 'Monthly billing periods for each resident.';

-- No duplicate cycles for same resident in same period
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_cycle_per_resident
  ON public.payment_cycles (resident_id, cycle_start);

-- ---------------------------------------------------------------------------
-- 8. PAYMENTS
--    Individual payment transactions within a cycle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            UUID NOT NULL REFERENCES public.payment_cycles(id) ON DELETE CASCADE,
  resident_id         UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  hostel_id           UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,  -- denormalized

  amount              INTEGER NOT NULL CHECK (amount > 0),
  method              payment_method NOT NULL,
  transaction_ref     TEXT,                           -- UPI transaction ID or cash receipt ref
  paid_on             DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by         UUID REFERENCES public.users(id), -- which admin recorded this
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payments IS 'Individual payment transactions within billing cycles.';

-- ---------------------------------------------------------------------------
-- 9. ACTIVITY_LOGS
--    Immutable audit trail of all key actions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id       UUID NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  performed_by    UUID REFERENCES public.users(id),  -- NULL if system-generated

  action          TEXT NOT NULL,                      -- e.g. 'resident_added', 'payment_recorded'
  entity_type     TEXT,                               -- 'resident', 'room', 'payment', etc.
  entity_id       UUID,                               -- ID of the affected entity
  metadata        JSONB DEFAULT '{}',                 -- flexible key-value details
  ip_address      INET,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.activity_logs IS 'Immutable audit trail for all hostel operations.';

-- ---------------------------------------------------------------------------
-- 10. UPDATED_AT TRIGGER FUNCTION
--     Auto-update `updated_at` column on any row modification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables that have updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_hostels_updated_at
  BEFORE UPDATE ON public.hostels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_residents_updated_at
  BEFORE UPDATE ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payment_cycles_updated_at
  BEFORE UPDATE ON public.payment_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. AUTO-CREATE USER PROFILE ON SIGNUP
--     Supabase triggers this when a new user signs up via auth.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
