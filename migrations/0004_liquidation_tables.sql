-- Migration: 0004_liquidation_tables
-- Adds tables for the liquidation heatmap data collection pipeline

-- Which symbols the cron should collect data for
CREATE TABLE IF NOT EXISTS liq_tracked_symbols (
  symbol        TEXT PRIMARY KEY,
  enabled       BOOLEAN DEFAULT TRUE,
  priority      INTEGER DEFAULT 0,
  added_at      TIMESTAMP DEFAULT NOW()
);

-- Periodic market-state snapshots (1 row per symbol per minute)
CREATE TABLE IF NOT EXISTS liq_market_snapshots (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL,
  snapshot_time   TIMESTAMP NOT NULL,
  price           DOUBLE PRECISION,
  open_interest_usd DOUBLE PRECISION,
  funding_rate    DOUBLE PRECISION,
  long_short_ratio DOUBLE PRECISION,
  depth_bids      JSONB,
  depth_asks      JSONB,
  source          TEXT DEFAULT 'bybit',
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (symbol, snapshot_time)
);

-- Individual liquidation events
CREATE TABLE IF NOT EXISTS liq_force_orders (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL,
  side        TEXT NOT NULL,
  price       DOUBLE PRECISION NOT NULL,
  quantity    DOUBLE PRECISION NOT NULL,
  exchange    TEXT NOT NULL,
  event_time  TIMESTAMP NOT NULL,
  value_usd   DOUBLE PRECISION,
  captured_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (symbol, exchange, price, quantity, event_time)
);

-- Pre-computed heatmap profiles (1 row per symbol/range/interval combo)
CREATE TABLE IF NOT EXISTS liq_computed_profiles (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL,
  range           TEXT NOT NULL,
  chart_interval  TEXT NOT NULL,
  levels_json     JSONB,
  meta_json       JSONB,
  computed_at     TIMESTAMP DEFAULT NOW(),
  expires_at      TIMESTAMP,
  UNIQUE (symbol, range, chart_interval)
);

-- Seed initial tracked symbol
INSERT INTO liq_tracked_symbols (symbol, enabled, priority)
VALUES ('XRPUSDT', TRUE, 10)
ON CONFLICT (symbol) DO NOTHING;
