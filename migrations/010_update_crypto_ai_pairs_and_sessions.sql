-- 010_update_crypto_ai_pairs_and_sessions.sql
-- Lock /cryptoai to the launch timeframe pairs, enforce new slot caps, and extend the shared cache for session snapshots.

ALTER TABLE crypto_subscriptions
  ALTER COLUMN ticker_slots SET DEFAULT 0;

UPDATE crypto_subscriptions
SET ticker_slots = CASE tier
  WHEN 'elite' THEN 5
  WHEN 'pro' THEN 3
  WHEN 'intermediate' THEN 1
  ELSE 0
END;

UPDATE crypto_subscriptions
SET ai_higher_timeframe = '1d'
WHERE ai_higher_timeframe NOT IN ('1w', '1d');

UPDATE crypto_subscriptions
SET ai_lower_timeframe = '15m'
WHERE ai_lower_timeframe NOT IN ('1h', '15m');

UPDATE crypto_subscriptions
SET
  ai_higher_timeframe = '1d',
  ai_lower_timeframe = '15m'
WHERE NOT (
  (ai_higher_timeframe = '1w' AND ai_lower_timeframe IN ('1h', '15m'))
  OR
  (ai_higher_timeframe = '1d' AND ai_lower_timeframe IN ('1h', '15m'))
);

ALTER TABLE crypto_scan_cache
  ADD COLUMN IF NOT EXISTS higher_timeframe VARCHAR,
  ADD COLUMN IF NOT EXISTS lower_timeframe VARCHAR,
  ADD COLUMN IF NOT EXISTS snapshots JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE crypto_scan_cache
SET
  higher_timeframe = split_part(interval, '_', 1),
  lower_timeframe = split_part(interval, '_', 2)
WHERE
  interval LIKE '%\_%'
  AND (higher_timeframe IS NULL OR lower_timeframe IS NULL);

CREATE INDEX IF NOT EXISTS idx_scan_cache_symbol_pair_mode
  ON crypto_scan_cache (symbol, higher_timeframe, lower_timeframe, mode);
