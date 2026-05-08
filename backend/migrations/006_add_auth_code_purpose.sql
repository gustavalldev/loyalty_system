ALTER TABLE auth_codes
ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'login';

CREATE INDEX IF NOT EXISTS idx_auth_codes_target_channel_purpose_active
ON auth_codes (target, channel, purpose, created_at DESC)
WHERE consumed_at IS NULL;
