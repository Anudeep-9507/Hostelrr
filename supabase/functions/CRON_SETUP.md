# Hostelrr scheduled billing jobs

Billing schedules run inside PostgreSQL through `pg_cron`; they do not call the public Edge Function URLs.

| Job | Database function | IST schedule | pg_cron schedule (UTC) |
|---|---|---:|---:|
| Generate cycles | `public.generate_all_payment_cycles()` | Daily 00:00 | `30 18 * * *` |
| Tag late cycles | `public.tag_late_cycles()` | Daily 00:02 | `32 18 * * *` |

The migration `048_ist_billing_and_cron_hardening.sql` updates the existing jobs. It uses PostgreSQL date calculations in `Asia/Kolkata` regardless of the database session timezone. The UTC cron entries are the equivalent of the listed IST times.

The Edge Functions remain available for restricted manual operations. They require a valid platform JWT and then check that the bearer value exactly matches `SUPABASE_SERVICE_ROLE_KEY`. Never call these functions from browser code or place the service-role key in cron SQL. Deploy with JWT verification enabled:

```bash
npx supabase functions deploy generate-payment-cycles --project-ref <PROJECT_REF>
npx supabase functions deploy tag-late-cycles --project-ref <PROJECT_REF>
```

Scheduled runs are verified from PostgreSQL cron execution history and function return values. `cron.job_run_details` only reports that a cron command ran; inspect its results or the database state to confirm cycles/statuses changed.
