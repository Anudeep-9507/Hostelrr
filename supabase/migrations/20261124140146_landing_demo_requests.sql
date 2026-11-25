create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  beds integer not null check (beds between 1 and 10000),
  pincode text,
  source text not null default 'popup' check (source in ('popup', 'hero')),
  created_at timestamptz not null default now(),
  constraint demo_requests_phone_india check (phone ~ '^[+]91[6-9][0-9]{9}$'),
  constraint demo_requests_name_length check (name is null or char_length(name) <= 100),
  constraint demo_requests_pincode_length check (pincode is null or char_length(pincode) <= 10)
);

alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;
grant insert on public.demo_requests to anon, authenticated;
grant select on public.demo_requests to service_role;

create policy "Public can submit demo requests"
  on public.demo_requests for insert to anon, authenticated
  with check (
    phone ~ '^[+]91[6-9][0-9]{9}$'
    and beds between 1 and 10000
    and source in ('popup', 'hero')
    and (name is null or char_length(name) <= 100)
    and (pincode is null or char_length(pincode) <= 10)
  );

create index demo_requests_created_at_idx on public.demo_requests (created_at desc);
