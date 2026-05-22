-- ============================================================
-- GymStride — Initial Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";   -- geo radius queries

-- ────────────────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────────────────
CREATE TYPE gender_type        AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');
CREATE TYPE experience_level   AS ENUM ('beginner', 'intermediate', 'advanced', 'elite');
CREATE TYPE badge_category     AS ENUM ('gym', 'running', 'general');
CREATE TYPE run_type           AS ENUM ('long_run', 'short_run', 'sprint');
CREATE TYPE chat_request_status AS ENUM ('pending', 'accepted', 'declined');

-- ────────────────────────────────────────────────────────────
-- Universities
-- ────────────────────────────────────────────────────────────
CREATE TABLE universities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  city       TEXT,
  country    TEXT NOT NULL DEFAULT 'US',
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Profiles  (extends Supabase auth.users 1-to-1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username          TEXT        UNIQUE NOT NULL,
  full_name         TEXT        NOT NULL,
  date_of_birth     DATE        NOT NULL,
  gender            gender_type NOT NULL,
  bio               TEXT,
  profile_photo_url TEXT,
  -- PostGIS geography point for fast ST_DWithin radius queries
  location          GEOGRAPHY(POINT, 4326),
  location_name     TEXT,
  university_id     UUID        REFERENCES universities(id),
  experience_level  experience_level NOT NULL DEFAULT 'beginner',
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calculates age on the fly — never stale
CREATE VIEW profiles_with_age AS
SELECT
  *,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth))::INT AS age
FROM profiles;

-- ────────────────────────────────────────────────────────────
-- Badges master list
-- ────────────────────────────────────────────────────────────
CREATE TABLE badges (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          UNIQUE NOT NULL,
  description   TEXT,
  category      badge_category NOT NULL,
  icon_name     TEXT,          -- maps to icon key in the RN icon set
  is_earnable   BOOLEAN       NOT NULL DEFAULT false,
  -- JSON rule evaluated server-side, e.g. {"type":"gym_frequency","sessions_per_week":3,"weeks":4}
  earn_criteria JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Profile ↔ Badge (junction)
-- ────────────────────────────────────────────────────────────
CREATE TABLE profile_badges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id   UUID        NOT NULL REFERENCES badges(id)   ON DELETE CASCADE,
  is_earned  BOOLEAN     NOT NULL DEFAULT false, -- false = self-selected
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, badge_id)
);

-- ────────────────────────────────────────────────────────────
-- Gym preferences  (1-to-1 with profiles)
-- ────────────────────────────────────────────────────────────
CREATE TABLE gym_preferences (
  profile_id        UUID    PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  frequency_per_week INT    CHECK (frequency_per_week BETWEEN 1 AND 7),
  gym_location      GEOGRAPHY(POINT, 4326),
  gym_name          TEXT,
  workout_styles    TEXT[], -- e.g. {powerlifting, bodybuilding, crossfit, calisthenics}
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Running preferences  (1-to-1 with profiles)
-- ────────────────────────────────────────────────────────────
CREATE TABLE running_preferences (
  profile_id           UUID     PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  run_types            run_type[],
  -- stored in seconds/km; display layer formats as mm:ss
  avg_pace_seconds_per_km INT,
  weekly_distance_km   FLOAT,
  preferred_time       TEXT,    -- 'morning' | 'afternoon' | 'evening'
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- Workout logs  (drives earnable badge evaluation)
-- ────────────────────────────────────────────────────────────
CREATE TABLE workout_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workout_type TEXT NOT NULL,   -- 'gym' | 'long_run' | 'short_run' | 'sprint'
  distance_km  FLOAT,           -- relevant for runs
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT
);

-- ────────────────────────────────────────────────────────────
-- Chat requests  (replaces swipe-to-match)
-- ────────────────────────────────────────────────────────────
CREATE TABLE chat_requests (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     UUID              NOT NULL REFERENCES profiles(id),
  target_id        UUID              NOT NULL REFERENCES profiles(id),
  opening_message  TEXT              NOT NULL,
  status           chat_request_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMPTZ,
  CONSTRAINT no_self_request CHECK (requester_id != target_id),
  UNIQUE (requester_id, target_id)
);

-- ────────────────────────────────────────────────────────────
-- Conversations + Messages
-- ────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_profiles_location      ON profiles      USING GIST (location);
CREATE INDEX idx_gym_location           ON gym_preferences USING GIST (gym_location);
CREATE INDEX idx_profile_badges_profile ON profile_badges (profile_id);
CREATE INDEX idx_profile_badges_badge   ON profile_badges (badge_id);
CREATE INDEX idx_messages_convo_time    ON messages (conversation_id, created_at DESC);
CREATE INDEX idx_workout_logs_profile   ON workout_logs (profile_id, logged_at DESC);
CREATE INDEX idx_chat_requests_target   ON chat_requests (target_id, status);

-- ────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bump conversation.last_message_at on every new message
CREATE OR REPLACE FUNCTION bump_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations SET last_message_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_last_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_last_message();

-- ────────────────────────────────────────────────────────────
-- Discovery function — Gym Tab
-- Returns profiles ordered by badge overlap, then distance
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION discover_gym_buddies(
  current_user_id  UUID,
  radius_km        FLOAT   DEFAULT 50,
  min_frequency    INT     DEFAULT 1
)
RETURNS TABLE (
  profile_id          UUID,
  username            TEXT,
  full_name           TEXT,
  age                 INT,
  experience_level    experience_level,
  badge_overlap_count INT,
  distance_km         FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT,
    p.experience_level,
    COUNT(DISTINCT pb.badge_id)::INT,
    ROUND((ST_Distance(p.location,
      (SELECT location FROM profiles WHERE id = current_user_id)
    ) / 1000.0)::NUMERIC, 1)::FLOAT
  FROM profiles p
  JOIN gym_preferences gp ON gp.profile_id = p.id
  LEFT JOIN profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      SELECT badge_id FROM profile_badges WHERE profile_id = current_user_id
    )
  WHERE p.id != current_user_id
    AND p.is_active = true
    AND gp.frequency_per_week >= min_frequency
    AND ST_DWithin(
      p.location,
      (SELECT location FROM profiles WHERE id = current_user_id),
      radius_km * 1000
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, p.experience_level, p.location
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;

-- Discovery function — Running Tab
CREATE OR REPLACE FUNCTION discover_running_buddies(
  current_user_id UUID,
  radius_km       FLOAT    DEFAULT 50,
  filter_run_type run_type DEFAULT NULL
)
RETURNS TABLE (
  profile_id          UUID,
  username            TEXT,
  full_name           TEXT,
  age                 INT,
  run_types           run_type[],
  avg_pace_seconds_per_km INT,
  badge_overlap_count INT,
  distance_km         FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT,
    rp.run_types,
    rp.avg_pace_seconds_per_km,
    COUNT(DISTINCT pb.badge_id)::INT,
    ROUND((ST_Distance(p.location,
      (SELECT location FROM profiles WHERE id = current_user_id)
    ) / 1000.0)::NUMERIC, 1)::FLOAT
  FROM profiles p
  JOIN running_preferences rp ON rp.profile_id = p.id
  LEFT JOIN profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      SELECT badge_id FROM profile_badges WHERE profile_id = current_user_id
    )
  WHERE p.id != current_user_id
    AND p.is_active = true
    AND (filter_run_type IS NULL OR filter_run_type = ANY(rp.run_types))
    AND ST_DWithin(
      p.location,
      (SELECT location FROM profiles WHERE id = current_user_id),
      radius_km * 1000
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, rp.run_types,
           rp.avg_pace_seconds_per_km, p.location
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;
