-- ============================================================
-- GymStride — 030: Advanced discovery filters
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Adds (supersedes 025):
--   • p_same_university — "people on my campus" (free filter)
--   • p_experience (gym) / p_max_pace (running) — Pro advanced filters
-- Retains the block exclusion + pagination + fuzz-free distance logic.
-- ============================================================

DROP FUNCTION IF EXISTS public.discover_gym_buddies(UUID, FLOAT, INT, INT, INT);
DROP FUNCTION IF EXISTS public.discover_running_buddies(UUID, FLOAT, public.run_type, INT, INT);

CREATE FUNCTION public.discover_gym_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT   DEFAULT 50,
  p_min_frequency   INT     DEFAULT 1,
  p_limit           INT     DEFAULT 20,
  p_offset          INT     DEFAULT 0,
  p_same_university BOOLEAN DEFAULT false,
  p_experience      public.experience_level DEFAULT NULL
)
RETURNS TABLE (
  profile_id          UUID,
  username            TEXT,
  full_name           TEXT,
  age                 INT,
  experience_level    public.experience_level,
  badge_overlap_count INT,
  distance_km         FLOAT,
  profile_photo_url   TEXT,
  last_active_at      TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_loc GEOGRAPHY;
  v_uni UUID;
BEGIN
  SELECT pr.location, pr.university_id INTO v_loc, v_uni
  FROM public.profiles pr WHERE pr.id = p_current_user_id;

  RETURN QUERY
  SELECT
    p.id, p.username, p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT,
    p.experience_level,
    COUNT(DISTINCT pb.badge_id)::INT,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
         THEN ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
         ELSE NULL::FLOAT END,
    pp.url,
    p.last_active_at
  FROM public.profiles p
  JOIN public.gym_preferences gp ON gp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON pb.profile_id = p.id
   AND pb.badge_id IN (SELECT my_pb.badge_id FROM public.profile_badges my_pb WHERE my_pb.profile_id = p_current_user_id)
  LEFT JOIN LATERAL (
    SELECT pph.url FROM public.profile_photos pph
    WHERE pph.profile_id = p.id AND pph.position = 0 LIMIT 1
  ) pp ON true
  WHERE p.id <> p_current_user_id
    AND p.is_active = true
    AND gp.frequency_per_week >= p_min_frequency
    AND (v_loc IS NULL OR p.location IS NULL OR ST_DWithin(p.location, v_loc, p_radius_km * 1000))
    AND (NOT p_same_university OR (v_uni IS NOT NULL AND p.university_id = v_uni))
    AND (p_experience IS NULL OR p.experience_level = p_experience)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = p_current_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_current_user_id)
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, p.experience_level, p.location, p.last_active_at, pp.url
  ORDER BY COUNT(DISTINCT pb.badge_id) DESC,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL THEN ST_Distance(p.location, v_loc) ELSE NULL END ASC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_gym_buddies(UUID, FLOAT, INT, INT, INT, BOOLEAN, public.experience_level) TO authenticated;

CREATE FUNCTION public.discover_running_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT           DEFAULT 50,
  p_filter_run_type public.run_type DEFAULT NULL,
  p_limit           INT             DEFAULT 20,
  p_offset          INT             DEFAULT 0,
  p_same_university BOOLEAN         DEFAULT false,
  p_max_pace        INT             DEFAULT NULL
)
RETURNS TABLE (
  profile_id               UUID,
  username                 TEXT,
  full_name                TEXT,
  age                      INT,
  run_types                public.run_type[],
  avg_pace_seconds_per_km  INT,
  badge_overlap_count      INT,
  distance_km              FLOAT,
  profile_photo_url        TEXT,
  last_active_at           TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_loc GEOGRAPHY;
  v_uni UUID;
BEGIN
  SELECT pr.location, pr.university_id INTO v_loc, v_uni
  FROM public.profiles pr WHERE pr.id = p_current_user_id;

  RETURN QUERY
  SELECT
    p.id, p.username, p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT,
    rp.run_types, rp.avg_pace_seconds_per_km,
    COUNT(DISTINCT pb.badge_id)::INT,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
         THEN ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
         ELSE NULL::FLOAT END,
    pp.url,
    p.last_active_at
  FROM public.profiles p
  JOIN public.running_preferences rp ON rp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON pb.profile_id = p.id
   AND pb.badge_id IN (SELECT my_pb.badge_id FROM public.profile_badges my_pb WHERE my_pb.profile_id = p_current_user_id)
  LEFT JOIN LATERAL (
    SELECT pph.url FROM public.profile_photos pph
    WHERE pph.profile_id = p.id AND pph.position = 0 LIMIT 1
  ) pp ON true
  WHERE p.id <> p_current_user_id
    AND p.is_active = true
    AND (p_filter_run_type IS NULL OR p_filter_run_type = ANY(rp.run_types))
    AND (v_loc IS NULL OR p.location IS NULL OR ST_DWithin(p.location, v_loc, p_radius_km * 1000))
    AND (NOT p_same_university OR (v_uni IS NOT NULL AND p.university_id = v_uni))
    AND (p_max_pace IS NULL OR (rp.avg_pace_seconds_per_km IS NOT NULL AND rp.avg_pace_seconds_per_km <= p_max_pace))
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = p_current_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_current_user_id)
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, rp.run_types, rp.avg_pace_seconds_per_km, p.location, p.last_active_at, pp.url
  ORDER BY COUNT(DISTINCT pb.badge_id) DESC,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL THEN ST_Distance(p.location, v_loc) ELSE NULL END ASC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_running_buddies(UUID, FLOAT, public.run_type, INT, INT, BOOLEAN, INT) TO authenticated;
