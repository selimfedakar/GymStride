-- User report/block table for App Store safety requirements.

CREATE TABLE IF NOT EXISTS reports (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reporter_id, reported_id)
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can insert own reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "users can view own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);
