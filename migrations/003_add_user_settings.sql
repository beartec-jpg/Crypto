-- Create user_settings table for general application preferences per user
CREATE TABLE IF NOT EXISTS user_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE UNIQUE,
  default_timeframe VARCHAR NOT NULL DEFAULT '1h',
  chart_type VARCHAR NOT NULL DEFAULT 'candlestick',
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  theme VARCHAR NOT NULL DEFAULT 'dark',
  last_symbol VARCHAR NOT NULL DEFAULT 'BTCUSDT',
  last_timeframe VARCHAR NOT NULL DEFAULT '1h',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create user_indicator_settings table for SMC indicator configurations per user
CREATE TABLE IF NOT EXISTS user_indicator_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE UNIQUE,
  fvg_settings JSONB,
  order_block_settings JSONB,
  liquidity_settings JSONB,
  pd_zone_settings JSONB,
  bos_settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_indicator_settings_user_id ON user_indicator_settings(user_id);

-- Create user_positions table for tracked positions and portfolio data per user
CREATE TABLE IF NOT EXISTS user_positions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE UNIQUE,
  positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_positions_user_id ON user_positions(user_id);
