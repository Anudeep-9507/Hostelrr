# Hostelrr Cron Jobs — Setup Guide

Two Edge Functions are created under `supabase/functions/`. They call existing DB RPCs.

## Functions

| Function | RPC Called | Schedule |
|---|---|---|
| `tag-late-cycles` | `public.tag_late_cycles()` | Daily at 00:00 UTC |
| `generate-payment-cycles` | `public.generate_payment_cycles(p_hostel_id)` | 1st of each month at 00:05 UTC |

---

## Step 1 — Deploy Functions

```bash
# From project root (requires Supabase CLI)
npx supabase functions deploy tag-late-cycles --project-ref <YOUR_PROJECT_REF>
npx supabase functions deploy generate-payment-cycles --project-ref <YOUR_PROJECT_REF>
```

Get `YOUR_PROJECT_REF` from: Supabase Dashboard → Project Settings → General → Reference ID

---

## Step 2 — Set Env Vars in Supabase Dashboard

Dashboard → Project → Edge Functions → Manage Secrets:

| Key | Value |
|---|---|
| `SUPABASE_URL` | Your project URL (auto-injected, no action needed) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key (auto-injected, no action needed) |
| `CRON_SECRET` | A random secret string you choose (e.g. `openssl rand -hex 32`) |

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-available inside Edge Functions — no need to set them.

---

## Step 3 — Schedule via Supabase Dashboard

Dashboard → Project → Edge Functions → [function name] → Schedules → Add Schedule:

**tag-late-cycles:**
- Cron: `0 0 * * *` (midnight UTC daily)
- HTTP Method: POST
- Authorization: `Bearer <YOUR_CRON_SECRET>`

**generate-payment-cycles:**
- Cron: `5 0 1 * *` (1st of each month, 00:05 UTC)
- HTTP Method: POST
- Authorization: `Bearer <YOUR_CRON_SECRET>`

---

## Manual Test (curl)

```bash
curl -X POST \
  https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/tag-late-cycles \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"

curl -X POST \
  https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/generate-payment-cycles \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
```

---

## Notes

- Both functions are **idempotent** — safe to run multiple times (DB RPCs use `ON CONFLICT DO NOTHING`).
- `generate-payment-cycles` iterates over all hostels — scales automatically as you add new customers.
- If `CRON_SECRET` env var is not set, the functions are open (fine for dev, not for prod).
