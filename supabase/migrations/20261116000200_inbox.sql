-- Admin inbox: emails sent to hello@contentengine.social.
-- Forward Email (or any forwarder) posts each message to the n8n workflow
-- "ContentEngine demo requests" (inbound-email webhook), which inserts a row
-- here with the service-role Supabase credential. Admins read and work these
-- rows from /admin/inbox. RLS on with no policies: service role only.

create table if not exists public.inbox_messages (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  from_email  text not null,
  from_name   text,
  to_email    text,
  subject     text,
  text_body   text,
  message_id  text not null unique,           -- dedupes forwarder retries
  status      text not null default 'new'
              check (status in ('new','handled','spam','lead')),
  lead_id     text,                           -- set when turned into a lead
  handled_by  uuid references auth.users(id),
  handled_at  timestamptz,
  note        text,
  raw         jsonb,                          -- slim copy, no attachment contents
  created_at  timestamptz not null default now()
);

create index if not exists inbox_messages_status_received on public.inbox_messages (status, received_at desc);
create index if not exists inbox_messages_from on public.inbox_messages (lower(from_email));

alter table public.inbox_messages enable row level security;
revoke all on public.inbox_messages from anon, authenticated;

-- Let lead history record that a lead came from an email.
alter table public.lead_events drop constraint if exists lead_events_kind_check;
alter table public.lead_events add constraint lead_events_kind_check
  check (kind in ('status_change','note','assigned','converted','created','email'));
