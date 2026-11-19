-- Per-client usage metering + a generation log the admin panel can count in
-- real time.
--
-- 1. clients.usage_metering / monthly_post_limit
--    The global USAGE_LIMITS_ENABLED flag stays off. An Owner can switch the
--    monthly cap on for individual clients from the admin panel. Usage is
--    counted from generation_events (below), per calendar month in
--    Africa/Lagos, so it does not depend on n8n's "Record Usage" node.
--
-- 2. generation_events
--    One row per post the app asks n8n to generate (one per platform group),
--    written by /api/generate and /api/generate-campaign the moment the
--    request is made. status: accepted (n8n took it), failed (n8n refused or
--    errored), blocked (over the client's monthly cap). Posts appear in
--    `posts` 2 to 3 minutes later, when n8n finishes; the gap between the two
--    counts is generations that failed inside n8n.

alter table public.clients
  add column if not exists usage_metering     boolean not null default false,
  add column if not exists monthly_post_limit integer;

alter table public.clients drop constraint if exists clients_monthly_post_limit_check;
alter table public.clients add constraint clients_monthly_post_limit_check
  check (monthly_post_limit is null or monthly_post_limit between 1 and 100000);

create table if not exists public.generation_events (
  id          bigint generated always as identity primary key,
  client_id   uuid not null,
  brand_id    uuid,
  source      text not null default 'generate' check (source in ('generate','campaign')),
  platforms   text,
  status      text not null check (status in ('accepted','failed','blocked')),
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists generation_events_client_created on public.generation_events (client_id, created_at desc);
create index if not exists generation_events_created on public.generation_events (created_at desc);

alter table public.generation_events enable row level security;
revoke all on public.generation_events from anon, authenticated;

-- Start of the current calendar month in Lagos, as a timestamptz.
create or replace function public.lagos_month_start(ts timestamptz default now())
returns timestamptz language sql stable as $$
  select date_trunc('month', ts at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'
$$;

create or replace function public.lagos_day_start(ts timestamptz default now())
returns timestamptz language sql stable as $$
  select date_trunc('day', ts at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'
$$;

-- Extend the admin summary. New columns go at the end so `create or replace`
-- keeps working.
create or replace view public.admin_client_summary as
select
  c.id as client_id,
  c.email,
  c.company_name,
  c.contact_name,
  c.lifecycle,
  coalesce(c.max_brands, 1) as max_brands,
  c.created_at,
  (select count(*) from public.brands b where b.client_id = c.id)::int as brands,
  (select max(p.created_at) from public.posts p where p.client_id = c.id) as last_post_at,
  (select count(*) from public.posts p
     where p.client_id = c.id and p.created_at > now() - interval '30 days')::int as posts_30d,
  (select count(*) from public.posts p
     where p.client_id = c.id and p.posting_status = 'AWAITING_APPROVAL'
       and p.created_at < now() - interval '48 hours')::int as stale_approvals,
  (select count(*) from public.posts p
     where p.client_id = c.id and p.posting_status in ('PENDING','HALTED')
       and least(
         coalesce(p.linkedin_scheduled_time, 'infinity'),
         coalesce(p.instagram_scheduled_time, 'infinity'),
         coalesce(p.twitter_scheduled_time, 'infinity')
       ) between now() and now() + interval '7 days')::int as scheduled_7d,
  coalesce(s.posting_paused, false) as posting_paused,
  -- added 2026-11-19
  (select count(*) from public.posts p
     where p.client_id = c.id and p.created_at >= public.lagos_day_start())::int as posts_today,
  (select count(*) from public.posts p
     where p.client_id = c.id and p.created_at >= public.lagos_month_start())::int as posts_month,
  (select count(*) from public.posts p where p.client_id = c.id)::int as posts_total,
  (select count(*) from public.generation_events g
     where g.client_id = c.id and g.status = 'accepted' and g.created_at >= public.lagos_day_start())::int as generations_today,
  (select count(*) from public.generation_events g
     where g.client_id = c.id and g.status = 'accepted' and g.created_at >= public.lagos_month_start())::int as generations_month,
  c.usage_metering,
  c.monthly_post_limit
from public.clients c
left join public.account_settings s on s.client_id = c.id
where not exists (select 1 from public.admin_users a where a.user_id = c.id);

revoke all on public.admin_client_summary from anon, authenticated;
