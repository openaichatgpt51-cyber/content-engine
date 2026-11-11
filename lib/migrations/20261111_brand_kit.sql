-- brand kit
alter table public.brand_profiles add column if not exists brand_kit jsonb not null default '{}'::jsonb;
