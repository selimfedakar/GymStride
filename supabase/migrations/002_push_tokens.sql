-- ============================================================
-- GymStride — Push Tokens
-- ============================================================

CREATE TABLE push_tokens (
  profile_id UUID    PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL,
  platform   TEXT    NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One token per profile; upsert on update
CREATE OR REPLACE FUNCTION update_push_token_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_push_token_updated_at();

-- ────────────────────────────────────────────────────────────
-- RLS: users can only manage their own token
-- ────────────────────────────────────────────────────────────
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can upsert own token"
  ON push_tokens FOR ALL
  USING      (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Service role (edge functions) can read all tokens to send notifications
CREATE POLICY "service role can read all tokens"
  ON push_tokens FOR SELECT
  USING (auth.role() = 'service_role');
