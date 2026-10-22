-- 015_crypto_ai_deep_jobs.sql
-- Async CryptoAI deep-dive jobs. One active job per (symbol, HTF, LTF, mode incl. horizon),
-- shared across users; each user joins as a waiter and is charged at most once.

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_ai_deep_jobs_active
  ON crypto_ai_deep_jobs (symbol, higher_timeframe, lower_timeframe, mode)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS crypto_ai_deep_job_waiters (
  job_id UUID NOT NULL REFERENCES crypto_ai_deep_jobs(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES crypto_users(id) ON DELETE CASCADE,
  charged BOOLEAN NOT NULL DEFAULT false,
  exempt BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, user_id)
);
