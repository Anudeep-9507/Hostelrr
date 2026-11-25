# Hostelrr Admin Portal Audit

Audit date: 15 November 2026. This document separates the checked-in implementation from the connected `hostelrr-prod` Supabase project (`lfgouwvdwxlkirqqlwmt`).

## Frontend architecture

- **Existing:** React 19, Vite 6, TypeScript, React Router 7, Tailwind CSS 4, Lucide, Recharts, and Sonner. `src/routes/AppRoutes.tsx` owns public and protected route declarations; `AuthGuard` protects the owner app; `AppLayout` owns its navigation.
- **Existing:** `AppProvider` initializes the Supabase session and loads one owner's hostel into a client context. `src/lib/supabaseAPI.ts` contains direct table/RPC calls. Existing loading, error, empty state, skeleton, and toast components are available.
- **Existing:** `/admin/subscriptions` is mounted under the ordinary authenticated owner route guard. It provides bed pricing, subscription UPI settings, payment review, and subscription extension. It calls admin-checked SQL functions but lacks a separate admin login and admin shell.
- **Existing:** The UI uses a responsive Tailwind style system, `Plus Jakarta Sans`, Lucide, Recharts and Sonner. The app context also seeds demo fixtures before onboarding; those must never be used for platform statistics.
- **Not found:** No project-root `AGENTS.md` exists. A dependency-owned `node_modules/recharts/AGENTS.md` is not project guidance.

## Supabase architecture

- **Checked in and confirmed on live project:** `public.users` mirrors `auth.users`; `hostels` owns the tenant boundary; floors, rooms, beds, residents, payment cycles, payments, activity logs, and onboarding hold operational data.
- **Checked in and confirmed live:** `hostel_subscriptions`, `subscription_plans`, `subscription_payment_submissions`, `subscription_platform_settings`, and `subscription_admin_audit` implement a 14-day trial, bed-count pricing, manual UPI submission and review, and admin action history.
- **Existing backend functions:** `is_platform_admin`, admin plan/payment/settings functions, payment review, and subscription extension check `auth.jwt()->app_metadata->>'platform_role' = 'admin'`. Data-changing subscription operations write `subscription_admin_audit`. Owner subscription reads/writes are mediated by existing functions and RLS.
- **Existing operations:** resident rent payments use `payments`/`payment_cycles`; these are separate from subscription payment claims. `activity_logs` is a per-hostel operational log, distinct from the platform admin audit. Late rent tagging and payment-cycle generation use India-time-aware backend functions/Edge Functions.
- **Live security check:** RLS is enabled on every public table. Operational table policies scope owners by `user_owns_hostel(hostel_id)`; direct admin tables revoke browser table grants and expose checked RPCs. `users` permits a user to select/update only their own profile. No live policies currently provide platform-wide read access to admins.
- **Live schema check:** 18 public tables; 15 hostels, 26 profiles, 102 residents, 177 beds, 58 resident payment records, 15 subscriptions, and no subscription payment submissions at audit time. These counts are contextual and will change.
- **Not found in checked-in migrations/live public schema:** account suspension state, a platform-wide dashboard/list/detail API, general platform settings/feature flags, support session records, admin-facing owner/session revocation, or server-side Auth user deletion/recovery workflows. No separate Auth Admin Edge Function exists.
- **Storage/cron:** Existing Edge Functions include `generate-payment-cycles` and `tag-late-cycles`; `supabase/functions/CRON_SETUP.md` documents scheduled operations. Resident documents use existing storage path and RLS rules. A platform-wide system health endpoint and admin-visible cron/storage health are absent.
- **Verified billing incident:** Supabase logs from 14 Nov 2026 show repeated `42501 Access denied` / HTTP 403 responses from the deployed `generate-payment-cycles` Edge Function while it called the owner-checked `generate_payment_cycles(uuid)` RPC for individual hostels. The old cron history marked the outer `net.http_post` statement successful, which only confirms that the request was queued, not that billing ran successfully. At audit time, the *current* `cron.job` definitions call `public.generate_all_payment_cycles()` and `public.tag_late_cycles()` directly at 00:00 and 00:02 IST, matching checked-in migration 048. The history inspected predates/does not prove a successful run of those current commands; verify the next execution and resulting cycle/status changes. The current `generate_all_payment_cycles()` uses the private per-hostel generator and avoids the owner entitlement check that caused the logged 42501s. Do not label the old cron invocation successful billing.

## Authentication and authorization

- **Existing:** One Supabase Auth client (`src/supabaseClient.ts`) and email/password owner login. `AppProvider` restores session and subscribes to auth changes. Signup is public for owners.
- **Existing:** The trusted admin signal is Supabase `app_metadata.platform_role`, not client-editable `user_metadata`. `is_platform_admin()` uses this claim and admin RPCs repeat that check. The claim must be assigned only through Auth administration.
- **Gap:** Owner `AuthGuard` is not an admin guard. The current subscription admin route redirects non-admins only after rendering/loading; a dedicated `/admin/login` and isolated `/admin/*` layout are missing.
- **Gap:** Admin RPC privilege is available only for existing subscription operations. Platform-level lists and Auth Admin operations cannot safely be added as browser-side queries because owner RLS blocks them and service-role secrets must not enter the frontend.

## Reusable functionality

- Existing tenant schemas, ownership RLS, subscription/trial tables and admin RPCs; payment verification and extension audit behavior; shared Supabase client; router; Tailwind components; Recharts; Sonner; and IST date utilities.
- Existing owner payment data is rent paid to hostel owners. Subscription submissions are the only current Hostelrr revenue records. MRR can be derived from active subscription plans and must be clearly marked as a current run-rate rather than historical collections.

## Proposed architecture and implementation sequence

1. Write a separate admin login at `/admin/login` using Supabase Auth email/password; never offer admin signup. Use a dedicated `/admin/*` route guard that checks the signed-in user's trusted `app_metadata` claim through the existing `is_platform_admin()` RPC and a separate admin layout. Add a safe logout path and preserve the normal owner sign-in flow.
2. Replace the legacy subscription-only admin screen with an admin portal shell and route overview, owners, hostels, subscriptions, subscription payments, audit, administrator, and settings pages. Build data only from live Supabase RPCs/functions, with visible loading, empty, and error states.
3. Reuse existing subscription pricing/review/extension RPCs. Add only missing privileged operations through a trusted server boundary that validates the caller's JWT and `app_metadata.platform_role` on each request. A service-role key, if required for Auth Admin operations, stays only in Edge Function secrets.
4. Add minimum migrations for a generalized admin audit record/API, platform settings only when the app actually consumes and enforces those settings, and explicit account suspension only if an enforcement policy can be applied at auth and backend boundaries. Audit any future mutation transactionally.
5. Do not silently implement full owner impersonation: current RLS is bound to `auth.uid()` and there is no safe impersonation/session proxy. Prefer time-limited, admin-audited, read-only support inspection through a trusted server endpoint. This avoids replacing the admin's Auth session and avoids bypassing tenant RLS from the browser.
6. Keep account deletion disabled until a retention-preserving archival/anonymization design exists. Existing cascading foreign keys would delete hostel, resident, rent, subscription, and audit history. Password recovery can use the normal Supabase recovery-email mechanism; session revocation requires a trusted Auth Admin endpoint.
7. Preserve existing joining-date rent cycles, prepaid charges, and IST late tagging. Use `Asia/Kolkata` calendar boundaries for admin aggregation and separate rent receipts from subscription revenue.

## Missing functionality / security considerations

- No account active/suspended column or suspension enforcement; no admin account controls. A UI-only ban switch would be inadequate.
- Auth user list and last sign-in require trusted Auth Admin access; browser clients cannot safely query `auth.users`.
- Deletion is currently destructive through cascading relationships and conflicts with retention of financial/audit records.
- An impersonation session cannot safely obtain owner permissions with current JWT/RLS semantics. A new read-only support endpoint is the safer support workflow.
- Live project advisors could not be retrieved in this audit because the connector rejected the required `type` argument; the policies, grants, functions, and schema were inspected directly instead.
- Live Supabase advisors reported six RLS-enabled/no-policy tables (all have browser table privileges revoked in the existing subscription migration), several mutable-search-path warnings, missing FK indexes, and disabled leaked-password protection. These are broader existing findings, not introduced by this dashboard. Review [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search-path advisor](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), and [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Deployment, Auth metadata provisioning, Edge Function secret setup, and production migration execution are operational steps and must be reported separately from checked-in code.

## Required database / server work

- Existing subscription tables and admin RPCs cover plans, UPI settings, payment review, and extensions; do not duplicate them.
- A server-side admin data API is needed for all-owner/all-hostel aggregates and Auth user metadata. It must verify the signed JWT and trusted app metadata before using elevated access; never trust request body role/user IDs.
- Separate platform audit and settings records are needed only for new platform-level changes. New account suspension, session revocation, support inspection, and deletion must be implemented in trusted server functions with explicit audit and retention semantics.
- Provision the initial account through Supabase Auth, then set `app_metadata.platform_role=admin` using a trusted Auth Admin process. There is no default credential or public admin registration.

## Implementation sequence

1. Audit (this file).
2. Secure admin login, guard, layout, and live overview foundation.
3. Owners, hostels, subscriptions, and payments, reusing schema/RPCs.
4. Trusted admin API and audit-backed account controls; system/settings/admin pages where supported.
5. Safe read-only support inspection; no session swapping.
6. Verify type/build and review security boundaries. Live database deployment and Auth provisioning are separate configuration steps.


## Provisioning update (2026-11-15)

The requested existing Auth account (nudeep.networks@gmail.com) was verified in uth.users and granted pp_metadata.platform_role=admin, preserving its existing provider metadata. The account needs a fresh sign-in/token to receive the claim. The HOSTELRR_APP_URL Edge Function secret remains unset because this session has no Supabase Edge secret-management tool; configure it to the production app origin before using password-recovery actions. The project handoff records https://hostelrr-app.vercel.app as the production URL.


## Admin dashboard load fix (2026-11-15)

Production logs showed admin-api requests failing because service_role had no SELECT privileges on the subscription tables and no SELECT/INSERT privileges on the subscription audit table. Migration 054 grants only those required operations to service_role; authenticated and anon roles retain no access. Also removed a stale hostels.address field from the overview query. Redeployed admin-api as version 2. Subsequent dashboard requests returned HTTP 200, and the required PostgREST queries all returned HTTP 200.


## Admin settings route fix (2026-11-15)

The settings route called admin_get_subscription_payment_settings and admin_list_subscription_plans through the service-role client, but these secure-definer RPCs intentionally grant execution only to authenticated users and enforce is_platform_admin() against the caller JWT. admin-api now forwards the already-verified admin bearer token for these RPCs and for admin_extend_hostel_subscription, preserving their database authorization checks. Deployed as admin-api version 3. Subsequent browser-origin admin-api requests returned HTTP 200.


## Password recovery redirect for local testing (2026-11-18)

HOSTELRR_APP_URL is a single-value Edge Function secret, so it cannot contain both production and localhost origins. admin-api now uses the request Origin only when it exactly matches the allowlist (https://hostelrr-app.vercel.app or http://localhost:3000); all other origins use the configured HOSTELRR_APP_URL or production fallback. Deployed as admin-api version 7. Supabase Auth URL Configuration must also allow both redirect URLs (including the /admin/login recovery path) before recovery emails will redirect successfully. A recovery email was not sent as part of deployment verification.
