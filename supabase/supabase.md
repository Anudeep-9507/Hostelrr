# Hostelrr — Supabase Backend

Production-grade PostgreSQL + Supabase backend for the Hostelrr hostel management SaaS.

---

## Folder Structure

```
supabase/
├── migrations/
│   ├── 001_enums.sql       → Custom PostgreSQL ENUM types
│   ├── 002_tables.sql      → All tables, constraints, FKs, auto-triggers
│   ├── 003_indexes.sql     → Performance indexes
│   ├── 004_rls.sql         → Row Level Security on all 9 tables
│   ├── 005_functions.sql   → Internal trigger/helper functions
│   └── 006_rpc.sql         → Public RPC functions (called from frontend)
└── seed/
    └── seed.sql            → Sample data for dev/staging only
```

---

## Deployment Order

Run migrations **in this exact order** in the Supabase SQL Editor:

```
1 → 001_enums.sql
2 → 002_tables.sql
3 → 003_indexes.sql
4 → 004_rls.sql
5 → 005_functions.sql
6 → 006_rpc.sql
```

> **Never run** `seed.sql` in production. It's for local testing only.

---

## RPC Reference

All functions are callable via the Supabase JS client:

```ts
const { data, error } = await supabase.rpc('function_name', { param: value });
```

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `add_resident` | hostel_id, room_id, bed_id, name, phone, monthly_rent, ... | `UUID` | Adds resident + creates first payment cycle |
| `mark_payment` | cycle_id, amount, method, transaction_ref?, paid_on? | `UUID` | Records payment, updates cycle status |
| `move_bed` | resident_id, new_bed_id, new_room_id | `void` | Atomically swaps resident to a new bed |
| `vacate_resident` | resident_id, leave_date? | `void` | Marks resident as left, frees bed |
| `get_dashboard_stats` | hostel_id | `JSONB` | Returns occupancy + financial summary |
| `get_resident_profile` | resident_id | `JSONB` | Full profile + payment history |
| `generate_payment_cycles` | hostel_id | `INTEGER` | Monthly cron: creates next cycles for all active residents |
| `tag_late_cycles` | (none) | `INTEGER` | Daily cron: marks overdue cycles as 'late' |

---

## Cron Jobs (Supabase Edge Functions)

Set these up in Supabase → Edge Functions or via `pg_cron`:

| Schedule | Function | Purpose |
|---|---|---|
| Daily at 00:01 | `tag_late_cycles()` | Mark overdue payment cycles as 'late' |
| Monthly on 28th | `generate_payment_cycles(hostel_id)` | Create next month's billing cycles |

---

## Key Design Decisions

### RLS Strategy
Every table has `hostel_id` (directly or via denormalization on `beds`, `payments`). This allows a `user_owns_hostel(hostel_id)` SECURITY DEFINER helper to do an O(1) ownership check per policy.

### Trigger Pipeline
```
INSERT resident → _guard_bed_availability (BEFORE)
               → _on_resident_inserted (AFTER) → marks bed occupied

INSERT payment  → _on_payment_inserted (AFTER) → updates cycle.paid_amount
                                               → _refresh_cycle_status → recalculates status

UPDATE resident.status='left' → _on_resident_status_changed → frees bed

DELETE room → _guard_room_deletion (BEFORE) → blocks if occupied beds exist
```

### Pro-Rated First Month
When a resident joins mid-month under `monthly_fixed`, the first cycle's `total_amount` is automatically pro-rated. Full month rent is charged if they join on or before the `rent_due_day`.

### Overpayment Handling
`mark_payment` caps the effective payment at `total_amount + ₹1000` to handle rounding. Any true overpayment should be handled as a credit (future feature).

---

## Error Codes

Custom error codes used in RPC functions for clean frontend handling:

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
