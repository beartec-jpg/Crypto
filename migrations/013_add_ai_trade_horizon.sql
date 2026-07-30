-- 013_add_ai_trade_horizon.sql
-- Per-user trade horizon (hold-duration style) for /cryptoai deep-dive structure sizing.

ALTER TABLE crypto_subscriptions
  ADD COLUMN IF NOT EXISTS ai_trade_horizon VARCHAR NOT NULL DEFAULT 'intraday';
