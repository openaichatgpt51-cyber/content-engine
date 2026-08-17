-- Run this in Supabase SQL Editor

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES auth.users(id) UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT DEFAULT 'starter',
  status TEXT DEFAULT 'trialing', -- trialing | active | past_due | canceled
  posts_used INTEGER DEFAULT 0,
  posts_limit INTEGER DEFAULT 30,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
ON subscriptions FOR SELECT
USING (auth.uid() = client_id);

-- Onboarding state table
CREATE TABLE IF NOT EXISTS onboarding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES auth.users(id) UNIQUE,
  completed BOOLEAN DEFAULT false,
  step INTEGER DEFAULT 1,
  company_name TEXT,
  industry TEXT,
  website TEXT,
  linkedin_connected BOOLEAN DEFAULT false,
  instagram_connected BOOLEAN DEFAULT false,
  twitter_connected BOOLEAN DEFAULT false,
  posting_days TEXT[] DEFAULT ARRAY['Monday','Wednesday','Friday'],
  posting_time TEXT DEFAULT '09:00',
  timezone TEXT DEFAULT 'Africa/Lagos',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own onboarding"
ON onboarding FOR ALL
USING (auth.uid() = client_id);

-- Function to increment post count safely
CREATE OR REPLACE FUNCTION increment_post_count(p_client_id UUID)
RETURNS void AS $$
  UPDATE subscriptions
  SET posts_used = posts_used + 1,
      updated_at = NOW()
  WHERE client_id = p_client_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to reset post count (called on subscription renewal)
CREATE OR REPLACE FUNCTION reset_post_count(p_client_id UUID)
RETURNS void AS $$
  UPDATE subscriptions
  SET posts_used = 0,
      updated_at = NOW()
  WHERE client_id = p_client_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Token validation tracking for platform_accounts
-- (set by app/api/auth/[platform]/callback/route.js after each OAuth reconnect)
--
-- IMPORTANT: defaults to NULL, not false. Existing connected accounts have
-- never been through the new validation check, so they should read as
-- "unknown" (still shown as Connected) rather than "confirmed invalid"
-- (which would wrongly flag every pre-existing connection as broken and
-- force everyone to reconnect immediately after this migration runs).
-- Only a row that has actually failed a live validation call gets `false`.
ALTER TABLE platform_accounts
ADD COLUMN IF NOT EXISTS token_valid BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Kill switch: per-client posting pause state.
-- When posting_paused = true:
--   - all of that client's queued-but-not-yet-processing posts are moved
--     from PENDING to HALTED (pulled back out of the queue n8n polls)
--   - newly approved posts go straight to HALTED instead of PENDING
--   - posts already at IN_PROGRESS are NOT touched — they're already being
--     published by n8n and cannot be recalled (see components/KillSwitch.jsx)
CREATE TABLE IF NOT EXISTS account_settings (
  client_id      UUID REFERENCES auth.users(id) PRIMARY KEY,
  posting_paused BOOLEAN DEFAULT false,
  paused_at      TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE account_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own account settings"
ON account_settings FOR ALL
USING (auth.uid() = client_id);

-- IMPORTANT — check this before using the kill switch or drag-and-drop
-- rescheduling: if your `posts.posting_status` column has a CHECK
-- constraint or is a Postgres ENUM restricting allowed values (it predates
-- this migration, so its exact definition isn't visible here), you must
-- add 'HALTED' as an allowed value or every pause/resume write will fail.
-- Example if it's a CHECK constraint (adjust the constraint name to match
-- yours — find it with: SELECT conname FROM pg_constraint WHERE conrelid
-- = 'posts'::regclass):
--
--   ALTER TABLE posts DROP CONSTRAINT posts_posting_status_check;
--   ALTER TABLE posts ADD CONSTRAINT posts_posting_status_check
--     CHECK (posting_status IN
--       ('AWAITING_APPROVAL','PENDING','HALTED','IN_PROGRESS','DONE','PARTIAL','FAILED'));
--
-- If it's a plain TEXT column with no constraint, nothing to do here.
