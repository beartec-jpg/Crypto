-- Remove ATR-based preference columns that are no longer used.
-- This is idempotent: safe to run in environments that never added these columns
-- (added in the prior migration 011_add_crypto_ai_atr_preferences.sql) as well as
-- environments that did run that migration.
ALTER TABLE crypto_subscriptions
  DROP COLUMN IF EXISTS atr_stop_buffer,
  DROP COLUMN IF EXISTS fvg_atr_factor;
