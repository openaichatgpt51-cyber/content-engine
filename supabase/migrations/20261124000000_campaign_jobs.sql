-- Campaign generation runs in the background: one job per campaign, one item
-- per post. The app (service role) writes; clients may only read their own.

create table if not exists campaign_jobs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null,
  brand_id     uuid,
  client_email text,
  status       text not null default 'running' check (status in ('running','done')),
  total        int  not null default 0,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table if not exists campaign_job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references campaign_jobs(id) on delete cascade,
  position    int  not null,
  topic       text not null,
  platforms   text[] not null,
  tone        text,
  is_carousel boolean not null default false,
  slide_count int,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  error       text,
  attempts    int  not null default 0,
  started_at  timestamptz,
  finished_at timestamptz
);

create index if not exists campaign_jobs_client_idx on campaign_jobs (client_id, created_at desc);
create index if not exists campaign_job_items_job_idx on campaign_job_items (job_id, position);

alter table campaign_jobs enable row level security;
alter table campaign_job_items enable row level security;

drop policy if exists "own campaign jobs" on campaign_jobs;
create policy "own campaign jobs" on campaign_jobs for select using (client_id = auth.uid());

drop policy if exists "own campaign job items" on campaign_job_items;
create policy "own campaign job items" on campaign_job_items for select
  using (exists (select 1 from campaign_jobs j where j.id = job_id and j.client_id = auth.uid()));

-- Hands out the next queued item for a job, one at a time (posts must be
-- scheduled in order so slots don't collide). Items stuck "running" past the
-- stale window are failed first so the queue never blocks forever.
create or replace function claim_campaign_item(p_job uuid, p_stale interval default interval '6 minutes')
returns setof campaign_job_items
language plpgsql security definer set search_path = public as $$
declare v campaign_job_items;
begin
  perform 1 from campaign_jobs where id = p_job for update;

  update campaign_job_items
     set status = 'failed',
         error = 'Timed out waiting for the generator. The post may still appear in your Review Queue, so check before retrying.',
         finished_at = now()
   where job_id = p_job and status = 'running' and started_at < now() - p_stale;

  if exists (select 1 from campaign_job_items where job_id = p_job and status = 'running') then
    return;
  end if;

  select * into v from campaign_job_items
   where job_id = p_job and status = 'queued' order by position limit 1;
  if not found then return; end if;

  update campaign_job_items
     set status = 'running', started_at = now(), attempts = attempts + 1
   where id = v.id returning * into v;
  return next v;
end $$;

revoke execute on function claim_campaign_item(uuid, interval) from public, anon, authenticated;
grant execute on function claim_campaign_item(uuid, interval) to service_role;
