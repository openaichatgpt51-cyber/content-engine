-- Links each post to the campaign topic it came from, so the app can show what
-- has gone out and what is left. Run this BEFORE deploying the app change and
-- before the n8n workflow starts sending campaign_item_id.

alter table posts
  add column if not exists campaign_item_id uuid references campaign_job_items(id) on delete set null;

create index if not exists posts_campaign_item_idx on posts (campaign_item_id)
  where campaign_item_id is not null;
