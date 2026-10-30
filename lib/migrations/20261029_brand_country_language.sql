-- Run once in the Supabase SQL editor BEFORE deploying the dashboard update.
-- Adds the brand's country (ISO code, e.g. 'NG') and language (e.g. 'en').
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS country  text,
  ADD COLUMN IF NOT EXISTS language text;
