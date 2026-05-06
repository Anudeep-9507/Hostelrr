-- =============================================================================
-- 001_enums.sql
-- Custom ENUM types for Hostelrr
-- Run FIRST before any table creation
-- =============================================================================

-- Bed occupancy status
CREATE TYPE bed_status AS ENUM (
  'vacant',       -- No resident assigned
  'occupied',     -- Active resident assigned
  'reserved'      -- Assigned but not yet moved in
);

-- Resident lifecycle status
CREATE TYPE resident_status AS ENUM (
  'active',       -- Currently residing
  'left'          -- Vacated
);

-- Payment cycle status
CREATE TYPE payment_status AS ENUM (
  'paid',         -- Fully paid
  'pending',      -- Not yet paid (within due date)
  'late',         -- Past due date, not fully paid
  'partial'       -- Partially paid
);

-- Payment method
CREATE TYPE payment_method AS ENUM (
  'upi',
  'cash'
);

-- Rent cycle type (hostel-level config)
CREATE TYPE rent_cycle_type AS ENUM (
  'monthly_fixed',    -- Due on a fixed day each month (e.g. 1st)
  'joining_based'     -- Due monthly relative to resident's join date
);
