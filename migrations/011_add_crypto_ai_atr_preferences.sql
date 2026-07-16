-- 011_add_crypto_ai_atr_preferences.sql
-- Add tighter ATR/FVG tuning preferences for /cryptoai deep-dive filtering.

ALTER TABLE crypto_subscriptions
  ADD COLUMN IF NOT EXISTS atr_stop_buffer NUMERIC(4,2) NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS fvg_atr_factor NUMERIC(4,2) NOT NULL DEFAULT 0.50;
