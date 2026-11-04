-- Admin analytics: billing, subscription snapshot and auth event tables.
-- Additive only: new tables and indexes, nothing existing is altered or dropped.

CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR,
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  stripe_event_id VARCHAR NOT NULL UNIQUE,
  type VARCHAR NOT NULL,
  status VARCHAR,
  tier VARCHAR,
  amount_pence INTEGER,
  currency VARCHAR(8),
  mrr_pence INTEGER,
  mrr_delta_pence INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_events_sub_time_idx
  ON billing_events (stripe_subscription_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS billing_events_type_time_idx
  ON billing_events (type, occurred_at);
CREATE INDEX IF NOT EXISTS billing_events_user_idx
  ON billing_events (user_id);

CREATE TABLE IF NOT EXISTS subscription_snapshots_daily (
  date DATE NOT NULL,
  tier VARCHAR NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  trialing_count INTEGER NOT NULL DEFAULT 0,
  mrr_pence INTEGER NOT NULL DEFAULT 0,
  churned_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, tier)
);

CREATE TABLE IF NOT EXISTS auth_events (
  svix_id VARCHAR PRIMARY KEY,
  type VARCHAR NOT NULL,
  user_id VARCHAR,
  session_id VARCHAR,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_events_type_time_idx
  ON auth_events (type, occurred_at);

-- Speeds up active-user windows on the existing events table.
CREATE INDEX IF NOT EXISTS analytics_events_created_user_idx
  ON analytics_events (created_at, user_id);
CREATE INDEX IF NOT EXISTS api_usage_log_created_user_idx
  ON api_usage_log (created_at, user_id);
