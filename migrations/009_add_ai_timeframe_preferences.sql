-- 009_add_ai_timeframe_preferences.sql
-- Per-user preferred higher/lower timeframes for the /cryptoai card layout.

ALTER TABLE crypto_subscriptions
  ADD COLUMN IF NOT EXISTS ai_higher_timeframe VARCHAR NOT NULL DEFAULT '1d',
  ADD COLUMN IF NOT EXISTS ai_lower_timeframe VARCHAR NOT NULL DEFAULT '15m';
