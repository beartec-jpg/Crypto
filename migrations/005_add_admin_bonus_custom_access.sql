-- Add admin-controlled fields to crypto_subscriptions
-- bonus_ai_credits: admin-granted bonus AI credits added on top of tier quota
-- bonus_elliott_credits: admin-granted bonus Elliott Wave AI credits
-- custom_tool_access: JSONB array of custom tool/indicator IDs granted by admin

ALTER TABLE crypto_subscriptions
  ADD COLUMN IF NOT EXISTS bonus_ai_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_elliott_credits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_tool_access JSONB;
