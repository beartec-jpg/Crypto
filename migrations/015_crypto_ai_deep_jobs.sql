-- 015_crypto_ai_deep_jobs.sql
-- Async CryptoAI deep-dive jobs. POST returns 202; a worker writes result.

CREATE TABLE IF NOT EXISTS crypto_ai_deep_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE,
  symbol VARCHAR NOT NULL,
  higher_timeframe VARCHAR NOT NULL,
  lower_timeframe VARCHAR NOT NULL,
  mode VARCHAR NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_ai_deep_jobs_user_id_created_at
  ON crypto_ai_deep_jobs (user_id, created_at);
