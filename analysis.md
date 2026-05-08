## Repository Analysis — Hostelrr

Date: 2026-05-07

### 1. High-level overview
- Tech stack: React + TypeScript frontend, Vite build, Supabase/Postgres backend (migrations, RPCs, RLS, storage).
- Purpose: hostel management app with join requests, residents, payments, bed layout builder, and owner/admin flows.

### 2. Project layout (important folders/files)
- `src/` — main frontend application (React + TS). Key files:
  - `src/App.tsx`, `src/main.tsx` — app entry and routing.
  - `src/context/AppContext.tsx` — central app state loader and cache for hostels/residents/profile.
  - `src/lib/supabaseAPI.ts` — DB access layer and RPC wrappers (recently extended with `createJoinRequestDb`).
  - `src/pages/` — page components (`Dashboard`, `BuildingView`, `JoinForm`, `Residents`, `Payments`, `Settings`, `SignIn`, `SignUp`, `Onboarding`).
  - `src/components/` — UI components (`AddResidentModal`, `BedLayoutBuilder`, `QRCodeModal`, `DefaultAvatar`, etc.).

- `supabase/` — DB migrations, RPCs and functions, storage/policies notes. Notable items:
  - `migrations/001-014_*.sql` — schema and migrations including RPCs and enums.
  - `functions/` — server-side functions (deno/Azure functions) for cron or back-end tasks.
  - `seed/seed.sql` — seed data.

### 3. Database surface and important objects
- Tables of interest: `residents`, `hostels`, `join_requests`, `payments`, `cycles` and previously `complaints` (user dropped it).
- Enums and types: `resident_status` is used by frontend and must match DB values. RPCs exist for privileged operations (e.g., `create_join_request`, `add_resident`, `mark_payment`, `vacate_resident`).

### 4. Recent changes & findings (context from audit)
- Complaints: The `complaints` table existed in migrations; the user executed SQL in Supabase to drop it. I provided the SQL:
  - `drop table if exists public.complaints cascade;`
  - `drop type if exists public.complaint_status;`

- Resident status enum mismatch: Frontend sets status `'archived'` in flows, but DB enum did not include `'archived'`. Recommended SQL:
  - `alter type public.resident_status add value if not exists 'archived';`
  - Optional normalization: `update public.residents set status = 'left' where status = 'archived';`

- total_capacity vs total_beds: Frontend used a fallback `hostelProfile?.total_capacity` in two places (`Dashboard`, `BuildingView`). I removed the fallback and made the UI rely on `total_beds` (or computed configured bed counts).

- Join form wiring: There was a public `JoinForm` that used local state/store instead of calling the DB RPC. I added a wrapper `createJoinRequestDb` in `src/lib/supabaseAPI.ts` and wired `JoinForm` to call the `create_join_request` RPC. File-upload for documents remains unimplemented in that flow (UI currently sends `null` placeholders for file paths).

### 5. Key code patterns and conventions
- AppContext centralizes data loading and exposes helpers to pages/components.
- `supabaseAPI.ts` wraps supabase client operations and exposes RPC wrappers; treat it as the single place to add DB calls.
- RPCs in DB are used for privileged logic (security definer), which keeps business logic centralized in Postgres.

### 6. Known mismatches, risks and recommendations
- Enum drift: Frontend enum usage and DB enum values can drift (example: `resident_status`). Recommendation: prefer DB as the source-of-truth for enum values and add a small script or migration when front-end expects new values.

- Complaints removal: If you want the removal to be reproducible for other environments, add a new migration file under `supabase/migrations/` that drops the table/type so CI/staging reproduce the change.

- JoinForm uploads: Current `JoinForm` UI keeps file inputs but does not upload files to storage; it passes `null` to the RPC. Recommendation: implement storage uploads (Supabase Storage), persist file URLs, and pass paths to `create_join_request` RPC.

- Tests and type-safety: After the UI edits, TypeScript checks reported no errors. Consider adding end-to-end tests (Cypress / Playwright) for critical flows: join request submission, resident archive/unarchive, payment cycle generation.

### 7. Minimal actionable SQL commands (copy/paste)
- Drop complaints (already executed by user):
  - `drop table if exists public.complaints cascade;`
  - `drop type if exists public.complaint_status;`

- Add `archived` enum to avoid runtime errors:
  - `alter type public.resident_status add value if not exists 'archived';`

### 8. Code-level places to inspect when changing DB contracts
- `src/lib/supabaseAPI.ts` — wrap and centralize any new RPCs or storage helpers.
- `src/context/AppContext.tsx` — update data-loading and cache invalidation when schema changes.
- Pages that reference `hostelProfile` and capacity fields: `src/pages/Dashboard.tsx`, `src/pages/BuildingView.tsx`.
- Join flow: `src/pages/JoinForm.tsx` and any helper that uploads to storage.

### 9. Next-step suggestions (priority ordered)
1. Run the `alter type` SQL to add `'archived'` to `resident_status` in all environments to match frontend usage.
2. Implement file upload from `JoinForm` to Supabase Storage and pass file paths in the RPC call.
3. Add a migration to remove `complaints` so the change is tracked in repo migrations.
4. Add regression tests for join request and resident lifecycle.

### 10. Final notes
- The application is small-to-medium sized and intentionally keeps business logic in Postgres RPCs. That pattern is good for security but requires careful versioning of DB contracts (enums, column names). Keep migrations small and reproducible.

---
If you'd like, I can: (a) create the migration to drop `complaints`, (b) add the `resident_status` migration and run a quick repo patch, or (c) implement file upload wiring for `JoinForm` and return a PR-ready patch.
