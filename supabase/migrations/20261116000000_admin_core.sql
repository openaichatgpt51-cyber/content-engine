-- Admin panel P0: admin identities, audit log, client lifecycle, manual
-- contracts and invoices, post status history, and the client summary view.
--
-- Apply AFTER the baseline (00000000000000_baseline.sql exported from the live
-- project), and on a staging project first. Every admin table has RLS on with
-- no client policies, so only the server's service role can use them; the one
-- exception is admin_users, where a user may read their OWN row (middleware
-- runs with the user's session and must know whether they are an admin).

-- ── Admin identities and roles ──────────────────────────────────────────────
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','support')),
  full_name   text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table public.admin_users enable row level security;
drop policy if exists "admins read own row" on public.admin_users;
create policy "admins read own row" on public.admin_users
  for select using (auth.uid() = user_id);

-- Carry today's admins over as Owners. clients.is_admin is dropped by a later
-- migration once nothing reads it.
insert into public.admin_users (user_id, role)
select id, 'owner' from public.clients where is_admin = true
on conflict (user_id) do nothing;

-- Never leave the panel without an Owner.
create or replace function public.keep_one_owner() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.admin_users where role = 'owner') = 0 then
    raise exception 'At least one Owner must remain';
  end if;
  return null;
end $$;
drop trigger if exists admin_users_keep_owner on public.admin_users;
create constraint trigger admin_users_keep_owner
  after update or delete on public.admin_users
  deferrable initially deferred
  for each row execute function public.keep_one_owner();

-- ── Append-only audit log ───────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  -- No foreign keys: the log must outlive deleted users, and it can't be
  -- updated (ON DELETE SET NULL would trip the append-only trigger).
  admin_id    uuid not null,
  client_id   uuid,
  brand_id    uuid,
  post_id     uuid,
  lead_id     text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          text,
  user_agent  text
);
create index if not exists admin_audit_client_at on public.admin_audit_log (client_id, at desc);
create index if not exists admin_audit_admin_at  on public.admin_audit_log (admin_id, at desc);
create index if not exists admin_audit_at        on public.admin_audit_log (at desc);
alter table public.admin_audit_log enable row level security;

create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_audit_log is append-only';
end $$;
drop trigger if exists audit_log_no_update on public.admin_audit_log;
create trigger audit_log_no_update before update or delete on public.admin_audit_log
  for each row execute function public.audit_log_immutable();

-- ── Client identity and lifecycle ───────────────────────────────────────────
alter table public.clients
  add column if not exists company_name   text,
  add column if not exists contact_name   text,
  add column if not exists lifecycle      text not null default 'active',
  add column if not exists provisioned_by uuid references auth.users(id),
  add column if not exists provisioned_at timestamptz;
alter table public.clients drop constraint if exists clients_lifecycle_check;
alter table public.clients add constraint clients_lifecycle_check
  check (lifecycle in ('active','suspended','offboarded'));

-- ── Manual naira contracts and invoices (no Stripe) ─────────────────────────
create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references auth.users(id) on delete cascade,
  plan_name     text not null,
  amount_ngn    bigint not null check (amount_ngn >= 0),
  cycle         text not null check (cycle in ('monthly','annual')),
  start_date    date not null,
  renewal_date  date,
  status        text not null default 'active' check (status in ('active','ended')),
  notes         text,
  created_at    timestamptz not null default now()
);
create unique index if not exists one_active_contract on public.contracts (client_id) where status = 'active';
alter table public.contracts enable row level security;

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references auth.users(id) on delete cascade,
  contract_id   uuid references public.contracts(id),
  number        text not null unique,
  period_start  date not null,
  period_end    date not null,
  amount_ngn    bigint not null check (amount_ngn >= 0),
  due_date      date not null,
  status        text not null default 'draft'
    check (status in ('draft','sent','paid','overdue','void')),
  sent_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists invoices_status_due on public.invoices (status, due_date);
create index if not exists invoices_client on public.invoices (client_id, due_date desc);
alter table public.invoices enable row level security;

-- ── Post status history (stuck detection, post drawer, analytics) ───────────
create table if not exists public.post_status_events (
  id          bigint generated always as identity primary key,
  post_id     uuid not null,
  from_status text,
  to_status   text not null,
  at          timestamptz not null default now()
);
create index if not exists post_status_events_post on public.post_status_events (post_id, at desc);
create index if not exists post_status_events_at   on public.post_status_events (at desc);
alter table public.post_status_events enable row level security;

create or replace function public.log_post_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.post_status_events (post_id, from_status, to_status)
    values (new.id, null, new.posting_status);
  elsif new.posting_status is distinct from old.posting_status then
    insert into public.post_status_events (post_id, from_status, to_status)
    values (new.id, old.posting_status, new.posting_status);
  end if;
  return new;
end $$;
drop trigger if exists posts_status_history on public.posts;
create trigger posts_status_history
  after insert or update of posting_status on public.posts
  for each row execute function public.log_post_status();

-- ── One row per client for the Clients list ─────────────────────────────────
-- Replaces loading every post for every client. Admins are excluded.
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
  coalesce(s.posting_paused, false) as posting_paused
from public.clients c
left join public.account_settings s on s.client_id = c.id
where not exists (select 1 from public.admin_users a where a.user_id = c.id);

-- The view is for the service role only.
revoke all on public.admin_client_summary from anon, authenticated;
