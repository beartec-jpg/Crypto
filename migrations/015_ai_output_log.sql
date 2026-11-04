-- 015_ai_output_log.sql
-- Compliance log of every AI technical scenario / overview delivered (web, Discord, PNG).
-- Purpose: compliance evidence and our own quality review of AI outputs.
-- Retention: keep 1 year / 365 days (AI_OUTPUT_LOG_RETENTION_DAYS in api/_lib/aiOutputLog.ts), then purge:
--   DELETE FROM ai_output_log WHERE created_at < NOW() - INTERVAL '365 days';

CREATE TABLE IF NOT EXISTS ai_output_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  user_id VARCHAR,
  symbol VARCHAR NOT NULL,
  timeframe VARCHAR,
  mode VARCHAR,
  analysis_type VARCHAR,
  prompt_version VARCHAR NOT NULL,
  delivery_channel VARCHAR NOT NULL,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  output_json JSONB,
  output_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_output_log_created_at ON ai_output_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_output_log_user_symbol ON ai_output_log (user_id, symbol);
