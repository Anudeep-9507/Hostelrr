# Hostelrr Cloudflare R2 Resident Photo Storage Audit

**Phase:** 1 — audit only  
**Scope:** Existing codebase and checked-in Supabase migrations. No application files, schema, buckets, or Edge Functions were modified.

## Summary

Resident photos currently use Supabase Storage bucket `hostelrr-documents` (private). PostgreSQL stores Storage object paths in `residents.photo_path`; UI models expose both path and a generated signed URL. Public join-form applicants also upload a photo to the same bucket and `join_requests.photo_path`; approval copies that path to the resident record. The bucket also contains Aadhaar documents, hostel intake forms, and join-request documents, so moving the whole bucket to R2 would disrupt unrelated file workflows. Onboarding snapshots are persisted to the PostgreSQL `onboarding` table, not this bucket.

No existing Edge Function handles resident photo operations or R2. Existing Edge Functions use Deno and import Supabase JS from `esm.sh`; the project already has a `deno.json` import map. A new authenticated function can follow that runtime convention, but R2 signing/S3 SDK compatibility must be verified against Deno before choosing a dependency.

## 1. Existing implementation and affected files

| File | Current responsibility |
|---|---|
| `src/lib/supabaseAPI.ts` | `getSignedFileUrl()` creates one-hour Supabase signed URLs; maps `photo_path` into resident and past-resident models; maps join request photo; defines `uploadPhoto()` and batch upload helpers; direct resident update serializes `photoPath` into `photo_path`; join request RPC payload carries `photo_path`. |
| `src/pages/JoinForm.tsx` | Public applicant photo selection/preview state, 1 MB client-side limit, JPEG/PNG/WebP accept filter, upload then submit join request with path. |
| `src/pages/Residents.tsx` | Owner resident photo display; upload from detail panel; edit/replacement upload; persists returned path through `editResident()`. Inputs use `image/*`; no explicit file-size check is visible for owner photo uploads. |
| `src/components/AddResidentModal.tsx` | Resolves join request photo path via `getSignedFileUrl()` and displays preview/open link while reviewing or re-adding. |
| `src/pages/Dashboard.tsx` | Displays join-request photo link. |
| `src/pages/BuildingView.tsx` | Displays resident photo in building view. |
| `src/pages/Payments.tsx` | Displays resident photo in payment/resident listing. |
| `src/data/mock.ts` | `Resident`, `PastResident`, and `JoinRequest` types include `photoUrl`/`photoPath`; demo residents use Cloudinary URLs, not Supabase Storage. |
| `src/context/AppContext.tsx` | Moves join request photo metadata into resident state during approval/local flows; resident archival clears UI photo fields in one local path. |
| `src/supabaseClient.ts` | Browser Supabase client; no R2 credentials present in reviewed file. |
| `supabase/migrations/007_join_requests_storage.sql` | Adds join-request `photo_path`, creates/configures private `hostelrr-documents` bucket, storage policies, public request insert and approval logic copying photo path. |
| `supabase/migrations/017_add_resident_file_paths.sql` | Adds resident `photo_path`, `aadhar_document_path`, `hostel_form_path` columns. |
| `supabase/migrations/019_storage_object_hostel_match.sql`, `021_storage_insert_policy.sql` | Additional path-based Storage RLS helper/policies. |

Key functions: `getSignedFileUrl`, `uploadPhoto`, `uploadResidentDocuments`, `uploadJoinRequestDocuments`, resident mapping in the resident fetch functions, join-request mapping, resident update serialization (`photo_path`), `createJoinRequestDb`, and the upload/edit handlers in `Residents.tsx` and `JoinForm.tsx`.

## 2. Current upload, retrieval, display, replacement, deletion flows

### Owner-managed resident photo

1. Owner selects a photo in the resident detail panel or resident edit form (`Residents.tsx`).
2. `uploadResidentDocuments()` calls `uploadPhoto(file, hostelId, 'residents')`.
3. `uploadPhoto()` writes to `hostelrr-documents` at `residents/{hostelId}/photo/{timestamp}-{original filename}`, `upsert: false`.
4. Supabase Storage RLS permits owner uploads to resident paths. App then updates `residents.photo_path` through the existing resident update path.
5. Fetch mapping calls `getSignedFileUrl(photo_path)`, generating signed URLs for one hour. Rendered in Residents, BuildingView, and Payments.

### Public join request photo

1. Applicant selects optional JPEG/PNG/WebP photo in `JoinForm.tsx`; client checks max 1 MB.
2. `uploadJoinRequestDocuments()` repeats the size check and calls `uploadPhoto(file, hostelId, 'join-requests')`.
3. Storage key uses `join-requests/{hostelId}/photo/{timestamp}-{original filename}`. Insert policy permits upload when the hostel exists; no applicant authentication/ownership check is required by design.
4. `createJoinRequestDb()` sends path to the `create_join_request` RPC. Owner review signs it and dashboard/modal show link/preview. Approval RPC copies the join request path into `residents.photo_path`.

### Replacement

Owner replacement uploads a new uniquely named Supabase object, then changes the resident DB path. Existing object is not removed by current upload/update helper. If DB update fails after upload, new object can be orphaned. If update succeeds, old object remains orphaned. Detail-panel upload and edit form both use this behavior. There is no upload preview for owner-selected file identified beyond current-file status; join form has selected filename/status UI.

### Deletion and archive

No dedicated resident-photo delete operation was found in the UI/API search. Archiving is a soft-delete workflow through `archive_resident`; it preserves resident record/history and does not delete the storage object. A local state path clears `photoUrl`/`photoPath`, but this is not evidence of object deletion or DB-path cleanup. Vacating similarly does not show photo object cleanup. Storage delete RLS exists for owner paths but no resident-photo delete caller was found.

## 3. Database impact

- `public.residents.photo_path TEXT`: added in `017_add_resident_file_paths.sql`; currently stores Supabase bucket-relative object path, with code also tolerating legacy Storage URL strings.
- `public.join_requests.photo_path TEXT`: added in `007_join_requests_storage.sql`; stores join applicant photo path, and approval copies it to resident.
- `public.past_residents` photo mapping uses `photo_path` in fetch code; confirm actual column lineage in deployed schema/migration history before implementation. It is not declared in the base resident table block reviewed here, so history/other migrations need reconciliation.
- `aadhar_document_path` and `hostel_form_path` are separate resident columns and remain Supabase Storage consumers under stated photo-only scope.
- No migration is required merely to change the semantics of `residents.photo_path` from Supabase path to R2 key. However, a direct shared join request path cannot safely be treated as R2 without deciding how public applicant uploads and approval transfer work. Keep `join_requests.photo_path` on Supabase Storage or migrate its workflow explicitly in a separate scope.
- Target R2 design should store only object key in resident photo field; no persistent URL should be introduced. Existing path values are Supabase object keys and will not resolve in R2. Demo Cloudinary URLs are separate mock data and are disposable per request.

## 4. Authentication, authorization, and RLS

- `004_rls.sql` enables resident RLS; select/insert/update/delete use `public.user_owns_hostel(hostel_id)`, which checks `hostels.user_id = auth.uid()`. Migration `046_soft_delete_residents.sql` revises select/update policies for deleted records but retains hostel ownership checks.
- `007_join_requests_storage.sql` enables owner-only select/update of join requests, while public insert is allowed for a valid existing hostel. Its Storage policies separately allow public uploads in join-request folder for an existing hostel.
- Storage policies in `007`, plus helper policies in `019` and insert policy in `021`, use key path/folder hostel UUID to enforce owner checks for resident objects. Policies are additive; inspect effective deployed policies before changes because policy names overlap and permissive policies combine with OR semantics.
- Current browser storage SDK calls rely on user Supabase session and Storage RLS. A presign Edge Function must independently validate bearer token and derive the user identity, then verify resident row `id` and its `hostel_id` belongs to authenticated user. Do not authorize based solely on caller-supplied hostel ID/path. For retrieval, similarly verify resident access before issuing GET URL.
- Existing resident update RLS is row/hostel scoped, not column scoped. A client with authorized resident update can submit `photo_path`; with migration, avoid permitting arbitrary cross-tenant keys or bypassing the trusted upload verification step. Consider a narrowly scoped Edge Function or DB RPC for final key update, while keeping ordinary resident edits under existing RLS.
- Join request photo is different: public submitter cannot pass resident-owner authorization. If join photos remain Supabase, preserve present route. If migrated, design a separately constrained public upload and verification path; do not reuse owner-only endpoint assumptions.

## 5. Other Storage dependencies and validation

`hostelrr-documents` also holds:

- Resident Aadhaar documents (`residents/{hostel}/aadhar/...`).
- Resident hostel forms (`residents/{hostel}/hostel-form/...`, images/PDF).
- Join request photos and Aadhaar documents (`join-requests/{hostel}/...`).

Bucket configured private with 5 MiB maximum and allowed MIME types JPEG, PNG, WebP, PDF. Current join-photo UI/API enforce 1 MiB and accept JPEG/PNG/WebP. Owner resident photo inputs use broad `image/*` and have no visible app-level size validation; Storage bucket cap/MIME allow-list is the effective enforcement. No image compression implementation found. Owner preview displays existing photo; join applicant flow shows selected file/status. `getSignedFileUrl()` retries basename and legacy path fallbacks; do not carry those fallback behaviors into R2 without confirming data compatibility.

`supabaseAPI.ts` persists onboarding snapshots in the `onboarding` database table; this is not a Storage dependency. The planned resident-photo-only migration must leave that feature intact.

## 6. Existing Edge Functions/runtime

Current functions: `admin-api`, `generate-payment-cycles`, `tag-late-cycles`. They use Deno `Deno.serve`; Supabase JS is imported from `https://esm.sh/@supabase/supabase-js@2`. `admin-api` validates user JWT with `auth.getUser()` and separately uses service role for administrative work. Scheduled functions use service role with endpoint-specific protection. No R2 variables, S3 client, presigner, or photo endpoint found. Existing functions are examples of runtime conventions, not direct photo-function implementations. Safest extension is a dedicated resident-photo function so unrelated admin/cron behavior and broader Storage code remain unchanged.

## 7. Security and failure considerations for implementation

- Keep all Cloudflare credentials in Supabase Edge Function secrets; never in Vite env, browser bundles, or responses. Use least-privileged R2 credentials scoped to bucket/object operations.
- Keep bucket private. Signed URLs are bearer capabilities; use short expirations, avoid logging them, and return only as needed.
- Key should be generated server-side and unpredictable. Derive extension from an allow-listed MIME type, not raw filename. Verify actual uploaded object's size/content type after PUT; presigned PUT alone cannot prove bytes match declared type.
- Enforce a server-side maximum size before issuing upload capability, and constrain signed operation where compatible. Current product policy differs (owner uploads only capped by bucket; join photo 1 MiB); settle/record intended limit.
- Sequence replacement: authorize resident, presign new key, upload, verify object, commit key, then delete old key. If DB commit fails, best-effort delete new key; if old delete fails, retain old object for retry/cleanup. Avoid deleting old key before DB commit.
- Direct-to-R2 browser PUT needs bucket CORS for actual app origins, `PUT`, required headers, and response headers. User states CORS is configured; verify its exact origin/method/header coverage during implementation.
- Presigned GET expiration can break long-lived `<img>` URLs after page load; fetch/refresh URL on page refresh or expiry and handle image `onError` with a re-fetch path.
- Existing public join-request upload policy is intentionally broader than owner resident access. Keep its behavior separate from authenticated resident photo routes.

## 8. Exact likely change surface and recommended plan

### Likely files/functions to change for resident profile photos only

1. `src/lib/supabaseAPI.ts`
   - Replace resident-photo branch of `uploadResidentDocuments()` with Edge Function presign → direct PUT → finalize/verify API flow.
   - Replace resident `photo_path` URL signing/mapping with authenticated photo URL request or a controlled resolver.
   - Ensure resident update path cannot write arbitrary photo keys; do not silently include undefined file fields as destructive updates.
   - Keep `uploadPhoto()`/join-request path on Supabase Storage unless separately approved for migration.
2. New dedicated Edge Function, e.g. `supabase/functions/resident-photo/index.ts`
   - Auth validation; request parsing; owner/resident authorization; upload URL issuance; uploaded-object verification and DB key commit; GET URL issuance; authorized delete; cleanup/error handling.
3. `supabase/functions/deno.json` and possibly `supabase/functions/import_map.json` / function config
   - Add only Deno-compatible S3 signer dependency after compatibility evaluation. No Node-only package assumptions.
4. `src/pages/Residents.tsx`
   - Route owner upload/replacement and deletion through photo API; preserve existing loading/toast/image UI; add explicit error/refresh behavior as needed.
5. `src/pages/BuildingView.tsx`, `src/pages/Payments.tsx`, `src/components/AddResidentModal.tsx`, `src/pages/Dashboard.tsx`
   - Only adjust where resident or join-request photo URLs are resolved/renewed. Dashboard/AddResidentModal currently include join-request photos, which may stay Supabase.
6. Potential new SQL migration only if required to protect resident `photo_path` updates or introduce a narrowly scoped finalization RPC. No schema change is inherently required for storing an R2 key in the existing `TEXT` field.

### Recommended sequence

1. Confirm deployed schema and effective RLS/Storage policies, especially past-resident `photo_path` and onboarding snapshot bucket/path. Decide whether migration covers active resident photos only; keep join-request photo and other documents in Supabase Storage.
2. Define owner photo MIME/size policy and R2 metadata/key format; validate Deno-compatible S3 signing package without frontend dependencies.
3. Add a dedicated Edge Function with separate upload-intent, finalize, read-URL, and delete operations. Verify resident ownership from DB under authenticated identity; constrain key to resident/hostel association; prevent client-selected arbitrary DB keys.
4. Update resident photo writer/reader callsites while leaving Aadhaar, hostel forms, onboarding snapshots, and join-request storage paths unchanged.
5. Add safe replacement cleanup and failure recovery, then exercise the requested upload/read/refresh/replace/delete/authorization/expiry/type/size/database-key/credential-exposure cases in staging.
6. Keep Supabase bucket and policies until all callers are identified and tested. Remove old photo objects only after explicit retention/cleanup plan; never remove shared bucket as part of this migration.

## 9. Audit limitations

This report reflects repository source and checked-in migrations, not live Supabase deployment state. Live secrets, deployed Edge Function settings, actual bucket contents, current RLS catalog, R2 policy, and exact CORS configuration were not inspected. No uploads or destructive tests were performed.


