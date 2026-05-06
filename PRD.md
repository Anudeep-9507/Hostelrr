# 🧾 HOSTELRR BACKEND PRD (Supabase-Oriented)

---

# 1. 🧠 PRODUCT OVERVIEW

Hostelrr is a hostel/PG management SaaS for Indian owners to manage:

* Rooms & beds
* Residents
* Payments
* Rent tracking
* WhatsApp reminders (future)

Goal:

* Reduce manual tracking (registers, Excel)
* Improve payment collection
* Provide simple daily operations tool

---

# 2. 🎯 CORE ENTITIES

System revolves around:

1. Users (owners/admins)
2. Hostels
3. Rooms
4. Beds
5. Residents
6. Payments
7. Payment Cycles
8. Activity Logs

---

# 3. 🗄 DATABASE SCHEMA (SUPABASE)

## 3.1 USERS

Table: users

* id (uuid, pk) → auth.users.id
* name (text)
* phone (text, unique)
* email (text)
* created_at (timestamp)

---

## 3.2 HOSTELS

Table: hostels

* id (uuid, pk)
* user_id (uuid, fk → users.id)
* name (text)
* city (text)
* state (text)
* total_rooms (int)
* total_beds (int)
* rent_cycle_type (enum: 'monthly_fixed', 'joining_based')
* rent_due_day (int, nullable)
* created_at (timestamp)

---

## 3.3 FLOORS

Table: floors

* id (uuid, pk)
* hostel_id (uuid, fk)
* floor_number (int)

---

## 3.4 ROOMS

Table: rooms

* id (uuid, pk)
* hostel_id (uuid, fk)
* floor_id (uuid, fk)
* room_number (text)
* total_beds (int)
* created_at (timestamp)

---

## 3.5 BEDS

Table: beds

* id (uuid, pk)
* room_id (uuid, fk)
* label (text) → A, B, C
* status (enum: 'occupied', 'vacant', 'reserved')
* resident_id (uuid, nullable)
* created_at (timestamp)

---

## 3.6 RESIDENTS

Table: residents

* id (uuid, pk)
* hostel_id (uuid, fk)
* name (text)
* phone (text)
* emergency_contact (text)
* aadhar_number (text)
* room_id (uuid)
* bed_id (uuid)
* monthly_rent (int)
* security_deposit (int)
* join_date (date)
* stay_duration_days (int)
* status (enum: 'active', 'left')
* created_at (timestamp)

---

## 3.7 PAYMENT_CYCLES

Table: payment_cycles

* id (uuid, pk)
* resident_id (uuid, fk)
* hostel_id (uuid, fk)
* cycle_start (date)
* cycle_end (date)
* due_date (date)
* total_amount (int)
* paid_amount (int)
* status (enum: 'paid', 'pending', 'late', 'partial')
* created_at (timestamp)

---

## 3.8 PAYMENTS

Table: payments

* id (uuid, pk)
* resident_id (uuid, fk)
* cycle_id (uuid, fk)
* amount (int)
* method (enum: 'upi', 'cash')
* transaction_ref (text)
* paid_on (date)
* created_at (timestamp)

---

## 3.9 BED_LAYOUT_TEMPLATES (optional)

Table: bed_layout_templates

* id (uuid, pk)
* hostel_id (uuid)
* name (text)
* total_beds (int)
* layout_json (jsonb)

---

## 3.10 ACTIVITY_LOGS

Table: activity_logs

* id (uuid, pk)
* hostel_id (uuid)
* action (text)
* metadata (jsonb)
* created_at (timestamp)

---

# 4. 🔁 CORE LOGIC

---

## 4.1 ONBOARDING → AUTO SETUP

Input:

* total_rooms
* avg beds OR sharing types

Logic:

1. Create hostel
2. Create floors (default = 1 if not specified)
3. Create rooms (Room 101, 102...)
4. Create beds (A, B, C...)

---

## 4.2 ADD RESIDENT

Flow:

1. Assign room_id + bed_id
2. Update bed.status = occupied
3. Create payment_cycle

---

## 4.3 PAYMENT CYCLE GENERATION

IF monthly_fixed:

* due_date = every month (hostel.rent_due_day)

IF joining_based:

* due_date = resident.join_date monthly recurrence

---

## 4.4 MARK PAYMENT

Flow:

1. Insert into payments
2. Update payment_cycles.paid_amount
3. IF paid_amount == total_amount → status = paid
4. IF paid_amount < total_amount → status = partial

---

## 4.5 AUTO LATE TAGGING (CRON)

Daily job:

* IF today > due_date AND status != paid
  → status = late

---

## 4.6 MOVE BED

Flow:

1. Update old bed → vacant
2. Update new bed → occupied
3. Update resident.bed_id

---

## 4.7 DELETE ROOM

Constraint:

* Cannot delete if beds occupied

---

# 5. 🔐 AUTH & SECURITY

* Use Supabase Auth
* Row Level Security (RLS)

Policies:

* user can only access their hostel data
* all tables filtered by hostel_id

---

# 6. 📡 API DESIGN (SUPABASE RPC / REST)

---

## 6.1 HOSTEL

* create_hostel()
* get_hostel()

---

## 6.2 ROOMS

* create_rooms_bulk()
* get_rooms_with_beds()

---

## 6.3 RESIDENTS

* add_resident()
* get_residents()
* get_resident_profile()

---

## 6.4 PAYMENTS

* get_payments_summary()
* mark_payment()
* get_payment_history()

---

## 6.5 DASHBOARD

* get_dashboard_stats()
  returns:

  * total beds
  * occupied
  * vacant
  * pending amount
  * monthly revenue

---

# 7. 📊 DERIVED METRICS

Do NOT store directly — compute:

* occupancy_rate = occupied / total beds
* pending_amount = sum unpaid cycles
* revenue_this_month

---

# 8. 🔔 FUTURE (PHASE 2)

* WhatsApp API integration
* Auto reminders
* Payment links (Razorpay / UPI collect)
* Multi-admin support
* Resident app (optional)

---

# 9. ⚙️ CRON JOBS

1. Daily:

   * Update late payments

2. Monthly:

   * Generate new payment cycles

---

# 10. 🚨 EDGE CASES

* Partial payments
* Resident leaves mid-cycle
* Room change mid-cycle
* Overpayment handling

---

# 11. 🎯 MVP SCOPE (STRICT)

INCLUDE:

* Rooms, Beds
* Residents
* Payments (manual)
* Dashboard

EXCLUDE:

* Payment gateway (later)
* WhatsApp automation (later)

---

# 12. 🧠 PERFORMANCE NOTES

* Index:

  * hostel_id
  * resident_id
  * payment_cycles.status

* Use joins carefully:

  * rooms + beds
  * residents + payments

---

# 13. 🚀 SUCCESS CRITERIA

* Owner can:

  * Setup hostel in < 2 min
  * Add resident in < 10 sec
  * Track payments instantly

---

# END OF PRD
