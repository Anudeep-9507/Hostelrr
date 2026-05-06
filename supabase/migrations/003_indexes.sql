-- =============================================================================
-- 003_indexes.sql
-- Performance indexes for Hostelrr
-- Depends on: 002_tables.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HOSTELS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostels_user_id
  ON public.hostels (user_id);

-- ---------------------------------------------------------------------------
-- FLOORS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_floors_hostel_id
  ON public.floors (hostel_id);

-- ---------------------------------------------------------------------------
-- ROOMS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rooms_hostel_id
  ON public.rooms (hostel_id);

CREATE INDEX IF NOT EXISTS idx_rooms_floor_id
  ON public.rooms (floor_id);

-- ---------------------------------------------------------------------------
-- BEDS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_beds_room_id
  ON public.beds (room_id);

CREATE INDEX IF NOT EXISTS idx_beds_hostel_id
  ON public.beds (hostel_id);

-- Filter index: quickly find all vacant beds in a hostel
CREATE INDEX IF NOT EXISTS idx_beds_hostel_status
  ON public.beds (hostel_id, status);

-- ---------------------------------------------------------------------------
-- RESIDENTS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_residents_hostel_id
  ON public.residents (hostel_id);

CREATE INDEX IF NOT EXISTS idx_residents_bed_id
  ON public.residents (bed_id);

CREATE INDEX IF NOT EXISTS idx_residents_room_id
  ON public.residents (room_id);

-- Quickly retrieve all active residents
CREATE INDEX IF NOT EXISTS idx_residents_status
  ON public.residents (status);

CREATE INDEX IF NOT EXISTS idx_residents_hostel_status
  ON public.residents (hostel_id, status);

-- Phone lookups (e.g. deduplication checks)
CREATE INDEX IF NOT EXISTS idx_residents_phone
  ON public.residents (phone);

-- ---------------------------------------------------------------------------
-- PAYMENT_CYCLES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payment_cycles_resident_id
  ON public.payment_cycles (resident_id);

CREATE INDEX IF NOT EXISTS idx_payment_cycles_hostel_id
  ON public.payment_cycles (hostel_id);

-- Most critical: filter by status (pending/late) for dashboard + cron jobs
CREATE INDEX IF NOT EXISTS idx_payment_cycles_status
  ON public.payment_cycles (status);

-- Combined: hostel + status for dashboard queries
CREATE INDEX IF NOT EXISTS idx_payment_cycles_hostel_status
  ON public.payment_cycles (hostel_id, status);

-- Due date index for late-detection cron job
CREATE INDEX IF NOT EXISTS idx_payment_cycles_due_date
  ON public.payment_cycles (due_date);

-- Composite for the most common query: "all pending/late cycles for a hostel due before today"
CREATE INDEX IF NOT EXISTS idx_payment_cycles_hostel_due_status
  ON public.payment_cycles (hostel_id, due_date, status);

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_cycle_id
  ON public.payments (cycle_id);

CREATE INDEX IF NOT EXISTS idx_payments_resident_id
  ON public.payments (resident_id);

CREATE INDEX IF NOT EXISTS idx_payments_hostel_id
  ON public.payments (hostel_id);

-- Monthly revenue queries
CREATE INDEX IF NOT EXISTS idx_payments_paid_on
  ON public.payments (paid_on);

CREATE INDEX IF NOT EXISTS idx_payments_hostel_paid_on
  ON public.payments (hostel_id, paid_on);

-- ---------------------------------------------------------------------------
-- ACTIVITY_LOGS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_logs_hostel_id
  ON public.activity_logs (hostel_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs (created_at DESC);

-- JSONB index for searching metadata fields
CREATE INDEX IF NOT EXISTS idx_activity_logs_metadata
  ON public.activity_logs USING gin (metadata);
