-- Create user_watchlists table
CREATE TABLE IF NOT EXISTS user_watchlists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE,
  tickers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id ON user_watchlists(user_id);

-- Migrate existing data from crypto_subscriptions.selected_tickers to user_watchlists
INSERT INTO user_watchlists (user_id, tickers, created_at, updated_at)
SELECT 
  user_id, 
  COALESCE(selected_tickers, '[]'::jsonb),
  created_at,
  updated_at
FROM crypto_subscriptions
WHERE selected_tickers IS NOT NULL AND selected_tickers != '[]'::jsonb
ON CONFLICT DO NOTHING;
