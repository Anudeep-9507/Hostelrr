-- Atomically claim verified Turnstile tokens before applying the IP quota.
-- Hashes expire well after Turnstile's five-minute token lifetime.
CREATE TABLE public.join_photo_turnstile_claims (
  token_hash TEXT PRIMARY KEY,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.join_photo_turnstile_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.join_photo_turnstile_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.join_photo_turnstile_claims TO service_role;
