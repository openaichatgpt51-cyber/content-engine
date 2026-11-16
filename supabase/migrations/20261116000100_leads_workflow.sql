-- Leads workflow for the admin panel. The leads table already exists: the n8n
-- workflow "ContentEngine demo requests" inserts website demo requests into it
-- with name, email, company, brands, message, source, page.
--
-- CHECK BEFORE LAUNCH: leads must have RLS on and NO policy that lets anon or
-- authenticated users read it. The statements below make sure of that.

alter table public.leads enable row level security;
revoke select, update, delete on public.leads from anon, authenticated;

alter table public.leads
  add column if not exists status              text not null default 'new',
  add column if not exists assigned_to         uuid references auth.users(id),
  add column if not exists next_step           text,
  add column if not exists next_step_at        timestamptz,
  add column if not exists lost_reason         text,
  add column if not exists first_contacted_at  timestamptz,
  add column if not exists converted_client_id uuid references auth.users(id),
  add column if not exists updated_at          timestamptz not null default now();
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','contacted','demo','won','lost'));

-- Lead history. lead_id is text so it works whether leads.id is uuid or bigint;
-- confirm the type in the baseline and tighten to a foreign key if you like.
create table if not exists public.lead_events (
  id         bigint generated always as identity primary key,
  lead_id    text not null,
  admin_id   uuid references auth.users(id),
  kind       text not null check (kind in ('status_change','note','assigned','converted','created')),
  body       text,
  at         timestamptz not null default now()
);
create index if not exists lead_events_lead on public.lead_events (lead_id, at desc);
alter table public.lead_events enable row level security;
