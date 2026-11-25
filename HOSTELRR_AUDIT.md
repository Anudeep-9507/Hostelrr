# Hostelrr current-state audit

**Audit date:** 15 November 2026  
**Scope:** Review of repository, `PRD.md`, `handoff.md`, and connected Supabase project `hostelrr-prod` (`lfgouwvdwxlkirqqlwmt`), including deployed Edge Function source, function grants, triggers, cron schedules, and available logs; followed by Phase 0 repairs and live verification.

## Executive summary

The project has a substantial React/Vite owner dashboard and a normalized Supabase backend for hostel operations, residents, payment cycles, manual payments, join requests, and audit activity. The live Supabase project is active and contains the expected core tables and test-like data volumes.

The initial audit confirmed scheduled cycle generation failed with `42501`, past-due cycles were excluded from late tagging, and billing dates used the database UTC date. Phase 0 repairs now address these findings; see the repair details below. Broader subscription/trial/payment-verification requirements remain unimplemented, so the product is not yet production-ready against the full handoff.

Subscription/trial/payment-verification functionality is absent from the inspected application and schema. The handoff has newer, confirmed business requirements than the original PRD; use the handoff as the current product baseline where they differ. No implementation work should begin until migration state and the concrete open decisions below are reconciled.

## Repository and application

- Git reports branch `main` tracking `origin/main`; this work modifies IST frontend date handling and Supabase Edge Function sources, adds migrations `048`–`050`, updates this audit, and retains the user-provided `handoff.md`.
- This is React 19 + Vite 6 + TypeScript, with React Router 7 and Supabase JS 2 (`package.json`).
- Main screens are `Dashboard`, `BuildingView`, `Residents`, `Payments`, `MonthlyOverview`, `Settings`, and `Onboarding`; routes are protected by auth and an onboarding check. `src/routes/SubscriptionGuard.tsx` is only a placeholder, and `ProtectedAppRoutes.tsx` describes subscription checks as future work.
- `src/context/AppContext.tsx` is the main UI state layer. `src/lib/supabaseAPI.ts` performs direct table reads/writes and RPC calls. There is no generated database type layer apparent in the inspected files. The UI also persists onboarding/profile/display settings in `localStorage` and has a demo mode.
- The `tests` directory has no files. `package.json` exposes `lint` (`tsc --noEmit`) and `build`; no automated test runner or test script is configured.
- `src/supabaseClient.ts` is configured through environment variables; the file was not copied here to avoid exposing even publishable configuration values. No service-role key was inspected or printed.

## Product baseline: PRD versus handoff

The PRD describes a smaller MVP: hostel setup, rooms/beds, residents, manual payments, and dashboard. It proposes both `monthly_fixed` and `joining_based` cycles, an early monthly fixed date model, and future gateways/WhatsApp. The handoff is the updated source of product decisions: owner-only SaaS, no resident accounts, strict tenant separation, 14-day trial, bed-count pricing (exact tiers unresolved), read-only mode on expiry, manual UPI subscription verification, and no gateway/provider WhatsApp work now.

The handoff also supersedes the PRD's old rent assumptions with joining-date prepaid cycles, current-month-only onboarding for historical residents, full initial cycle without proration, fixed month-end fallback, and `late` on the day after due date. Local migrations and functions still contain monthly-fixed prorating paths. Do not silently apply joining-based rules to the separate `monthly_fixed` product option without confirming that product behavior.

## Frontend flow and integration

1. Auth screens use Supabase Auth; route guards gate protected dashboard routes.
2. Onboarding writes the hostel, floor/room/bed setup, and onboarding data through `completeOnboarding` and helpers in `supabaseAPI.ts`.
3. The application loads the owner's hostel and then floors, rooms, beds, residents, cycles, payments, activity logs, join requests, and dashboard stats. Join requests and KPIs use `get_join_requests` and `get_dashboard_stats` RPCs.
4. Resident creation and reserved move-in use database RPCs. Payment recording selects the resident's pending/late/partial cycles in the browser and calls `mark_payment` for each allocation.
5. Bed and room management mixes direct table writes with RPCs; bed moves use `move_bed` for resident bed changes.

Important caveats:

- The application often uses direct browser-side Supabase calls. RLS and function authorization are therefore the actual security boundary; UI filtering cannot substitute for them.
- The browser payment allocator makes sequential RPC calls when an amount spans cycles. A failure partway through can leave a partial allocation across cycles; this is not a single atomic transaction.
- `mark_payment` locks the cycle and records minor-unit integer values (rupees, not paise), but has no idempotency key. It permits up to ₹1,000 beyond the remaining balance, described as a future advance, while the payment model does not establish an advance ledger. Duplicate submissions and reversal/edit workflows need explicit treatment.
- The resident payment history maps a transaction's `partial` label by comparing that individual payment to the cycle total. A later payment that completes a previously partial cycle may therefore still display as partial; the cycle's current status is the more accurate settlement state.
- `localStorage` onboarding flags and demo behavior should be checked against database truth so they cannot create misleading success states or hide a failed database setup.

## Supabase current state

Connected project confirms `hostelrr-prod`, reference `lfgouwvdwxlkirqqlwmt`, region Mumbai (`ap-south-1`), PostgreSQL 17.6, status `ACTIVE_HEALTHY`.

The live schema includes the expected core tables (`users`, `hostels`, `floors`, `rooms`, `beds`, `residents`, `join_requests`, `onboarding`, `bed_layout_templates`, `payment_cycles`, `payments`, `activity_logs`) and additional columns/statuses for reserved residents and soft deletion. All listed public tables have RLS enabled. The live data counts are approximately 15 hostels, 26 users, 85 rooms, 177 beds, 102 residents, 97 cycles, and 58 payments.

The RLS policies generally scope hostel records through `user_owns_hostel(hostel_id)`; hostels and users use `auth.uid()` ownership checks. Public join-request creation exists by design and should be reviewed for data minimization and abuse controls. Supabase security advisors warn that multiple `SECURITY DEFINER` functions are callable by `authenticated` users, including `generate_all_payment_cycles()`; this function loops across every hostel and has no owner check in its body. Restrict its execution and/or make its authorization narrow before treating tenant isolation as verified. This is a concrete cross-tenant function exposure concern, even though ordinary table RLS is enabled.

The security advisor also reports leaked-password protection disabled and broad warnings about callable `SECURITY DEFINER` routines. Performance advisories identify four unindexed foreign keys and repeated auth-function evaluation in RLS. These are secondary to the authorization issue.

### Function grants and tenant boundaries

Catalog checks show `anon` and `authenticated` can execute all inspected public functions, including helper functions, consistent with PostgreSQL's default `PUBLIC EXECUTE` grant. Most user-facing `SECURITY DEFINER` RPCs call `user_owns_hostel`, but this is not consistent across the function inventory. In particular, `_occupy_bed(uuid)` and `_vacate_bed(uuid)` are `SECURITY DEFINER` routines that update a bed by ID without an ownership check; `_log_activity(...)` inserts a log for a caller-supplied hostel ID without verifying ownership; and `generate_all_payment_cycles()` loops across all hostels without authorization. Trigger-only routines should not be exposed as RPC endpoints. These grants should be narrowed to the minimum roles and internal routines moved out of the exposed API surface where possible.

The `payments` RLS insert policy checks that the supplied `hostel_id` belongs to the caller, but foreign keys separately validate `cycle_id`, `resident_id`, and `hostel_id` and do not enforce that all three belong to the same tenant/cycle. The direct insert path and legacy `add_payment(...)` routine therefore require an integrity review; the current frontend uses the owner-checking `mark_payment(...)` RPC instead. This is a structural cross-tenant association risk, separate from row visibility.

### Triggers, extensions, Realtime, and scheduled execution

- Live application triggers include updated-at triggers, bed availability/deletion guards, resident insert/status-change bed synchronization, and payment insert aggregation/status refresh. No payment update/delete reversal trigger was found in the inspected trigger list.
- `pg_cron` is installed. Cron jobs now invoke the protected database routines directly at 18:30 and 18:32 UTC (00:00 and 00:02 IST). The earlier Edge Function dispatches failed; the routines were fixed, a catch-up generation created 50 cycles, and the late-tagging backfill completed.
- No tables were present in the `supabase_realtime` publication. Realtime is not configured for application tables; polling/refetch is the current fallback.
- Security advisors return no health lints, but report callable definer functions and disabled leaked-password protection. Performance findings are recorded above.

### Migration tracking discrepancy

The repository originally contained migration files through `047`, including two differently named `031` files; this work adds `048`–`050`. The live schema already contains structures from the later migrations, as the user confirmed those migrations had already been run. The connector's migration ledger view omitted earlier later migrations, but records the new migrations `20261115111313`, `20261115112235`, and `20261115112648`. Do not replay existing migrations based on that incomplete ledger view.

## Rent-cycle and payment findings

### Cycle generation: repaired scheduled failure (P0)

The prior Edge Function generation failed for all hostels with `42501` because scheduled service-role execution lacked an owner JWT. Migration `20261115111313` adds a service-role-only global generator backed by a private generation routine. The global routine is not callable by `anon` or `authenticated`; tenant owners retain access only to their own hostel RPC. Cron now calls the database routine directly at 00:00 IST. A one-time catch-up invocation generated 50 cycles.

### Scheduled function access (hardened)

- Edge Functions are now deployed as `generate-payment-cycles` v8 and `tag-late-cycles` v6, with JWT verification enabled and explicit service-role bearer checks. Scheduled jobs no longer invoke HTTP endpoints: they call the service-role-only SQL routines directly, so no cron secret is needed in the database job definition. The prior deployed versions had weaker authorization; those versions have been replaced.

### Late tagging and live cycle state (repaired)

- `tag_late_cycles()` now uses the `Asia/Kolkata` date boundary, covers historical inactive residents, and normalizes legacy `overdue` to `late` (or `paid` when settled). Existing payment trigger status refresh uses the same IST rule.
- The migration backfill changed historical unsettled past-due cycles to `late`; live check showed 45 `late`, 52 `paid`, and zero past-due cycles in `pending`, `partial`, or legacy `overdue`.
- Dashboard unpaid totals now include legacy `overdue`; payment cycle and payment tenant relationships have composite constraints. The migration's precheck found no inconsistent existing rows, and post-migration verification still found zero.

Additional trigger finding: deployed `_on_payment_inserted()` updates `paid_amount` then invokes `_refresh_cycle_status()`. That helper sets unpaid cycles past due to the legacy enum state `overdue`, not `late`. The cron function only selects `pending` and `partial`, so it will not repair an `overdue` cycle. `get_dashboard_stats()` calculates pending balances from `pending`, `late`, and `partial`, omitting `overdue`. This explains a concrete path to divergent payment state and dashboard totals; the live database has one `overdue` cycle. Full payment maps to `paid`, but partial payment after a due date can produce `overdue` and leave it outside late reporting.

PostgreSQL remains configured for UTC. Billing date computations now explicitly use `Asia/Kolkata`, while cron's UTC schedule corresponds to midnight IST.

Historical past-due balances are retained and now marked `late`, including departed/archived residents; no payments or historical amounts were removed.

The resident insert trigger updates bed status according to `active`/`reserved`, and the status-change trigger frees beds on departure and marks beds occupied on confirmation. These triggers are atomic with resident status changes. The status-change trigger does not itself end or truncate future payment cycles; that behavior depends on the generator ignoring non-active residents.

### Onboarding and recurrence gaps (P1)

- `add_resident` supports `p_operational_cycle_start` and `p_skip_first_cycle`, which can represent effective current-month onboarding dates. Confirm that every relevant UI workflow sends the owner-entered effective date; do not equate a historical `join_date` to operational billing start.
- The live generation routine has an idempotent unique conflict target `(resident_id, cycle_start)` and skips future cycle starts. It derives recurrence from the first cycle start plus `cycle_count * interval '1 month'`.
- Existing `013_fix_cycle_date_drift.sql` explicitly anchors cycles to the original joining day, but PostgreSQL month arithmetic can restore the original day after a short-month clamp (for example Jan 31 → Feb 28 → Mar 31). That does not match the handoff's permanent fallback to the 28th. `confirm_move_in` also creates a cycle directly and must be audited against the fixed-fallback rule.
- Local SQL and deployed schema include monthly-fixed first-cycle proration logic. That conflicts with the handoff's full initial rent decision for joining-based historical onboarding only; the exact applicability to monthly-fixed hostels remains a product question.
- Current cycle generation stops by resident `status='active'`, but the audit did not establish a robust cycle cutoff at an effective leave date. Clarify and test whether cycles are allowed through the leave date or stop at the end of the current covered period.

## Subscription and admin gap (P1)

The subscription MVP is now deployed in migration `20261115121320_subscription_trial_and_entitlements` and wired to local owner/admin screens. Exact price tiers, platform UPI details, and assignment of a real platform admin remain unconfigured. Live verification found 15 hostels, 15 matching trial rows, zero orphan hostels, and zero configured plans/payment submissions. Trial records started at deployment time with a 14-day window.

## Requirement status

| Requirement | Status | Evidence / next check |
|---|---|---|
| React/Vite owner dashboard and core hostel operations | Implemented, partial verification | Routes/pages and Supabase API integration exist; end-to-end CRUD not exercised. |
| Resident onboarding, bed assignment, reserved move-in | Implemented, needs edge-case verification | `add_resident`, `confirm_move_in`, and triggers exist. |
| Current-month historical onboarding, no arrears | Implemented in part | Operational cycle parameters and generation branch exist; trace every UI caller. |
| Joining-date prepaid cycles and idempotency | Implemented, incomplete | Unique cycle index and generation RPC; monthly-end fallback fails stated permanent-day requirement. |
| Full first cycle, no proration | Partially conflicting | Joining-based path uses full rent; monthly-fixed path prorates. Confirm intended scope. |
| Late next-day tag and paid protection | Repaired | IST date boundary, late status normalization, historical inactive cycles, and dashboard overdue compatibility are in place. |
| Full/partial manual payments | Implemented, needs atomicity/idempotency work | `mark_payment` RPC + trigger; browser allocates sequentially; duplicate/reversal behavior incomplete. |
| Strict tenant isolation | Improved | Global generator and tagger are service-role-only; financial DML and unsafe internal helpers are restricted; composite tenant consistency constraints added. |
| Payment dashboard reconciliation | Partially implemented | `get_dashboard_stats` exists; verify under inactive residents, partials, and cycle history. |
| 14-day subscriptions and expiry read-only | MVP deployed; needs authenticated end-to-end verification | Migration `20261115121320` created a 14-day trial per existing hostel and a trigger for new hostels; backend writes are gated. |
| Pricing and UPI verification | Workflow deployed; configuration pending | No tiers or UPI values were seeded; configure from `/admin/subscriptions` after granting a trusted user `app_metadata.platform_role = 'admin'`. |
| Admin authorization and verification | Role gate deployed; real admin assignment pending | Admin RPCs check `app_metadata.platform_role`; anonymous check returned false. |
| Tests | Missing | No test files or test script found. |
| Migration/deployment parity | Partially reconciled | User confirmed later migrations were already run; migrations `048`–`050` are recorded. Connector ledger view still omits pre-existing later entries. |

## Prioritized implementation plan

### Phase 0 — resolve drift and establish safe baseline

**Phase 0 fixes are applied.** Frontend date handling, billing functions, grants, database constraints, cron calls, and Edge Function authorization were updated. Migration `048` is recorded and both Edge Functions are deployed. We verified live cron schedules, grants, zero cross-tenant mismatches, zero past-due unpaid cycles, and recovered 50 cycles with the idempotent generator. Secret values were not accessed. A full remote schema export and remaining product questions are still outstanding.

1. Continue reconciling the connector's incomplete historical migration ledger view with remote schema history; do not replay existing migrations.
2. Continue review of remaining `SECURITY DEFINER` routines, public join requests, and storage policies outside the billing paths changed here.
3. Continue reviewing remaining `SECURITY DEFINER` routines, public join requests, and storage policies outside the billing paths changed here.

### Phase 1 — repair core cycle operations

**Core cycle work is applied:** scheduled generation/tagging access, IST date defaults for onboarding/move-in/payment/vacating, permanent month-end recurrence, and scheduled-leave cutoff are implemented in migrations `048` and `049`. Migration `050` moves resident payment allocation across cycles into one transaction and adds request-key idempotency. Amounts above the outstanding balance are rejected; advances are not recorded because there is no credit ledger. Payment edits/reversals and duplicate manual UPI transaction-reference policy remain open.

1. Define and implement auditable payment edit/reversal behavior and duplicate manual UPI transaction-reference policy.
2. Continue reconciling the connector's incomplete historical migration ledger view with remote schema history; do not replay existing migrations.
3. Continue reviewing remaining `SECURITY DEFINER` routines, public join requests, and storage policies outside the billing paths changed here.

### Phase 2 — subscription MVP

After confirming admin access and pricing configuration, add trial/entitlement model, 14-day trial start, manual subscription UPI request and review, subscription audit trail, and read-only enforcement in both routes and backend writes. Keep subscription records separate from resident rent.

### Phase 3 — test and production readiness

Add deterministic tests for tenant isolation, authenticated versus scheduled execution, onboarding dates, month-end recurrence, payment allocation, late boundaries, inactive residents, and subscription enforcement. Then verify deployment configuration and present a deployment plan before applying migrations or deploying functions.

## Open product questions (only where unresolved)

1. What are the final configurable bed-count subscription tiers and amounts? The architecture can be prepared without hard-coding them.
2. Where should admin payment verification live, and which identity/authorization model defines an admin?
3. Does the no-proration/full-initial-cycle decision apply only to joining-based prepaid hostels, or also to monthly-fixed hostels?
4. What should happen to an already-created cycle whose covered period extends beyond a scheduled leave date? The generator now avoids starting new cycles after that date and preserves existing cycles and payments.

## Audit limitations

The initial audit was read-only; subsequent fixes were applied through migrations `048`, `049`, and `050`, and Edge Functions were deployed. No test suite or authenticated user-context payment CRUD was run. The report does not claim that untested screen flows work in production. Supabase advisor, catalog, and log observations are point-in-time. Function secret values were not read and live user-context isolation probes were not run.

## Follow-up implementation status (2026-11-15)

### Frontend/backend consistency repairs (local workspace)

- Resident onboarding now uses `add_resident_onboarding`, preserving the backend's current-month onboarding behavior rather than calling the generic resident RPC.
- Onboarding validates room, bed, and sharing totals and repairs missing configured floors, rooms, and beds on retry. Data loading now fails visibly when required Supabase reads fail instead of presenting partial data as complete.
- Room/floor mutations use API wrappers and surface backend errors; date-sensitive dashboard metrics and stay duration use IST calendar dates. Logout/account switching clears prior account state.
- The dashboard TypeScript issue caused by stale `now` references is fixed; month-to-date date comparisons now use the `Asia/Kolkata` month key.

### Phase 2 subscription MVP (deployed)

- Migration `051_subscription_trial_and_entitlements.sql` was applied live under migration version `20261115121320` after the user explicitly authorized application. The first attempt rolled back on a syntax error; the missing closing parenthesis was fixed before the successful application.
- Live checks confirmed 15 existing hostels received trials, no hostels lack a subscription, every trial is exactly 336 hours, all are currently writable, and the ownership gate denies access in the unauthenticated SQL context. All five subscription tables have RLS enabled, anonymous `is_platform_admin()` returns false, and plan/payment queues are empty. Direct table grants were confirmed absent for `anon` and `authenticated`; access is through guarded RPCs. The RLS advisor reports no per-table policies for these five tables, consistent with that RPC-only design. The health advisor returned no notices.
- Pricing tiers remain empty by design. The admin gate requires `app_metadata.platform_role = 'admin'`; production admin identity and UPI configuration need confirmation. Rent collections remain separate from subscription submissions.

### Phase 3 readiness checks (completed locally; production flows pending)

- Added a Node/tsx test command and deterministic IST/date plus WhatsApp-number unit tests. Five unit tests pass. `npm run lint` and `npm run build` pass. Vite still reports CSS import ordering, mixed static/dynamic imports, and a 500 KB chunk warning.
- Added `supabase/tests/phase3_subscription_invariants.sql` and executed its read-only assertions against production. It passed: every hostel has a subscription row, trial durations are exactly 14 days, direct table privileges are absent, RLS is enabled, the anonymous admin check fails closed, owner write policies include the entitlement gate, the activity feed is owner-scoped in Realtime, and expected owner RPCs are gated.
- Supabase security/performance advisors were run. The new RLS-no-policy notices are expected because direct table access is revoked; other warnings concern existing exposed SECURITY DEFINER functions, mutable function search paths, public join-request RPCs, and leaked-password protection being disabled. Performance advisor notices include unindexed foreign keys, including new subscription references; these subscription tables currently have no user/payment volume, so index tuning can follow measured usage.
- No signed-in owner/admin integration flow has been exercised. Supabase CLI is not installed in this environment, so database assertions were run through the connected Supabase SQL tool. Final production readiness still needs real admin assignment, plan/UPI configuration, and authenticated owner/admin journey verification for payment/onboarding/expiry edge cases.

### Phase 4 production readiness (checks completed where access permits)

- Re-ran `npm test` (5 passed), `npm run lint` (passed), and `npm run build` (passed). Build warnings remain for CSS `@import` order, mixed static/dynamic imports, and the 1.43 MB minified JS chunk.
- Ran a read-only live two-owner claim simulation against two existing `hostels.user_id` fixtures. For each simulated owner, `auth.uid()`, `user_owns_hostel`, and `user_can_write_hostel` accepted only that owner's hostel and rejected the other owner's hostel. This verifies those SQL predicates under simulated claims; it is not a signed-in API/RLS end-to-end test.
- Existing cron jobs were previously verified at `30 18 * * *` and `32 18 * * *` UTC (00:00 and 00:02 IST), with sampled recent executions succeeding. Edge Functions `generate-payment-cycles` v8 and `tag-late-cycles` v6 are active with JWT verification and service-role checks. Cron invokes database routines directly; no cron HTTP secret is configured in job SQL.
- Environment variable names were inspected without revealing values. Vercel deployment inventory could not be verified: the CLI is present but account/project access was unavailable, and registry DNS lookup failed during CLI attempts. The repository has SPA rewrite config in `vercel.json`; no deployment was initiated.
- Supabase connector does not expose Auth redirect allowlist or Edge Function secret metadata. Those settings remain unverified; secret values were not requested or read. Password reset redirects to the current origin in code; sign-up uses the Supabase project Site URL.
- No authenticated browser/API end-to-end test was run because no signed-in owner/admin session is available. Production admin assignment, pricing/UPI configuration, and real owner/admin journeys remain outstanding.

### Updated requirement state

| Requirement | Current status |
|---|---|
| Phase 0 production baseline | Migrations `048`–`050` applied; `generate-payment-cycles` v8 and `tag-late-cycles` v6 deployed. |
| Frontend/backend consistency | Local fixes listed above; no authenticated end-to-end CRUD run. |
| Phase 2 subscription backend | Applied as `20261115121320`; 15 trial records and RLS verified. |
| Phase 2 subscription frontend | Prepared locally; production configuration and authenticated journeys remain unverified. |
| Phase 3 owner operations | Implemented locally: complete historical stay/payment display, reliable manual WhatsApp queue, and activity-feed Realtime refresh. Migration `052_activity_log_realtime.sql` is applied as `20261115123141`. |
| Phase 3 readiness | Local unit tests, SQL invariants, build/typecheck, and Supabase advisors pass; authenticated production-flow verification remains. |
| Phase 4 production readiness | Partial: simulated two-owner SQL predicates, environment names, cron schedules/runs, function versions, and local build verified. Vercel/Auth redirect/secret metadata and authenticated E2E remain unverified. |

### Phase 3 owner operations (implemented)

- Payment history now uses the actual `payments.paid_on` date, includes cycle coverage and any stored transaction reference/notes, includes soft-deleted residents, and retains every historical stay even when phone numbers repeat.
- Manual WhatsApp links share one Indian phone-number normalizer. Bulk reminders now advance one user-clicked draft at a time so browsers do not block timer-opened tabs. The UI states that opening a draft does not verify delivery.
- The existing activity log/notification feed now receives INSERT events through Supabase Realtime for `activity_logs`, with the existing owner-scoped SELECT policy. App state refreshes on INSERT and on tab focus as a fallback. No second notification table was added.
- Migration `052_activity_log_realtime.sql` was applied live and verified in `supabase_realtime`; no other tables were added to the publication.
