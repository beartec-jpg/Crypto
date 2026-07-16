-- 008_add_ai_trader_mode.sql
-- Per-user selected AI trader mode for the /cryptoai analysis page.
-- This is an AI-only "trader mode" (indicator | smc | ...), independent of the
-- manual chart 9-system engine. Defaults to 'smc' to preserve current behaviour.

ALTER TABLE crypto_subscriptions
  ADD COLUMN IF NOT EXISTS ai_trader_mode VARCHAR NOT NULL DEFAULT 'smc';
