
# Hostelrr — Product, Architecture & Implementation Handoff

> **Purpose:** This document is the source-of-context handoff for an AI coding agent (Claude Code, Codex, or another engineering agent) continuing Hostelrr.
>
> The agent will also receive access to the Hostelrr Supabase project through an authorized connector/plugin. It must inspect the live backend and existing repository before making changes.

**Last consolidated:** 15 November 2026
**Product:** Hostelrr
**Supabase project:** `hostelrr-prod`
**Supabase project ref:** `lfgouwvdwxlkirqqlwmt`
**Previously recorded web app:** https://hostelrr-app.vercel.app

---

## 1. What Hostelrr is

Hostelrr is an **owner-facing hostel-management SaaS** that helps hostel owners manage their operations through a web dashboard.

Its primary capabilities include:

- Room and bed management.
- Resident management.
- Bed assignments and occupancy tracking.
- Rent and payment tracking.
- Prepaid rent payment cycles.
- Payment history and overdue tracking.
- Subscription management for hostel owners.

### Product positioning

- Primary users: Hostel owners and authorized staff.
- Residents do not need Hostelrr accounts.
- Owners use the website/dashboard.
- Residents pay rent to hostel owners.
- Hostel owners pay Hostelrr for the software subscription.
- These two payment flows must remain separate.
- The application must support multiple hostels with strict tenant-level data isolation.

## 2. Confirmed product decisions

| Area                               | Decision                                  |
| ---------------------------------- | ----------------------------------------- |
| Product type                       | Owner-only B2B SaaS                       |
| Frontend users                     | Hostel owners / authorized operators      |
| Resident accounts                  | Not required                              |
| Tenant isolation                   | Strict hostel-level isolation             |
| Subscription trial                 | 14 days                                   |
| Subscription pricing               | Based on total configured/rentable beds   |
| Subscription expiry                | Dashboard becomes read-only               |
| Trial start                        | During/completion of hostel setup         |
| Initial subscription payment       | Manual UPI followed by admin verification |
| Rent payment recording             | Manual UPI/cash recording                 |
| Partial payments                   | Supported                                 |
| Provider-based payment gateways    | Future scope, not now                     |
| Provider-based WhatsApp automation | Future scope, not now                     |
| Hosting                            | Vercel                                    |
| Backend                            | Supabase                                  |

### Pricing

Subscription pricing is based on the total rentable/configured beds in a hostel, not the number of current residents.

Exact pricing tiers have not been finalized.

Do not hard-code previously discussed prices. Keep pricing configurable until the owner confirms the final tiers.

### Payment-flow separation

There are two separate financial flows:

1. **Resident → Hostel owner:** Rent payment.
2. **Hostel owner → Hostelrr:** Subscription payment.

Never mix their transaction records, ledgers, payment statuses, or reporting.

## 3. Technology stack

### Frontend

- React.js (not Next.js).
- Vite.
- Tailwind CSS.
- Vercel hosting.

Inspect the existing repository for exact package versions, routing, component library, state management, and build scripts.

### Backend

- Supabase PostgreSQL.
- Supabase Auth.
- Row Level Security (RLS).
- Supabase Edge Functions.
- `pg_cron` scheduled jobs.
- Realtime where useful.

A basic/manual WhatsApp workflow may already exist. Inspect and preserve it if present. Provider-based automation is future scope.

### Security

- Use only publishable/anon keys in browser code.
- Never expose service-role keys or other server secrets.
- Keep privileged operations server-side.
- Use RLS as an actual security boundary.
- Never assume frontend visibility restrictions provide authorization.
- Never print secret values during backend inspection.

## 4. Prepaid rent and joining-date-based payment cycles

**This is a core Hostelrr business rule.**

Hostelrr starts tracking rent from the month the owner registers a resident, not from the resident's historical joining month.

Rent is prepaid: each payment covers the upcoming occupancy period beginning on that resident's recurring joining-date anniversary.

### Historical residents being onboarded

When an owner adds a resident who has already been living in the hostel for months, Hostelrr must not generate previous months' payment cycles.

The owner records the effective joining date in the current month, using the resident's recurring joining day.

Example: Today is November 15, 2026.

### Scenario A — Joining day is still ahead this month

Actual historical joining date: September 28.

The owner adds the resident on November 15 and records November 28 as the effective joining date.

| Date             | Behavior                        |
| ---------------- | ------------------------------- |
| Nov 15           | Resident added; no rent due yet |
| Nov 28           | First rent cycle becomes due    |
| Nov 28 – Dec 27 | First prepaid coverage period   |
| Dec 28           | Next rent cycle becomes due     |
| Dec 28 – Jan 27 | Second prepaid coverage period  |

No historical September or October payment cycles should be generated.

### Scenario B — Joining day has already passed this month

Actual historical joining date: April 5.

The owner adds the resident on November 15 and records November 5 as the effective joining date.

| Date           | Behavior                                   |
| -------------- | ------------------------------------------ |
| Nov 15         | Resident added; November rent shown as due |
| Nov 5 – Dec 4 | Initial prepaid coverage period            |
| Dec 5          | Next rent cycle becomes due                |
| Dec 5 – Jan 4 | Next prepaid coverage period               |

The owner can record the November cycle as paid if the resident has already paid.

Do not create April–October cycles or historical arrears.

### Prepaid payment behavior

For a resident whose recurring rent date is the 28th:

| Cycle due date | Coverage period  | Status                          |
| -------------- | ---------------- | ------------------------------- |
| Nov 28         | Nov 28 – Dec 27 | Due; becomes paid when recorded |
| Dec 28         | Dec 28 – Jan 27 | New cycle becomes due           |
| Jan 28         | Jan 28 – Feb 27 | New cycle becomes due           |

A paid cycle remains paid through its final covered day.

For example, the November 28 payment covers the resident until December 27. The next cycle becomes due on December 28, not December 27.

### Required business logic

- Each resident has an independent joining-date-based rent schedule.
- Do not use a universal first-of-month payment cycle.
- If the joining day is today or has already passed in the current month, create/show the current cycle as due immediately.
- If the joining day is later in the current month, schedule the first cycle for that upcoming date.
- Each cycle covers its due date through the day before the next monthly anniversary.
- Never generate historical cycles before the resident's Hostelrr onboarding month.
- Payment-cycle generation must be idempotent.
- Recording a payment must settle the correct cycle.
- Preserve previous payment records when residents move beds or leave.
- Stop future cycles according to the resident's effective end date.
- Use a consistent application timezone for date calculations and scheduled jobs.

### Confirmed edge-case decisions

**1. Initial rent: Full rent, no proration**

If the resident's joining day has already passed in the current month when registered, the full current cycle amount is due immediately.

Do not calculate a prorated amount.

**2. Month-end joining date: Fixed fallback**

If the resident's recurring day does not exist in a month, use the last valid day of that month.

The fallback becomes the new fixed recurring day going forward.

Example:

- Resident's recurring date is January 31.
- February does not have a 31st.
- Use February 28 (or February 29 in a leap year).
- The recurring date becomes the 28th permanently.
- Subsequent cycles use the 28th.

Do not skip the cycle.

**3. Late payment: Next-day tagging**

An unpaid cycle remains due/pending on its due date.

It becomes/tagged `late` on the day after its due date.

The owner has clarified that the application already displays and tags overdue payments as `late`.

Preserve this existing terminology and inspect the current implementation before modifying it.

### Existing late-payment behavior must be audited

Before implementing or changing late-payment logic:

- Find where payment cycles are tagged `late`.
- Identify whether the mechanism is a database function, Edge Function, scheduled job, trigger, or frontend-derived status.
- Verify that it uses the cycle due date.
- Verify timezone boundaries.
- Verify paid cycles never become late.
- Check how partially paid cycles are handled by the existing product rules.
- Verify that a late cycle returns to the appropriate settled state after full payment.
- Check retries and idempotency.
- Avoid introducing a second competing late-tagging mechanism.
- Preserve the user-facing `late` terminology.

## 5. Frontend and product areas

The previously reviewed React dashboard included:

- Dashboard / overview.
- Rooms and beds.
- Visual room/bed layout.
- Residents.
- Payments and rent tracking.
- Resident profile/details.
- Bed assignment and bed moves.
- Hostel onboarding and setup.

The screens were reported as largely completed in an earlier review.

However, this does not prove every screen is fully connected to production data.

Audit every screen and its backend integration.

### Expected operational capabilities

- Create/configure a hostel.
- Configure floors, rooms, room types, sharing, and beds.
- View occupancy and vacancies.
- Add and manage residents.
- Assign residents to beds.
- Move residents between beds.
- Track prepaid rent cycles.
- Record full and partial payments.
- Record manual UPI/cash payments.
- View payment history.
- View outstanding dues.
- Identify late/overdue cycles.
- Send reminders using existing supported functionality.
- View accurate dashboard statistics.

## 6. Backend: known Supabase project and previous audit

These details came from an earlier backend inspection around November 12, 2026. Verify everything against the connected project.

### Project snapshot

- Project: `hostelrr-prod`.
- Project ref: `lfgouwvdwxlkirqqlwmt`.
- PostgreSQL 17.
- Region: Mumbai.
- 12 public tables.
- 35 migrations.

Approximate historical data counts:

- 15 hostels.
- 26 owner profiles.
- 177 beds.
- 101 residents.
- 96 payment cycles.
- 57 payments.

These counts are historical, not guaranteed current.

### Known public tables

- `users`
- `hostels`
- `floors`
- `rooms`
- `beds`
- `residents`
- `join_requests`
- `onboarding`
- `bed_layout_templates`
- `payment_cycles`
- `payments`
- `activity_logs`

Inspect the complete current schema, including views, enums, indexes, constraints, triggers, policies, and migrations.

### Known database functions

Previously identified functions include:

- `generate_payment_cycles`
- `mark_payment`
- `get_dashboard_stats`

The earlier audit reported approximately 40 database functions.

Inspect their definitions and callers before modifying anything.

### Known Edge Functions

- `generate-payment-cycles`, previously deployed as version 7.
- `tag-late-cycles`, previously deployed as version 5.

### Known cron jobs

Previously scheduled daily:

- 18:31 UTC.
- 18:36 UTC.

Approximately 12:01 AM and 12:06 AM IST.

Verify actual deployed versions, schedules, invocation methods, and logs.

### Previously identified critical defect

The previous backend audit found that payment-cycle generation was failing with PostgreSQL error `42501 Access denied`.

The suspected cause was that an Edge Function/service-role execution path called logic relying on `auth.uid()` / `user_owns_hostel`, but `auth.uid()` is not populated in the same way for a service-role/cron invocation.

Previously reported behavior:

- `generate-payment-cycles` returned HTTP 207 even though the cron job appeared successful.
- `tag-late-cycles` returned HTTP 200.

A successful scheduler invocation does not prove the underlying business operation succeeded.

**Required:**

- Reproduce the problem using current logs and database state.
- Diagnose the authorization design.
- Fix it safely.
- Do not broadly disable RLS or expose tables.
- Provide a narrowly scoped server-side authorization path for trusted scheduled jobs.
- Test both authenticated user calls and scheduled/service-role calls.

## 7. What is known to be implemented

These capabilities were present at the time of the previous audit. Verify their actual quality and completeness.

### Core hostel operations

- Hostel records and owner profiles.
- Floors, rooms, and beds.
- Resident records.
- Bed occupancy and resident assignment.
- Bed moves.
- Onboarding-related data.
- Activity/audit logging.

### Rent and payment tracking

- Payment cycles.
- Payment records.
- Manual UPI/cash recording.
- Partial payments.
- Payment marking through backend logic.
- Late-cycle tagging.
- Existing in-app `late` status.
- Dashboard statistics function.

### Automation/platform

- Supabase Edge Functions for payment-cycle generation.
- Supabase Edge Functions for late-cycle tagging.
- Scheduled `pg_cron` jobs.
- A basic/manual WhatsApp workflow was discussed previously. Verify and preserve what exists.

### Frontend

- Owner-facing React application.
- Room/bed management.
- Resident management.
- Payment operations.
- Onboarding.
- Previously recorded production URL: https://hostelrr-app.vercel.app

Implemented does not necessarily mean fully tested or production-ready.

## 8. Known gaps and work still to implement or verify

Re-inspect first. Do not create duplicate tables, functions, or migrations if newer implementations already exist.

### P0 — Establish a trustworthy baseline

1. Inspect the repository structure, `package.json`, environment variable names, routes, screens, and current git status.
2. Inspect the connected Supabase project.
3. Inspect migrations, tables, functions, triggers, RLS policies, grants, Edge Functions, cron jobs, storage, Realtime publication, and logs.
4. Compare local migrations with live database state.
5. Map each frontend screen/action to its backend query or function.
6. Reproduce the payment-cycle generation failure if it still exists.
7. Produce an audit report identifying:
   - Working and verified.
   - Implemented but not verified.
   - Broken.
   - Missing.
   - Unsafe / needs hardening.
8. Do not make broad changes before completing the baseline audit.

### P1 — Fix existing rent-cycle automation

- Fix `generate-payment-cycles` and its `42501` authorization issue if still present.
- Ensure cycles are generated only once for the correct resident, hostel, and period.
- Make generation idempotent.
- Confirm cycle date, due date, rent amount, resident status, and bed/hostel association rules.
- Ensure cron failures are visible and alertable.
- Test scheduled and manual/admin invocation.
- Verify the existing `late` tagging behavior.
- Ensure late tagging starts the day after the due date.
- Verify timezone, due date, paid, partial, and late states.

### P1 — Subscription and trial entitlement system

This was a major gap in the earlier backend audit.

Implement or verify:

- Subscription/trial state per owner or billable hostel.
- 14-day trial starting at the agreed onboarding/setup point.
- Trial start/end timestamps.
- Timezone-safe entitlement checks.
- Bed-based configurable pricing.
- Subscription lifecycle states.
- Manual UPI subscription payment submission.
- Admin verification and activation.
- Payment reference/UTR storage.
- Claimed payment date and amount.
- Verification status and reviewer details.
- Admin-only activation and extension controls.
- Read-only dashboard access after subscription expiry.
- Backend enforcement of read-only restrictions.
- Renewal flow.
- Pending-verification status.
- Multi-hostel subscription handling.

Do not invent final subscription pricing.

### Future scope — Payment gateway providers (not now)

Payment gateway integrations through external providers are explicitly out of current scope.

Do not implement:

- Gateway SDKs.
- Provider accounts.
- Gateway webhooks.
- Automated settlements.
- Provider-specific payment flows.

For now, preserve and verify manual rent-payment recording, including partial payments where supported, and manual UPI subscription payment with admin verification.

Keep rent and subscription ledgers separate.

### Future scope — WhatsApp automation through providers (not now)

Provider-based WhatsApp automation is explicitly future scope.

Do not integrate a WhatsApp messaging provider or implement automated bulk provider sending in this phase.

Do not remove or break an existing basic WhatsApp link/manual workflow.

### P2 — Notifications and Realtime

The previous audit reported notification infrastructure as incomplete and Realtime publication as not configured.

- Identify useful in-app notification events.
- Implement notification models and preferences if missing.
- Enable Realtime only where useful.
- Ensure RLS applies to Realtime data.
- Provide a fallback refresh strategy.

### P2 — Payment history and operational clarity

Verify whether the following already exist:

- Complete payment history per resident and cycle.
- Manual transaction references.
- Clear outstanding/partial/paid/late states.
- Late-payment highlighting.
- Audit trail for payment edits and reversals.
- Dashboard totals that reconcile with payment records.
- Action center for overdue rent and pending follow-ups.

Implement only what is missing.

### P2 — Admin operations

A secure admin workflow is required for manual subscription payment verification.

If no admin console exists, implement a minimal one with:

- Pending subscription payment queue.
- Payment reference/evidence review.
- Approve/reject with reason.
- Subscription activation/extension after approval.
- Audit log.
- Strict admin authorization.

## 9. Security, correctness, and quality requirements

### Multi-tenant security

- Every hostel-owned record must be scoped to the correct authorized owner/staff.
- Review every RLS policy and RPC/function.
- Never trust browser-supplied `hostel_id`, `owner_id`, or `user_id` without authorization checks.
- Test with at least two unrelated owner accounts.
- Admin privileges must be explicit and narrowly granted.

### Financial correctness

- Use integer minor units (paise) or an equivalently safe numeric representation.
- Do not use floating-point arithmetic for money.
- Preserve audit trails.
- Handle partial payments, overpayments, duplicate submissions, reversals, and concurrent updates.
- Make payment operations idempotent.
- Keep rent and subscription ledgers separate.
- Reconcile dashboard totals against source records.

### Data lifecycle

- Preserve resident and hostel history when residents move beds or leave.
- Do not delete payment history when changing resident or bed status.
- Define how inactive residents affect future payment cycles.
- Do not generate cycles outside occupancy periods.
- Use database constraints and transactions for atomic operations.

### Testing requirements

At minimum, add or execute:

- Authenticated owner CRUD tests.
- Cross-tenant RLS tests.
- Resident add/edit/deactivate tests.
- Bed assignment/move tests.
- Full and partial rent-payment tests.
- Duplicate payment submission tests.
- Payment-cycle generation and retry/idempotency tests.
- Prepaid coverage-date tests.
- Historical-resident onboarding tests.
- Full initial-cycle rent tests with no proration.
- Future joining-day tests.
- Month-end fallback tests, including leap years and permanent fixed-day behavior.
- Late-status boundary tests.
- Tests proving paid cycles do not become late.
- Tests for partially paid cycle behavior.
- Trial start and expiry tests.
- Read-only expiry enforcement tests.
- Manual subscription UPI approval/rejection tests.

Provider webhook and automated WhatsApp tests belong to their future phases.

## 10. Suggested implementation sequence

### Phase 0 — Read-only discovery and baseline

- Inspect the whole codebase and current git diff.
- Inspect the live Supabase backend.
- Read relevant migrations and function definitions.
- Map UI → API/RPC → database relationships.
- Verify deployed Edge Functions and cron logs.
- Produce `HOSTELRR_AUDIT.md` before changing anything.

### Phase 1 — Stabilize current core operations

- Fix payment-cycle generation and authorization.
- Verify resident, room, bed, payment, and dashboard workflows.
- Fix RLS/security defects.
- Add regression tests and operational error reporting.

### Phase 2 — Subscription MVP

- Add subscription/trial schema and secure entitlement functions.
- Implement 14-day trial start at setup.
- Implement configurable bed-based pricing.
- Implement manual UPI submission and admin verification.
- Enforce read-only access after expiry at frontend and backend layers.
- Add subscription status and renewal UI.

### Phase 3 — Finish current-scope owner operations

- Complete payment history and overdue visibility.
- Verify existing basic/manual WhatsApp workflow without adding provider automation.
- Implement notifications and selected Realtime updates where useful.

### Phase 4 — Production readiness

- Run security and tenant-isolation tests.
- Run full end-to-end tests.
- Verify environment variables by name only.
- Verify Vercel deployment.
- Verify Supabase Auth redirect URLs.
- Verify Edge Function secrets and cron schedules.
- Provide final implementation report with migrations, deployed functions, test results, and remaining limitations.

Provider-based WhatsApp automation and payment gateway integrations are future scope and must not be started unless the owner later requests them.

## 11. Current codebase and database test data

- Continue from the **existing Hostelrr codebase** supplied by the owner.
- Do not assume a new frontend rewrite or clean repository.
- The current database records are **mock/test data**, not production customer data.
- The owner has explicitly said that deleting, resetting, or modifying these records is acceptable when needed for development and testing.
- This is not blanket permission to drop the database schema, remove migrations, disable security, or make destructive architectural changes without a clear reason.
- Before clearing or reseeding data, identify dependencies and explain the intended operation.
- Preserve useful test coverage with deterministic seed data where appropriate.
- The connected Supabase project and repository remain the technical sources of truth.

## 12. How the AI coding agent should work

The owner will provide this document, the existing repository, and Supabase connector/plugin access.

### Required first task — Analyze before implementation

**Do not immediately start coding or assume the existing implementation is missing.**

The first task is to analyze the supplied existing codebase against every requirement in this handoff and identify exactly what needs to be implemented, corrected, or left unchanged.

1. Confirm repository, branch, current working tree, and available tests. Summarize relevant current changes. Do not discard or reset anything.
2. Inspect the actual React/Vite frontend architecture, routes, components, forms, state/data layer, API calls, and existing user flows.
3. Inspect the connected Supabase project and local migrations:
   - Tables and columns.
   - Constraints and indexes.
   - Enums and triggers.
   - RLS policies and grants.
   - RPCs and database functions.
   - Edge Functions.
   - Cron jobs and logs.
   - Relevant data relationships.
4. Trace each requirement from frontend to backend:
   - Resident onboarding.
   - Effective joining date.
   - First rent cycle.
   - Recurring prepaid cycles.
   - Full/partial payment recording.
   - Due/pending status.
   - `late` tagging.
   - Dashboard and payment-history display.
5. Specifically inspect the current payment-cycle generation and `tag-late-cycles` implementation.
6. Determine whether existing behavior already satisfies the confirmed rules.
7. Classify every requirement as:
   - Already implemented and verified.
   - Implemented but incorrect/incomplete.
   - Missing.
   - Conflicting.
   - Not applicable.
8. Cite concrete file paths, function names, table/column names, and migration names in the audit.
9. Produce `HOSTELRR_AUDIT.md` with findings, gap analysis, risks, and a prioritized implementation plan.
10. Separate frontend, database/migration, scheduled-job, and testing work.
11. Before coding, list genuine ambiguities, contradictions, or missing product decisions as concise questions for the owner.
12. Do not ask questions already answered in this handoff.
13. If no clarification is needed, say so and present the audit and implementation plan for approval.
14. Do not apply migrations, delete/reseed mock data, deploy functions, or change configuration during the read-only audit.

### Working rules

- Prefer small, reviewable, logically separated changes.
- Do not make speculative architecture changes.
- Do not replace a working implementation without proving why it needs replacement.
- Inspect and reuse the existing `late` tagging workflow if it already satisfies the agreed next-day rule.
- Do not create duplicate tables, RPCs, Edge Functions, or migrations.
- Never silently change confirmed product decisions.
- Ask before making decisions affecting money, billing, permissions, resident communications, or payment settlement.
- Use migrations for database changes and keep them in version control.
- After each phase, report files changed, migrations added, functions deployed, tests run, results, and remaining risks.
- Do not claim something is complete unless tested against the actual backend.
- Keep secrets out of source code and logs.
- Mock/test records may be reset or modified when useful, but preserve schema integrity, migrations, and security controls.

### Expected deliverables

- Verified current-state audit.
- Prioritized implementation checklist.
- Safe, version-controlled database migrations.
- Updated React/Vite frontend.
- Secure Supabase functions and policies.
- Automated tests for core flows and tenant isolation.
- Deployment and environment setup notes.
- Final implementation report describing completed work, remaining work, and owner actions.

## 13. Decisions that still need explicit confirmation

The following items remain unresolved and should be asked only if relevant:

1. **Final subscription pricing tiers and amounts.** Bed-count pricing is confirmed; exact prices are not.
2. **Admin interface location and access model**, if no admin console already exists.
3. Any implementation-specific ambiguity discovered during the codebase/backend audit that cannot be resolved from this handoff or existing code.

The following rent-cycle decisions are already confirmed and must not be asked again:

- Initial rent is the full cycle amount; no proration.
- If a recurring day does not exist in a month, use the last valid day and make that fallback the fixed recurring day thereafter.
- An unpaid cycle becomes/tagged `late` on the day after its due date.
- Preserve the existing in-app `late` terminology and audit the current mechanism before modifying it.
- No historical rent cycles are created when onboarding an existing resident.
- Tracking starts in the current month using the effective joining date recorded by the owner.

Provider-based WhatsApp automation and payment gateway integrations are future scope and should not block current implementation.

## 14. Initial audit checklist

- [ ] Confirm current repository, branch, git status, and uncommitted changes.
- [ ] Confirm React/Vite app structure and actual package versions.
- [ ] List frontend routes/screens and their data dependencies.
- [ ] List all Supabase schemas, tables, views, enums, indexes, constraints, and triggers.
- [ ] Review every RLS policy and grant.
- [ ] List database functions and inspect relevant definitions.
- [ ] List Edge Functions and deployed versions.
- [ ] Inspect `pg_cron` schedules and recent execution results.
- [ ] Reproduce/fix payment-cycle generation failure if still present.
- [ ] Verify prepaid resident-specific cycle dates and current-month-only onboarding behavior.
- [ ] Verify full initial-cycle rent with no proration.
- [ ] Verify fixed month-end fallback and persistent recurring-day behavior.
- [ ] Verify unpaid cycles become/tagged `late` only from the day after the due date.
- [ ] Inspect payment-cycle and payment data for duplicates/inconsistencies.
- [ ] Identify and preserve existing basic/manual WhatsApp workflow.
- [ ] Check subscription/trial tables and entitlement enforcement.
- [ ] Verify manual UPI rent recording and manual UPI subscription verification.
- [ ] Check Realtime publication and notification infrastructure.
- [ ] Run tenant-isolation and core workflow tests.
- [ ] Produce a gap list and phased implementation plan before implementation.

---

**End of handoff.**

The connected repository and live Supabase project are the authoritative sources for current implementation state. This document is the product/decision baseline and historical implementation map; verify all technical claims before modifying the backend.
