-- Add last_active_at to both discovery RPCs so BuddyCard can display activity status.

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
  distance_km         FLOAT,
  profile_photo_url   TEXT,
  last_active_at      TIMESTAMPTZ
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
    ) / 1000.0)::NUMERIC, 1)::FLOAT,
    p.profile_photo_url,
    p.last_active_at
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
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, p.experience_level, p.location, p.profile_photo_url, p.last_active_at
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;

CREATE OR REPLACE FUNCTION discover_running_buddies(
  current_user_id UUID,
  radius_km       FLOAT    DEFAULT 50,
  filter_run_type run_type DEFAULT NULL
)
RETURNS TABLE (
  profile_id               UUID,
  username                 TEXT,
  full_name                TEXT,
  age                      INT,
  run_types                run_type[],
  avg_pace_seconds_per_km  INT,
  badge_overlap_count      INT,
  distance_km              FLOAT,
  profile_photo_url        TEXT,
  last_active_at           TIMESTAMPTZ
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
    ) / 1000.0)::NUMERIC, 1)::FLOAT,
    p.profile_photo_url,
    p.last_active_at
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
           rp.avg_pace_seconds_per_km, p.location, p.profile_photo_url, p.last_active_at
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;
