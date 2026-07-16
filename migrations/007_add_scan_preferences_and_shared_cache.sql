-- 007_add_scan_preferences_and_shared_cache.sql
-- Per-user AI trading-desk preferences + shared (cross-user) scan cache

-- 1. PER-USER scan preferences (all scoped to a single user via crypto_subscriptions.user_id)
ALTER TABLE crypto_subscriptions
  -- how many watchlist tickers this user may run through LIVE AI scanning (ticker-scaled tier)
  ADD COLUMN IF NOT EXISTS ticker_slots INTEGER NOT NULL DEFAULT 1,
  -- which strategy groups/modes this user wants to receive
  ADD COLUMN IF NOT EXISTS strategy_groups TEXT[] NOT NULL DEFAULT ARRAY['indicator','smc']::text[],
  -- the subset of the user's watchlist activated for live AI (linked from Indicators page)
  ADD COLUMN IF NOT EXISTS scan_tickers TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  -- user-tunable thresholds (defaults preserve current behaviour)
  ADD COLUMN IF NOT EXISTS min_risk_reward NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS min_confluence INTEGER NOT NULL DEFAULT 3,
  -- preferred narrator model: 'fast' (default, cheap) or 'deep' (grok-4.5, costs more credits)
  ADD COLUMN IF NOT EXISTS ai_model_pref VARCHAR NOT NULL DEFAULT 'fast',
  -- opt-in to Elliott mode in the scanner (metered via existing elliott_ai_credits)
  ADD COLUMN IF NOT EXISTS elliott_scan_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. SHARED, cross-user AI scan cache (NO user_id -> one Grok call serves every user on that ticker)
CREATE TABLE IF NOT EXISTS crypto_scan_cache (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       VARCHAR NOT NULL,                 -- e.g. 'XRPUSDT'
  interval     VARCHAR NOT NULL,                 -- e.g. '15m','1h','4h'
  mode         VARCHAR NOT NULL,                 -- 'indicator' | 'smc' | 'elliott' | ...
  scores       JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- deterministic 9-system output + reasoning[]
  ai_narration JSONB,                            -- Grok narration/ranking (nullable until narrated)
  tier_state   VARCHAR NOT NULL DEFAULT 'neutral', -- 'actionable' | 'watchlist' | 'neutral'
  model_used   VARCHAR,                          -- 'fast' | 'deep'
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT crypto_scan_cache_uniq UNIQUE (symbol, interval, mode)
);
CREATE INDEX IF NOT EXISTS idx_scan_cache_symbol_interval ON crypto_scan_cache (symbol, interval);
CREATE INDEX IF NOT EXISTS idx_scan_cache_updated_at ON crypto_scan_cache (updated_at);

-- 3. Backfill existing rows' ticker_slots from current tier (optional convenience)
UPDATE crypto_subscriptions SET ticker_slots =
  CASE tier
    WHEN 'elite'        THEN 5
    WHEN 'pro'          THEN 4
    WHEN 'intermediate' THEN 3
    ELSE 1
  END
WHERE ticker_slots = 1;
