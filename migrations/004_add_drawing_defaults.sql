-- Add drawing_defaults column to user_settings for persisting per-tool default styles
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS drawing_defaults JSONB DEFAULT '{}'::jsonb;
