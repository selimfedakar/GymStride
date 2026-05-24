-- Extra profile photos (max 3 slots per user, stored in avatars bucket)
CREATE TABLE profile_photos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url        text        NOT NULL,
  position   smallint    NOT NULL CHECK (position BETWEEN 0 AND 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, position)
);

CREATE INDEX idx_profile_photos_profile_id ON profile_photos(profile_id);

ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_photos_select"
  ON profile_photos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profile_photos_insert"
  ON profile_photos FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "profile_photos_update"
  ON profile_photos FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "profile_photos_delete"
  ON profile_photos FOR DELETE TO authenticated
  USING (profile_id = auth.uid());
