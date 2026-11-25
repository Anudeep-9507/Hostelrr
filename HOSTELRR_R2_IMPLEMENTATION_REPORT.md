# Hostelrr R2 photo migration implementation

## Status

Code and pending migration are prepared. Supabase production Edge Function deployment was attempted but automatic approval review rejected it because this function creates a new public upload/cleanup surface. No function or schema change was deployed. Supabase production is connected for read-only inspection; Cloudflare R2 and app deployment are not connected. Existing workspace edits were preserved.

## Architecture implemented

- `supabase/functions/resident-photo/index.ts` is the trusted R2 API. It validates owner JWTs, derives hostel ownership from PostgreSQL, makes 5-minute PUT / 10-minute GET URLs, performs a byte-bounded R2 read, checks stored MIME and file signature, decodes the image, and keeps bucket credentials server-side.
- Resident keys follow `residents/{hostelId}/{residentId}/{uuid}.{ext}`. Join photo intents reserve the future request ID and use `join-requests/{hostelId}/{requestId}/{uuid}.{ext}`. A one-time random token is stored as SHA-256, bound to hostel/request, and consumed atomically with join-request creation.
- Public join uploads are limited to JPEG/PNG/WebP, 1 MiB and 10 intents per hour. Rate limits use only `CF-Connecting-IP`; requests fail closed unless deployment explicitly enables this trusted source and the header is present. Resident uploads are limited to JPEG/PNG/WebP and 3 MiB, matching live bucket's verified 3 MiB limit.
- Approval RPC copies the exact verified join key into the resident row. It never duplicates the R2 object.
- Resident replacement/deletion detaches the prior key only after the new resident key is persisted; database triggers enqueue detached keys. A service-only worker claims queued keys only when neither residents nor join requests reference them. Claimed/deleted keys cannot be reattached, and failed deletes are retried. Expired pending/rejected request photos are detached and queued after 14 days. Abandoned resident and public upload intents are queued after a 24-hour safety period.
- Supabase Storage calls and Aadhaar-document / hostel-form UI and helpers were removed from frontend code. Aadhaar numbers remain resident/application information; only document uploads were removed. Cloudinary demo images remain.

## Files

Created:

- `supabase/functions/resident-photo/index.ts`
- `supabase/config.toml`
- `supabase/migrations/20261116120000_r2_photo_storage_and_document_removal.sql`
- `supabase/migrations/20261116160000_harden_r2_photo_security.sql`
- `supabase/functions/resident-photo/photo-validation.ts`
- `supabase/functions/resident-photo/photo-validation.test.ts`
- `supabase/tests/r2_photo_security.sql`
- `HOSTELRR_R2_IMPLEMENTATION_REPORT.md`

Modified:

- `src/lib/supabaseAPI.ts`
- `src/pages/Residents.tsx`
- `src/pages/JoinForm.tsx`
- `src/components/AddResidentModal.tsx`
- `src/pages/BuildingView.tsx`
- `src/pages/Payments.tsx`
- `src/data/mock.ts`
- `src/context/AppContext.tsx`
- `supabase/functions/deno.json`

## Migration changes (pending apply)

- Adds isolated upload-intent and R2 delete-retry tables.
- Restricts photo-key writes to the service function and trusted approval transaction.
- Replaces join-request creation with a server-only RPC and removes public legacy RPCs that accepted arbitrary photo paths.
- Preserves existing owner approval/rejection behavior while removing document-path copies.
- Drops `residents.aadhar_document_path`, `residents.hostel_form_path`, and `join_requests.aadhar_document_path`.
- Adds a service-role-only atomic claim function for 14-day request-photo cleanup.
- Does not remove the shared Supabase Storage bucket or its current policies before live data inventory and R2 validation.

## Required deployment setup

1. Verify all configured `R2_*` function secrets exist; expected bucket is `hostelrr-resident-photos`. Do not copy credentials into Vite variables.
2. Add Supabase Edge Function secret `APP_ALLOWED_ORIGINS` with comma-separated exact origins. Include `http://localhost:3000` for local Vite use and actual production/staging origins. Production host was not discoverable in repository configuration.
3. Verify the Supabase edge gateway overwrites `CF-Connecting-IP` with the actual client IP (including a spoofed-header test). Only then set `TRUST_CF_CONNECTING_IP=true`; otherwise public photo intents return 503. Never fall back to arbitrary `x-forwarded-for`.
4. Deploy the Edge Function and apply the timestamped migration after reviewing its SQL against the live migration catalog:

   ```powershell
   npx supabase functions deploy resident-photo --project-ref <PROJECT_REF>
   npx supabase db push --project-ref <PROJECT_REF>
   ```

   The new hardening migration depends on the first R2 migration. In staging, apply both, run the database and Edge Function tests, then coordinate function deployment with migration application. This task did not deploy or apply either migration.

5. Set R2 CORS on the private bucket. Replace origin placeholders with actual app origins:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://<production-host>"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Browser uploads use `PUT`; signed reads use `GET`. Server-side HEAD/DELETE do not need browser CORS. Current bucket CORS and privacy settings could not be queried here.

6. Schedule cleanup daily in Supabase Dashboard → Edge Functions → `resident-photo` → Schedules, sending `{"action":"cleanup"}` with `Authorization: Bearer <service-role-key>`. Alternatively schedule `POST /functions/v1/resident-photo` through `pg_cron` + `pg_net` using the URL and service key stored in Supabase Vault. Never put the service key in checked-in SQL or frontend code. Daily schedule is 18:30 UTC (00:00 Asia/Kolkata).

## Supabase Storage cleanup

No Supabase Storage usage remains in frontend code after the changes. Live Supabase inspection found `hostelrr-documents` private with 3 MiB limit and no MIME allow-list; inventory has 1 JPEG photo and 2 zero-byte folder placeholders (3 objects total). No document object was found. Bucket remains because R2 workflows have not been deployed or tested. Before removal:

1. Deploy function, set origins/CORS, apply migration, and complete the R2 test matrix below in staging.
2. Inventory `hostelrr-documents` through Supabase Storage; identify all remaining objects and count by `residents` / `join-requests` and document categories. Preserve no required files, per owner authorization, but remove documents only after confirming names and counts.
3. Confirm live frontend callers and other services have no bucket dependency.
4. Delete old Supabase document and legacy photo objects after deciding existing resident photo migration/retention. Existing DB photo paths are legacy Supabase object keys and are not automatically copied to R2 by this change; demo Cloudinary URLs remain unchanged.
5. Drop only the Storage policies/helpers for `hostelrr-documents`, then delete bucket once empty and unused. This destructive live operation is intentionally not performed here.

## Tests

Executed locally:

- `npm run lint` — passed (`tsc --noEmit`).
- `npm run build` — passed. Existing CSS import ordering and large-bundle warnings remain.
- `npm test` — passed, 5 tests.
- `npx --no-install esbuild supabase/functions/resident-photo/index.ts --loader:.ts=ts --format=esm` — passed syntax/transformation check. It does not type-check Deno imports.
- Added Deno tests for valid PNG, invalid bytes, MIME/extension mismatch, and oversize images. They were not run: Deno is not installed. No token replay, concurrent submission, rate-limit, cross-hostel, or cleanup integration tests were executed.
- Added `supabase/tests/r2_photo_security.sql` catalog assertions for grants, direct insert paths, trigger coverage, atomic intent checks, and serialized cleanup. Not executed because no local database/CLI was available.
- The Supabase CLI was unavailable; `npx supabase` stalled while attempting to fetch it. Docker is installed but its engine is not running. Therefore no local/staging migration execution or SQL cleanup test was possible. Production was not modified.
- Repository search — no active frontend `supabase.storage`, `hostelrr-documents`, Aadhaar-document-path, hostel-form-path, or document-upload helper references remain.

Supabase inspection of live project `hostelrr-prod` also completed read-only: project is ACTIVE_HEALTHY; `hostelrr-documents` is private, 3 MiB cap, no MIME allow-list, 3 objects (one JPEG plus two zero-byte folder placeholders); resident and join-request tables each have 2 non-null photo paths and no URL values; document-path columns remain; public join-request insert policy and public `create_join_request` overloads remain deployed. Cron, pg_net, pgcrypto, and Supabase Vault extensions are enabled, but Vault has no secrets for the cleanup job. Production deployment review rejected the new Edge Function deployment as a new public upload/cleanup surface. No workaround was attempted. Migration, scheduling, and deployment remain pending.

Owner/public uploads, authorization, URL expiry, actual R2 CORS, cleanup scheduling, and credential-exposure checks require deployment and staging accounts. They have not been claimed as passed.

## Known limitations pending deployment validation

- Existing Supabase photo objects/paths are not migrated automatically; they need a controlled copy or explicit disposal decision.
- Live resident and join-request tables each have 2 non-null photo paths, with no URL values. One physical photo object exists in Supabase Storage, so other references may be stale or missing. Live RLS catalog shows owner-scoped resident/join data and public direct join-request inserts; pending migration removes legacy insert RPC/policy entry points. Recheck policies after migration.
- The actual production origin, bucket CORS, R2 bucket privacy, and configured Edge Function secret availability cannot be verified here.
- Public abuse limiting uses only the Cloudflare `CF-Connecting-IP` header. Requests fail closed until `TRUST_CF_CONNECTING_IP=true` and the header is present. Verify the gateway overwrites spoofed values before enabling.
- The deployed `hostels` table has no active, disabled, or accepting-join column. The current public lookup/submission behavior admits every existing hostel, so this implementation preserves that rule rather than inventing a flag. If product eligibility rules change, add a real schema-backed rule to both intent and final-submit checks.
- Supabase migration and function deployment remain pending; do not treat repository changes as deployed behavior.

## Pre-production hardening review

Corrections in the new migration and function:

- Join submission now locks the intent row, checks unconsumed/unaborted state, token hash, expiry, hostel/request/key association, and creates the request plus consumes the token in one RPC transaction. Replays and racing submissions fail. Abort locks the same row and only marks unconsumed intents aborted; object deletion enters the queue. The row stays until its signed PUT URL expires plus the cleanup safety window.
- Resident finalize/abort now serialize against each other in service-only RPCs. The image verifier checks JPEG/PNG/WebP signatures, R2 Content-Type, expected MIME and key extension, then fully decodes with ImageScript 3.20.3 and a 16-million-pixel limit. R2 range reads cap downloaded bytes.
- Trusted-IP source must be explicitly enabled after gateway verification; missing source/config fails closed. `x-forwarded-for` is never used. Rate count remains an atomic upsert and stale rate rows are removed by cleanup.
- Photo-key guard now fires on INSERT and UPDATE, rejects non-service writes except the approval transaction, and blocks keys already claimed/deleted by the queue. Reference changes queue old keys. Queue claims check resident, join-request, and active upload-intent references under per-key advisory locks; the key remains blocked while external deletion runs, and failure releases it for retry.
- Cleanup now queues abandoned join and resident uploads, removes old consumed intents without deleting their request photos, runs 14-day request-photo retention, then processes only claimed, unreferenced queue objects. Advisory locks serialize new references against queue claims. CORS state is local to each request; preflight only echoes exact configured origins. Cleanup requires the service-role bearer.
- New migration: `20261116160000_harden_r2_photo_security.sql`. Previous migration was not edited.

Runtime and integration test status: `npm run lint`, `npm run build`, existing `npm test` (5 passed), and esbuild transformation passed. New Deno image tests are present but unrun. `deno check`, concurrency tests, database integration tests, and staging SQL validation remain unrun because Deno, Supabase CLI, and a running local database were unavailable. No production deployment, migration, bucket/object deletion, or secret change occurred.
