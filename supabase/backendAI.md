# Hostelrr — Backend Capabilities Reference (backendAI.md)

> This document is for AI models to quickly understand the complete backend capabilities of the Hostelrr Supabase backend without reading migration files.

---

## Project

- **Supabase Project**: `hostelrr-prod`
- **Project ID**: `lfgouwvdwxlkirqqlwmt`
- **Region**: `ap-south-1` (Mumbai)
- **Status**: ACTIVE_HEALTHY
- **Postgres Engine**: 17

---

## Database Schema (9 Tables)

### `public.users`
- Mirrors `auth.users` (1-to-1). Auto-created via trigger on signup.
- Key fields: `id` (UUID = auth.users.id), `name`, `phone`, `email`, `avatar_url`

### `public.hostels`
- Owned by a user. One user can have multiple hostels.
- Key fields: `id`, `user_id`, `name`, `city`, `state`, `address`, `phone`
- Config: `rent_cycle_type` (enum: `monthly_fixed` | `joining_based`), `rent_due_day` (1–28), `grace_period_days`, `security_deposit`

### `public.floors`
- Floors within a hostel. Unique `(hostel_id, floor_number)`.
- Fields: `id`, `hostel_id`, `floor_number`, `label` (e.g. "Ground Floor")

### `public.rooms`
- Rooms on a floor. Unique `(hostel_id, room_number)`.
- Fields: `id`, `hostel_id`, `floor_id`, `room_number`, `base_rent`, `layout_id`

### `public.beds`
- Atomic unit of occupancy. Unique label per room `(room_id, label)`.
- Fields: `id`, `room_id`, `hostel_id` (denormalized for RLS), `label` (A/B/C...), `status` (enum: `vacant` | `occupied` | `reserved`)

### `public.residents`
- Active or past residents. One active resident per bed enforced.
- Fields: `id`, `hostel_id`, `room_id`, `bed_id`, `name`, `phone`, `emergency_contact`, `aadhar_number`, `email`, `join_date`, `expected_leave_date`, `actual_leave_date`, `monthly_rent`, `security_deposit`, `is_deposit_paid`, `stay_duration_days`, `status` (enum: `active` | `left`)
- Constraints: `idx_unique_active_bed` (only 1 active resident per bed), `idx_unique_resident_phone_per_hostel` (unique phone per hostel for active residents)

### `public.payment_cycles`
- One billing cycle per period per resident. Unique `(resident_id, cycle_start)`.
- Fields: `id`, `resident_id`, `hostel_id`, `cycle_start`, `cycle_end`, `due_date`, `total_amount`, `paid_amount`, `status` (enum: `pending` | `paid` | `late` | `partial`), `notes`

### `public.payments`
- Individual payment transactions within a cycle.
- Fields: `id`, `cycle_id`, `resident_id`, `hostel_id`, `amount`, `method` (enum: `upi` | `cash`), `transaction_ref`, `paid_on`, `recorded_by`, `notes`

### `public.activity_logs`
- Immutable audit trail. Never deleted.
- Fields: `id`, `hostel_id`, `performed_by`, `action`, `entity_type`, `entity_id`, `metadata` (JSONB), `created_at`

---

## RPC Functions (Public API)

All callable via: `supabase.rpc('function_name', { param: value })`
All are `SECURITY DEFINER` — they validate `auth.uid()` owns the hostel before operating.

### `add_resident(p_hostel_id, p_room_id, p_bed_id, p_name, p_phone, p_monthly_rent, p_join_date?, p_security_deposit?, p_is_deposit_paid?, p_stay_duration_days?, p_emergency_contact?, p_aadhar_number?, p_email?)`
- **Returns**: UUID of new resident
- Atomically: validates bed ownership, checks phone uniqueness, inserts resident, creates first payment cycle (pro-rated for monthly_fixed if joining mid-month), logs activity.
- Triggers: `_guard_bed_availability` (BEFORE), `_on_resident_inserted` (AFTER → marks bed occupied)

### `mark_payment(p_cycle_id, p_amount, p_method, p_transaction_ref?, p_paid_on?, p_notes?)`
- **Returns**: UUID of new payment
- Validates cycle ownership, caps overpayment at `total_amount + ₹1000`, inserts payment, trigger auto-updates `paid_amount` and `status` on cycle.
- Trigger: `_on_payment_inserted` → `_refresh_cycle_status`

### `move_bed(p_resident_id, p_new_bed_id, p_new_room_id)`
- **Returns**: void
- Atomically frees old bed, occupies new bed, updates resident's `bed_id` + `room_id`.

### `vacate_resident(p_resident_id, p_leave_date?, p_notes?)`
- **Returns**: void
- Sets `status='left'`, records `actual_leave_date`. Trigger frees bed automatically.
- Trigger: `_on_resident_status_changed` (UPDATE status='left' → frees bed)

### `get_dashboard_stats(p_hostel_id)`
- **Returns**: JSONB with: `total_beds`, `occupied_beds`, `vacant_beds`, `reserved_beds`, `occupancy_rate`, `active_residents`, `pending_amount`, `collected_this_month`, `late_cycles`

### `get_resident_profile(p_resident_id)`
- **Returns**: Full JSONB profile: resident details + room/bed info + all payment_cycles with nested payments

### `generate_payment_cycles(p_hostel_id)`
- **Returns**: INTEGER (count of cycles created)
- Monthly cron: generates next billing cycle for all active residents. Idempotent (ON CONFLICT DO NOTHING).
- Intended: run on 28th of each month via pg_cron or Edge Function.

### `tag_late_cycles()`
- **Returns**: INTEGER (count updated)
- Daily cron: marks all past-due `pending`/`partial` cycles as `late`.
- Intended: run daily at 00:01 via pg_cron or Edge Function.

---

## Trigger Pipeline

```
INSERT resident → _guard_bed_availability (BEFORE) → blocks if bed occupied
               → _on_resident_inserted (AFTER) → marks bed 'occupied'

INSERT payment  → _on_payment_inserted (AFTER) → updates cycle.paid_amount
                                               → _refresh_cycle_status → recalculates status

UPDATE resident.status='left' → _on_resident_status_changed → sets bed 'vacant'

DELETE room → _guard_room_deletion (BEFORE) → RAISES P0002 if occupied beds exist
```

---

## Error Codes

| Code | Meaning |
|---|---|
| `P0001` | Bed is already occupied |
| `P0002` | Cannot delete room — has occupied beds |
| `P0003` | Hostel not found |
| `P0004` | Bed does not belong to this room/hostel |
| `P0005` | Duplicate phone number in hostel |
| `P0006` | Payment cycle not found |
| `P0007` | Payment amount must be positive |
| `P0008` | Cycle is already fully paid |
| `P0009` | Active resident not found |
| `P0010` | Target bed not found |
| `P0011` | Bed belongs to different hostel |
| `P0012` | Bed does not belong to specified room |
| `P0013` | Resident is already in that bed |

---

## Row Level Security

Every table is protected by RLS. All policies rely on a `user_owns_hostel(hostel_id)` SECURITY DEFINER helper that does an O(1) check:

```sql
SELECT EXISTS (SELECT 1 FROM public.hostels WHERE id = p_hostel_id AND user_id = auth.uid())
```

- `users`: owner can read/update own row only
- `hostels`: owner CRUD on own hostels
- `floors`, `rooms`, `beds`, `residents`, `payment_cycles`, `payments`, `activity_logs`: all scoped to `user_owns_hostel(hostel_id)`

---

## Frontend API Layer (`src/lib/api.ts`)

### Auth
- `signUp(email, password, name, phone?)` → Supabase auth signup + triggers `handle_new_user` DB trigger
- `signIn(email, password)` → Supabase auth login
- `signOut()` → Supabase logout

### Hostel
- `createHostel(params)` → INSERT into `hostels`
- `getHostelByUserId(userId)` → SELECT hostel for logged-in user
- `updateHostel(hostelId, updates)` → UPDATE hostel row

### Building
- `getFloors(hostelId)`, `createFloor(params)`
- `getRooms(hostelId)`, `createRoom(params)`, `updateRoom(roomId, updates)`, `deleteRoom(roomId)`
- `getBeds(hostelId)`, `createBed(params)`, `deleteBed(bedId)`
- `createFloorsRoomsBeds(hostelId, floorsData)` — bulk onboarding setup
- `getFullBuilding(hostelId)` — returns floors+rooms+beds in one call

### Residents
- `getActiveResidents(hostelId)` — all status='active'
- `getPastResidents(hostelId)` — all status='left'
- `updateResident(residentId, updates)` — direct UPDATE
- `addResident(params)` → RPC `add_resident`
- `vacateResident(residentId, leaveDate?, notes?)` → RPC `vacate_resident`
- `moveBed(residentId, newBedId, newRoomId)` → RPC `move_bed`

### Payments
- `getPaymentCycles(hostelId)` — all cycles
- `getResidentPaymentCycles(residentId)` — cycles for one resident
- `getPayments(hostelId)` — all payment transactions
- `markPayment(params)` → RPC `mark_payment`
- `getResidentProfile(residentId)` → RPC `get_resident_profile`

### Dashboard
- `getDashboardStats(hostelId)` → RPC `get_dashboard_stats`

### Logs
- `getActivityLogs(hostelId, limit?)` — activity feed

---

## Completed Backend Tasks

- [x] ENUM types: `rent_cycle_type`, `bed_status`, `resident_status`, `payment_status`, `payment_method`
- [x] All 9 tables with constraints, FKs, unique indexes
- [x] `updated_at` auto-triggers on all tables
- [x] `handle_new_user` trigger: auto-creates `public.users` row on auth.users INSERT
- [x] Performance indexes on `hostel_id`, `resident_id`, `payment_cycles.status`, `beds.status`
- [x] RLS on all 9 tables with `user_owns_hostel()` helper
- [x] `_guard_bed_availability` — prevents double-occupancy
- [x] `_on_resident_inserted` — marks bed occupied on resident insert
- [x] `_on_resident_status_changed` — frees bed when resident vacates
- [x] `_guard_room_deletion` — blocks delete if occupied beds exist
- [x] `_on_payment_inserted` — updates cycle paid_amount
- [x] `_refresh_cycle_status` — recalculates cycle status after payment
- [x] `_compute_due_date` — calculates due date from cycle type + grace period
- [x] `_log_activity` — writes to activity_logs from any RPC
- [x] RPC: `add_resident` with pro-rated first month + first cycle creation
- [x] RPC: `mark_payment` with overpayment cap
- [x] RPC: `move_bed` atomic bed swap
- [x] RPC: `vacate_resident` with leave date recording
- [x] RPC: `get_dashboard_stats` with all 9 KPIs
- [x] RPC: `get_resident_profile` with nested payment history
- [x] RPC: `generate_payment_cycles` idempotent monthly cron
- [x] RPC: `tag_late_cycles` daily cron
- [x] Seed data (dev only): 1 hostel, 1 floor, 1 room, 3 beds, 3 residents, 3 cycles, 2 payments, 3 activity logs
- [x] Frontend: `src/lib/supabase.ts` — typed client + all DB type interfaces
- [x] Frontend: `src/lib/api.ts` — complete typed API abstraction layer
- [x] Frontend: `src/context/AuthContext.tsx` — Supabase Auth session + hostel fetching
- [x] Frontend: `src/pages/Auth.tsx` — Login / Sign Up UI
- [x] Frontend: `src/context/AppContext.tsx` — all mock data replaced with Supabase queries
- [x] Frontend: `src/pages/Onboarding.tsx` — creates real hostel/floors/rooms/beds in DB
- [x] Frontend: `src/pages/Dashboard.tsx` — uses `get_dashboard_stats` RPC
- [x] Frontend: `src/pages/Settings.tsx` — saves hostel profile to DB, real logout
- [x] Frontend: `src/App.tsx` — AuthProvider wrapping, auth guard, loading state

---

## Cron Jobs (To Be Configured)

| Schedule | Function | Setup |
|---|---|---|
| Daily at 00:01 UTC | `tag_late_cycles()` | Supabase pg_cron or Edge Function |
| Monthly on 28th | `generate_payment_cycles(hostel_id)` | Supabase Edge Function with auth |

---

## Key Design Decisions

1. **Denormalized `hostel_id`** on beds, payments, payment_cycles → O(1) RLS check without joins
2. **SECURITY DEFINER RPCs** → frontend cannot bypass business logic
3. **Pro-rated first month** → automatically calculated in `add_resident` based on join date vs due day
4. **Idempotent cycle generation** → `ON CONFLICT DO NOTHING` prevents duplicates
5. **No soft-delete on payments** → payments are immutable; overpayments capped at total + ₹1000
6. **Demo Mode** → frontend can toggle to load mock data without touching DB

---

## Final Audit — All Fixes Applied (2026-05-02)

- [x] `src/pages/Residents.tsx` — Past residents now fetched from `getPastResidents(hostelId)` (DB) instead of `MockPastResidents`
- [x] `src/pages/Residents.tsx` — UUID-safe `getRoomNumber()` + `getBedLabel()` helpers replace `r.roomId.replace('r','')` mock parsing
- [x] `src/pages/Payments.tsx` — Same UUID-safe helpers; WhatsApp hostel name now dynamic from `hostelProfile`
- [x] `src/components/AddResidentModal.tsx` — `joinDate` field correctly read from form and passed to `add_resident` RPC
- [x] `src/pages/Dashboard.tsx` — All KPIs sourced from `get_dashboard_stats` RPC
- [x] `src/pages/Settings.tsx` — Save writes to DB via `updateHostelProfile`; logout calls `auth.signOut()`
- [x] `src/context/AppContext.tsx` — `copyFloorLayout` wired to create rooms + beds via API
- [x] `src/context/AppContext.tsx` — `moveBeds` wired to call `move_bed` RPC iteratively for selected beds
- [x] `src/context/AppContext.tsx` — `markReminderSent` wired to insert `reminder_sent` into `activity_logs`
- [x] `src/pages/JoinForm.tsx` — Submit writes to `activity_logs` if authenticated, falls back to local state gracefully
- [x] `src/pages/BuildingView.tsx` — Added `isSaving` loading spinners and `try/catch` error toasts for all room edits
- [x] `src/pages/Residents.tsx` — Added `isSaving` loading spinners and error handling for Edit & Vacate modals
- [x] `src/pages/Payments.tsx` — Added `isSaving` loading spinners and error handling for Mark Paid modal
- [x] `tsconfig.json` — Added `vite/client` types so `import.meta.env` resolves
- [x] `npm run lint` — 0 TypeScript errors across entire codebase
