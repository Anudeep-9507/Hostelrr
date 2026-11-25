# Hostelrr Mobile Readiness Audit — Phase 1 (Pre-Capacitor)

**Audit type:** Read-only source inspection  
**Scope:** Current React/Vite frontend, tracked Supabase migrations/functions, and Vercel project configuration  
**Limitations:** No Capacitor project or physical-device build exists in the inspected repository. No 360, 375, 390, 430 px or tablet screenshots/device interactions were captured. Responsive findings below are based on source inspection; statements about runtime behavior are risks to validate, not verified device failures. Production Supabase, R2 CORS, Cloudflare Turnstile, Vercel domain settings, and app-store configuration are not available in the repository and were not inspected. No application files, settings, migrations, or functions were changed for this audit.

## 1. Executive Summary

**Readiness: Conditional NO-GO for native release; GO to a bounded Capacitor proof-of-concept after resolving origin and link decisions.** The React app is a conventional Vite static build and has no source-level dependency on an unavailable native runtime. Existing responsive layouts cover many primary screens, and the Supabase/R2 server-side security architecture can remain shared. Capacitor integration is technically feasible without rewriting the frontend.

The main confirmed integration blockers are origin-dependent behavior and URL construction:

- Route dispatch depends on `window.location.hostname` and redirects `hostelrr.in` app paths to `app.hostelrr.in` ([src/routes/AppRoutes.tsx](src/routes/AppRoutes.tsx):18–20, 38–60). A local Capacitor WebView origin will not match either hostname.
- Public join QR URLs use the current origin ([src/components/QRCodeModal.tsx](src/components/QRCodeModal.tsx):53–56), which would make QR codes point to the app's local WebView origin on native.
- The resident-photo Edge Function allowlists configured HTTP(S) origins and rejects other origins for most actions ([supabase/functions/resident-photo/index.ts](supabase/functions/resident-photo/index.ts):15–31, 191–203). Default Capacitor origins include custom schemes, so native photo and join uploads may be rejected. Join-photo Turnstile verification also binds the token hostname to the request origin hostname (162–175).
- Password-reset redirect uses `window.location.origin` ([src/pages/SignIn.tsx](src/pages/SignIn.tsx):59–62). Native reset return handling and Supabase redirect allowlisting are not configured or verified.

Other release risks include native handling of WhatsApp links, file downloads, browser popups, clipboard access, persistent session behavior, Android back/deep links, and narrow room-layout controls. These need targeted implementation and real-device validation. No confirmed P0 security defect was found in the reviewed native-readiness paths. Do not weaken RLS, auth, signed URL, Turnstile, or origin protections to solve compatibility.

## 2. Existing Architecture

- **Frontend:** React 19 + TypeScript, Vite 6, Tailwind 4, React Router 7. `src/main.tsx:1–12` mounts `BrowserRouter`; route components are in `src/routes`. Main dependencies are in `package.json:14–40`; no Capacitor packages/config are present.
- **Backend:** Supabase JS client in `src/supabaseClient.ts:1–10`; app services call Supabase Auth, Postgres APIs, and Edge Functions. Frontend uses the public/anon key, not a service-role key. Values are intentionally omitted here.
- **Authentication:** Password sign-in is in `src/pages/SignIn.tsx:17–47`; app session bootstrap and auth state listener use `getSession` and `onAuthStateChange` in `src/context/AppContext.tsx:303–314`. Route gating is in `src/routes/AuthGuard.tsx:39–70`.
- **Photos:** Frontend asks `resident-photo` for upload intent, uploads bytes to a short-lived R2 presigned URL, then finalizes through the function. Retrieval is mediated by signed URLs. See `src/lib/supabaseAPI.ts:57–79,147–202` and `supabase/functions/resident-photo/index.ts:247–296,329–364`.
- **Payments:** Payment records are app data; WhatsApp reminders are generated and opened in `src/pages/Payments.tsx:147–157`. Subscription UI displays manual UPI details and accepts a UTR; no `upi://`/`intent://` payment initiation or callback handling was found. A payment gateway callback flow was not found in searched app source.
- **Deployment:** `package.json:6–12` has Vite dev/build/preview scripts. `vercel.json` rewrites paths to `/index.html` for SPA routing. Live Vercel host/domain behavior was not verified.

## 3. Mobile Responsiveness Audit

**Method:** Source-level review of major route components and shared navigation/modal patterns. This is not a visual pass at the requested viewport widths. Existing mobile behavior is often intentionally responsive; items below identify patterns to preserve and specific risk areas to validate.

| Area | Source evidence and assessment | Priority |
|---|---|---|
| App shell/navigation | `src/layouts/AppLayout.tsx` provides a mobile sidebar overlay and bottom navigation with safe-area spacing. Validate at 360 px with keyboard open, long page titles, and modal overlays so fixed navigation does not cover actions. | P2 |
| Dashboard/activity/notifications | `src/pages/Dashboard.tsx` has separate mobile cards and desktop tables (for example 656 onward); the dashboard supports responsive grid layouts. Exercise notifications, join-request details and reminder dialogs at 360–430 px; static source alone cannot establish modal height/scroll behavior. | P2 |
| Rooms & beds | `src/pages/BuildingView.tsx:451,460` forces title and subtitle to `whitespace-nowrap`; status filters are non-wrapping chips around 466–497. `src/components/BedLayoutBuilder.tsx:520–523` constrains a 316×396 editor canvas. `BuildingView.tsx` includes a roughly 280×350 room/bed canvas around 1858 onward. Test at 360 px, especially editor/modal width, drag/touch gestures and landscape. | P1 |
| Residents | `src/pages/Residents.tsx` has mobile cards and horizontal filter chips (around 769–820), plus photo and download actions. Test long names, large text, add/edit modal, and download/open flows on device. | P2 |
| Payments | `src/pages/Payments.tsx:614–666` uses horizontally scrollable, non-wrapping status controls; transaction history has mobile cards and desktop table (around 957–1048). Validate bulk-reminder modal, selection actions, and number/date wrapping on 360 px. | P2 |
| Joining requests | `src/pages/JoinForm.tsx` uses stacked fields with responsive multi-column groups and a third-party Turnstile widget. Check widget rendering, keyboard scrolling, photo selection, and form submission on Android/iOS WebViews. | P1 |
| Notes | `src/pages/Notes.tsx:144–216` switches from list to editor on narrow screens and provides a mobile back control; content has min-width guards and scroll areas. Good responsive structure; check keyboard resizing, editor actions and long note text. | P2 |
| Settings | `src/pages/Settings.tsx:439,476` stacks form grids at small widths; section tabs scroll horizontally at 554. CSV export uses browser download (216 onward). Check tab discoverability, save actions under bottom navigation, and exports on actual devices. | P2 |
| Admin | `src/pages/AdminConsole.tsx:30` intentionally wraps tables in `overflow-x-auto` with `min-w-[700px]`; admin navigation becomes horizontal on small widths in `src/layouts/AdminLayout.tsx`. This is usable by panning but not compact. Decide whether admins are in the mobile release scope. | P3 |
| QR poster/photo previews | `src/components/QRCodeModal.tsx:63–105` generates and downloads a PNG through `html-to-image` and an anchor; private photo links use `window.open` in `src/components/PrivatePhoto.tsx:45–56`. Device share/save behavior needs validation. | P2 |

No app-wide numeric minimum touch-target audit or visual viewport test was performed; do not infer touch compliance from Tailwind class names alone. Highest-risk responsive areas are the bed-layout canvas, browser download/open interactions, keyboard-adjusted modal/editor height, and host-level fixed navigation.

## 4. Routing and Authentication Audit

### Routing

`BrowserRouter` is confirmed (`src/main.tsx:3–12`). Nested route definitions include public sign-in, signup and join form, admin route tree, and guarded owner app (`src/routes/AppRoutes.tsx:63–87`; `src/routes/ProtectedAppRoutes.tsx`; `src/routes/AuthGuard.tsx:39–70`). Vercel's SPA rewrite supports web refreshes at nested paths in the checked config, but the live production behavior was not tested.

Host-dependent dispatch is the native incompatibility: `AppRoutes.tsx:18–20,38–60,87` recognizes the marketing/app hostnames, redirects app paths from the marketing domain, and applies special `/login` handling on the app host. Native local origin matches neither. A future native runtime branch should preserve React routes while defining explicit app-link/public URL behavior; configure Android App Links/iOS Universal Links and handle incoming URLs with the Capacitor App plugin. Deep-link association files/domain ownership were not found or verified. Confirm system Back behavior, including modal close before route navigation and route history, on Android; iOS navigation is app-controlled and needs deliberate back affordances.

Query strings are used for the resident `filter` state (`src/pages/Residents.tsx:35,80,119`). The marketing-host redirect preserves pathname, search and hash (`AppRoutes.tsx:46`). No business-critical OAuth hash/code callback flow was found. `navigate(-1)` exists in some screens; browser history availability and empty-stack behavior require native testing.

### Authentication and session persistence

`createClient(baseUrl, publicKey)` has no custom auth options (`src/supabaseClient.ts:1–10`). Therefore supabase-js defaults apply; Supabase documents browser session persistence and refresh behavior in its [Auth reference](https://supabase.com/docs/reference/javascript/auth) and [client initialization reference](https://supabase.com/docs/reference/javascript/initializing). The app reads the initial session and subscribes to auth changes (`AppContext.tsx:303–314`). It also stores app preferences/onboarding/profile data in `localStorage` (`AppContext.tsx:87–220,326,470–480`) and an idempotency request ID in `sessionStorage` (`src/lib/supabaseAPI.ts:1058–1079`).

Static evidence supports that refresh/persistence are SDK-managed, but it cannot prove persistence across Android process termination or iOS eviction. Persistent WebView storage is expected to retain local storage across app launches, while web and native origins have separate stores. Device tests must cover sign-in, background/terminate/reopen, token refresh after suspension, logout, storage clearing, and two logged-in devices; cross-device sessions are not shared local storage. No explicit OAuth provider use or cookie/third-party-browser dependency was found. Signup calls Supabase Auth; confirmation settings and production allowlists are external and unverified.

Password reset redirects to `${window.location.origin}/` (`SignIn.tsx:59–62`), unsuitable as a final native return strategy without verified universal/app links and Supabase Auth redirect allowlisting. Keep the present adapter unchanged during this audit. A native secure-storage adapter could be evaluated later for at-rest token protection, but is not required to prove Capacitor compatibility and introduces migration/locking tradeoffs.

## 5. Camera and File Upload Audit

Resident and public join uploads use standard browser `File`, `Blob`, `FileReader`, `FormData` and `fetch` patterns (`src/lib/supabaseAPI.ts:147–202`; `src/pages/JoinForm.tsx:128–150,400–417`). Resident selection is in `src/pages/Residents.tsx:948–959,1438–1454`. Existing flow accepts JPEG/PNG/WebP; the function enforces 3 MiB for resident photos and 1 MiB for join photos and validates content (`resident-photo/index.ts:7–10,247–296,380–398`). No client-side compression/resizing or progress UI was found in the inspected helper; errors abort the upload flow. Native Camera output can be adapted to a `File`/`Blob` and passed through the same signed-intent path, subject to preserving MIME, size and byte validation. Large original camera images will often exceed current caps, so resize/compress before upload or constrain capture.

The `resident-photo` function requires an allowlisted Origin for non-cleanup actions (`index.ts:15–31,191–203`). Its parser accepts only HTTP(S) values. A default iOS `capacitor://localhost` request origin will therefore fail the current allowlist; Android default origin differs as well. Do not assume CORS can simply be broadened: choose a supported native origin/deployment design and explicitly review exact origin behavior, Supabase function CORS, R2 bucket CORS for presigned PUT, and Turnstile hostname verification. Current runtime environment values and R2 CORS config are unavailable. Join upload challenge validation requires Turnstile success/action and hostname matching the request origin (`index.ts:162–175,398`); public join photo intake may need a web-hosted step or a specifically designed native-compatible challenge while retaining server verification.

Private photo URLs are short-lived signed GET URLs (`index.ts:329–364`). `PrivatePhoto.tsx:45–56` opens a new window to load a signed link; native popup behavior can vary. `Residents.tsx:323–335` downloads via fetch → Blob → object URL → anchor; Settings CSV export similarly uses object URL (`Settings.tsx:216–223`). Validate preview, save/share and cleanup on Android/iOS. A native filesystem/share flow may be needed for downloads; it is not needed for ordinary image display.

## 6. Payment and External Link Audit

The app records payments and shows UPI payment details/UTR for manual reconciliation (Payments page); no UPI URI/intent or gateway callback was found. Thus no payment return URL is currently part of the traced flow, and payment status depends on the app's backend data rather than a browser payment session. WhatsApp reminders call `window.open(waUrl, '_blank')` (`src/pages/Payments.tsx:147–157`, `Residents.tsx:161`, `BuildingView.tsx:180`, `Dashboard.tsx:694`). Native needs an explicit external URL strategy: Capacitor Browser or App URL open/OS intent, with installed WhatsApp and browser fallback tested. For future UPI intents, add explicit scheme/return-link handling and validate app/no-app cases; that is not an existing flow. `PrivatePhoto` popup noted above also needs native-safe URL presentation.

## 7. Browser API Compatibility Matrix

| API / Feature | Current Usage | Capacitor Compatibility | Required Action | Priority |
|---|---|---|---|---|
| `window.location.hostname/origin/replace` | Host routing, reset redirect, QR URL (`AppRoutes.tsx`, `SignIn.tsx`, `QRCodeModal.tsx`) | Requires configuration and code changes; local native origin is not a production app host | Separate canonical public URL from runtime origin; native route and redirect handling; fix QR base URL | P1 |
| React Router / URL query/hash | `BrowserRouter`; paths; `?filter=reserved`; redirect preserves hash | Compatible with configuration | Add App URL listener/association and route URL mapping; verify refresh/back | P1 |
| localStorage | Supabase default storage and app preferences | Compatible; persistence expected but not device-verified; native/web origins are isolated | Test terminate/reopen, refresh and logout; document origin separation | P1 |
| sessionStorage | Join request idempotency (`supabaseAPI.ts:1058–1079`) | Compatible within WebView session; not durable across process exit | Verify retries/resubmission semantics after app restart | P2 |
| Supabase auth refresh | Default supabase-js client; `getSession` + auth-state listener | Compatible with persistent WebView storage, subject to resume/network verification | Test suspension/resume and expired access token on both OSes | P1 |
| `File`, `Blob`, `FormData`, `FileReader`, `fetch` | Photo upload, QR logo conversion | Generally compatible in WebViews | Adapt Camera file URI to Blob/File; preserve caps, MIME and secure helper | P1 |
| R2 presigned PUT / signed GET | Fetch to signed R2 URL and display photo | Compatible with exact CORS/origin/signature configuration | Verify R2 CORS and WebView origin; keep URLs short lived | P1 |
| `URL.createObjectURL` / revoke | Resident and CSV downloads | Compatible, but anchor download behavior varies | Native save/share path or device-verified download; audit immediate revoke timing | P2 |
| `window.open`, `_blank`, WhatsApp | Reminders and private photo open | Requires native external URL integration; popup can be blocked | Use tested Capacitor Browser/App URL handling with fallback | P1 |
| `navigator.clipboard` | Copy phone, email, join URL | Compatible only where secure-context/permission behavior allows | Add failure feedback/fallback; optional Capacitor Clipboard | P2 |
| WebSocket / Supabase Realtime | Activity subscription (`AppContext.tsx:405–414`) | Compatible; mobile suspension/network changes can drop connection | Test resume/reconnect and refresh fallback | P2 |
| focus / visibility / online events | Refresh on focus/visibility; offline UI | Compatible; event timing differs on app lifecycle | Bridge app resume if needed; test offline/resume | P2 |
| Cloudflare Turnstile script | Public join photo challenge (`JoinForm.tsx:16–29,58–79`) | Potentially constrained in WKWebView/WebView and by hostname verification | Verify actual widget on both OSes; retain server-side validation | P1 |
| `html-to-image`, canvas/SVG, anchor download | QR poster generation (`QRCodeModal.tsx:63–105`) | Likely compatible, device output/share uncertain | Validate fonts, remote image handling, memory and save/share | P2 |
| Notifications / Push / Service Worker / IndexedDB / geolocation / mediaDevices / Web Push | No use found in searched `src` | Not applicable to current source | No plugin required unless product scope adds feature | P3 |
| CSS `100dvh`, safe-area insets, internal scrolling | `index.css`, shell and page layouts | Supported by current WebViews with keyboard/orientation edge cases | Device test keyboard, notch, navigation bars and rotation | P2 |

## 8. Vite and Build Compatibility

Vite uses React and Tailwind plugins and an `@` source alias (`vite.config.ts:1–18`). `npm run build` runs `vite build`; standard output is `dist` (`package.json:6–12`). TypeScript targets ES2022 and includes DOM libraries (`tsconfig.json:1–25`). No `base` override or relative asset strategy is configured. Default root-relative Vite assets should be checked after a native `dist` copy, especially any public assets referenced by absolute `/...` paths; no build was run under this read-only audit. A Capacitor config would ordinarily point `webDir` to `dist`.

Environment values prefixed `VITE_` are compile-time client values; never put secrets there. The checked Supabase client uses public client credentials only. Existing Vercel deployment can remain unchanged; the mobile package can consume the same frontend build and backend, with environment/build pipeline decisions made separately. A separate mobile build target is not proven necessary, but environment-independent canonical URLs and platform-specific deep-link behavior are. No dynamic import blocker was identified in reviewed files.

## 9. Shared Backend Compatibility

- **Supabase:** Existing `supabase-js` client and JWT-authenticated calls are suitable for shared web/native access. Realtime uses WebSocket. Refresh/resume requires device testing.
- **RLS:** `supabase/migrations/004_rls.sql` contains tenant ownership policies and `auth.uid()`-based access for core hostel entities. This supports shared clients at the schema level; live deployed policies and all current migrations were not compared. Recheck live RLS before release; never ship privileged service keys.
- **Edge Functions:** Client invokes functions through Supabase. Admin functions validate bearer identity/role; broad CORS alone does not bypass these checks. Confirm function CORS and JWT verification against exact native origin before release.
- **R2:** Credentials remain server-side in `resident-photo`; frontend receives scoped, expiring signed URLs. Preserve this pattern. Bucket CORS is external configuration and must permit only intended methods/headers/origins needed for signed uploads.
- **Origin assumptions:** `resident-photo` is the clearest website-origin assumption. The native origin and Turnstile interaction must be resolved explicitly. Do not respond by permitting arbitrary origins or removing JWT, challenge or ownership checks.
- **External config unknowns:** Supabase redirect allowlist, deployed Edge Function versions/secrets, R2 CORS, Turnstile site configuration, and hosting DNS/domain links were not visible; therefore backend readiness is conditional, not verified.

## 10. Capacitor Integration Requirements

### Essential

- `@capacitor/core`, `@capacitor/cli`, platform packages `@capacitor/android` and `@capacitor/ios`; use a supported Capacitor version verified against the current Vite/Node toolchain.
- `@capacitor/app` for lifecycle, incoming app URLs, and Android back handling; configure Android App Links and iOS Universal Links plus association files when deep links are required.
- `@capacitor/browser` or `@capacitor/app` URL-open handling for WhatsApp and external HTTPS links. Choose based on desired external app/browser behavior and test fallback.
- `@capacitor/camera` only if native camera/gallery experience is required. Adapt returned URI to Blob/File; keep the current secure Edge Function + R2 flow.
- Native origin, reset redirect, QR public URL, Turnstile and exact CORS decisions before first production build.

### Optional

- `@capacitor/filesystem` and `@capacitor/share` for saving/sharing QR posters, CSVs and resident photos when browser downloads are insufficient.
- `@capacitor/clipboard` if web clipboard does not meet copy UX.
- `@capacitor/status-bar` and `@capacitor/keyboard` for polished edge-to-edge/keyboard behavior if device testing identifies gaps.
- Secure storage only after a threat-model decision; not required for initial compatibility proof.

### No plugin required by current source

React Router, ordinary forms, DOM storage, Supabase Auth/Postgres/Edge Functions, signed R2 upload, CSS safe areas, standard browser fetch/File APIs, Recharts and offline status checks do not inherently require plugins. No current push notification, native geolocation, browser database, or background task feature was found.

## 11. Prioritized Remediation Plan

| Priority | Issue and reason | Affected files | Proposed solution | Backend needed? | Web effect? |
|---|---|---|---|---|---|
| P0 | No P0 source-level blocker confirmed in audited flows. Security controls observed should be preserved. | — | Reassess if native origin work proposes relaxing auth, RLS, signed URL, or challenge checks. | No current change | None |
| P1 | Hostname-based routing/public URL and reset redirect assume web origins; native deep links/back are not wired. | `src/routes/AppRoutes.tsx`, `src/pages/SignIn.tsx`, `src/components/QRCodeModal.tsx`, app-link config absent | Define canonical public URL separately from runtime origin; implement native URL listener and path mapping; associate domains; handle Android back; test reset return and QR. | Supabase redirect allowlist/domain association may need config; no database change | Preserve existing web routes; likely shared code changes |
| P1 | Resident-photo origin guard rejects origins outside configured HTTP(S) allowlist; Turnstile checks hostname. Native uploads/join photos at risk. | `supabase/functions/resident-photo/index.ts`, `src/pages/JoinForm.tsx`, `src/lib/supabaseAPI.ts`; external R2/Turnstile config | Pick native origin strategy; prove exact allowed-origin/CORS behavior and R2 PUT headers. Design a verified Turnstile-compatible join flow; retain all validation and authorization. | Yes: exact allowlist/CORS/config; potentially challenge integration, no RLS weakening | Web allowlist must remain functional; safe config can be additive after review |
| P1 | Web popup/WhatsApp launch may not open intended native app; no fallback contract. | `src/pages/Payments.tsx`, `src/pages/Residents.tsx`, `src/pages/BuildingView.tsx`, `src/pages/Dashboard.tsx`, `src/components/PrivatePhoto.tsx` | Add native URL-opening integration and safe browser fallback; test installed/uninstalled WhatsApp and photo link. | No | Keep web `window.open` path for browser |
| P1 | Native camera originals may exceed caps; no compression, and no native camera adapter exists. | `src/pages/Residents.tsx`, `src/pages/JoinForm.tsx`, `src/lib/supabaseAPI.ts`, `supabase/functions/resident-photo/index.ts` | If camera capture is in scope, adapt Camera URI to File/Blob and compress to existing limits; preserve Edge Function validation and R2 signed upload. | No if current limits retained | Optional shared upload helper changes |
| P1 | Authentication and Turnstile have not been validated in WebViews; reset uses runtime origin. | `src/supabaseClient.ts`, `src/context/AppContext.tsx`, `src/pages/SignIn.tsx`, `src/pages/JoinForm.tsx` | Device matrix: login/logout, confirmation/reset, token refresh, terminate/reopen, offline resume, widget flow. Add only demonstrated redirect/lifecycle handling. | Redirect allowlist config may be needed | No intended web behavior change |
| P2 | Downloads and QR poster save depend on anchor downloads/object URLs and may not surface a native save/share destination. | `src/pages/Residents.tsx`, `src/pages/Settings.tsx`, `src/components/QRCodeModal.tsx` | Verify on Android/iOS; add Filesystem/Share path if needed; test URL cleanup after download. | No | Native-only branch possible |
| P2 | Realtime and DOM events under app suspension may leave stale activity/session data. | `src/context/AppContext.tsx`, `src/components/OfflineError.tsx` | Validate resume/reconnect; bridge Capacitor app-active event only if existing refresh fallback proves insufficient. | No | Shared lifecycle handling may also improve web |
| P2 | Modal keyboard, safe-area and viewport behavior not verified; fixed bed canvas and non-wrapping room headings are narrow-screen risks. | `src/layouts/AppLayout.tsx`, `src/pages/BuildingView.tsx`, `src/components/BedLayoutBuilder.tsx`, key modal components | Capture/test 360/375/390/430 px and tablet, portrait/landscape, keyboard open, large text and bottom nav; adjust only observed clipping/occlusion. | No | Responsive fixes improve web too |
| P3 | Admin tables remain 700 px wide and require horizontal pan; native admin scope unknown. | `src/pages/AdminConsole.tsx`, `src/layouts/AdminLayout.tsx` | Accept horizontal scroll for initial admin use or compact only if mobile admins are in scope. | No | Optional web polish |
| P3 | Secure native token storage could be evaluated, but the current SDK-managed storage is compatible in principle. | `src/supabaseClient.ts` | Threat-model and prototype secure storage only if policy requires; plan migration/refresh/biometric edge cases. | No backend change expected | Native-specific; keep web adapter |

## 12. Final Go/No-Go Assessment

1. **Is the current application ready for Capacitor integration?** **Not for a release.** It is ready for a contained integration proof-of-concept after defining native origin, routing and auth return behavior.
2. **Can Android and iOS share the existing React frontend?** **Yes.** No source evidence requires a separate frontend framework. Platform-specific link, camera and save/share bridges can stay narrow.
3. **Can the existing Supabase backend support both?** **Yes, conditionally.** The shared authenticated client and tenant RLS model are suitable; verify live policies, Auth redirects, function CORS and origin-sensitive function behavior. No broad CORS or auth weakening.
4. **Can the existing Cloudflare R2 photo architecture work in native apps?** **Yes for resident photos with adapter/configuration work; public join photo upload is higher risk** because allowlisted origin and Turnstile hostname checks are explicit. Keep server-generated signed URLs and byte validation.
5. **Can the existing Vercel web deployment remain unchanged?** **Likely yes.** The static SPA can continue on Vercel; production host routing and native association configuration still need verification. No Vercel setting was changed.
6. **Can Capgo OTA updates be introduced without rebuilding the application for every frontend change?** **Yes for compatible web bundle changes after Capgo updater is installed in a released native binary.** Native plugin additions, native project/config/permission changes, and incompatible runtime changes still require a new store build. See Capgo's [live update compatibility guidance](https://capgo.app/docs/live-updates/compatibility/). Capgo is not installed or configured in this repository.
7. **What must be fixed before Capacitor integration begins?** Decide canonical app/public origins and deep-link contract; prove exact resident-photo/R2/Turnstile compatibility; design password reset return; specify native external URL and file-save behavior. Then create the smallest Android proof-of-concept and verify auth, photo upload, join flow, back navigation and resume on devices before production work.

**Recommendation:** Safely proceed to Phase 2 as a focused Capacitor proof-of-concept only after the origin/deep-link and photo/Turnstile design decisions above. Do not treat this source audit as evidence of production-ready Android/iOS behavior.
