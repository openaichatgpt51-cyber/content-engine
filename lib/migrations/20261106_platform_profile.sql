-- Real account identity for the Review Queue preview (name, handle, avatar).
-- Safe to re-run. These are display-only, non-secret columns; the existing
-- row-level security on platform_accounts already covers them.
alter table platform_accounts
  add column if not exists display_name       text,
  add column if not exists handle             text,
  add column if not exists avatar_url         text,
  add column if not exists profile_synced_at  timestamptz;

notify pgrst, 'reload schema';
