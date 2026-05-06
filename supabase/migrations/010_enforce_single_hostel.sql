-- 010_enforce_single_hostel.sql
-- Enforce a unique single user can only have a single hostel

-- We add a UNIQUE constraint to the user_id column in the hostels table.
ALTER TABLE public.hostels ADD CONSTRAINT unique_hostel_per_user UNIQUE (user_id);
