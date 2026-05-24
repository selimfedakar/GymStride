-- GymStride — 010: Fix discovery RPCs (v2)
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Fixes applied vs previous attempt:
--   • Parameters renamed with p_ prefix so they never shadow column names.
--   • Every subquery table now has its own alias (my_pb, pph, pr) so
--     "profile_id" is always qualified and never ambiguous (42702).
--   • profile_photo_url comes from profile_photos position=0 via LATERAL join.
--   • NULL location is handled: if caller has no location the radius filter
--     is skipped and distance returns NULL rather than throwing.

-- ── Drop all known signatures ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discover_gym_buddies(UUID, FLOAT, INT);
DROP FUNCTION IF EXISTS public.discover_running_buddies(UUID, FLOAT, public.run_type);
DROP FUNCTION IF EXISTS discover_gym_buddies(UUID, FLOAT, INT);
DROP FUNCTION IF EXISTS discover_running_buddies(UUID, FLOAT, run_type);

-- ── discover_gym_buddies ─────────────────────────────────────────────────────
CREATE FUNCTION public.discover_gym_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT DEFAULT 50,
  p_min_frequency   INT   DEFAULT 1
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
BEGIN
  -- Fetch caller's location once into a local variable to avoid repeated subqueries
  SELECT pr.location INTO v_loc
  FROM   public.profiles pr
  WHERE  pr.id = p_current_user_id;

  RETURN QUERY
  SELECT
    p.id                                                               AS profile_id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT         AS age,
    p.experience_level,
    COUNT(DISTINCT pb.badge_id)::INT                                   AS badge_overlap_count,
    CASE
      WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
      THEN ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
      ELSE NULL::FLOAT
    END                                                                AS distance_km,
    pp.url                                                             AS profile_photo_url,
    p.last_active_at
  FROM public.profiles p
  JOIN public.gym_preferences gp
    ON  gp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      -- Use alias my_pb so profile_id is unambiguous (outer pb vs inner table)
      SELECT my_pb.badge_id
      FROM   public.profile_badges my_pb
      WHERE  my_pb.profile_id = p_current_user_id
    )
  LEFT JOIN LATERAL (
    -- Use alias pph so profile_id is unambiguous inside the LATERAL scope
    SELECT pph.url
    FROM   public.profile_photos pph
    WHERE  pph.profile_id = p.id
      AND  pph.position   = 0
    LIMIT  1
  ) pp ON true
  WHERE p.id <> p_current_user_id
    AND p.is_active = true
    AND gp.frequency_per_week >= p_min_frequency
    AND (
      v_loc IS NULL
      OR p.location IS NULL
      OR ST_DWithin(p.location, v_loc, p_radius_km * 1000)
    )
  GROUP BY
    p.id, p.username, p.full_name, p.date_of_birth, p.experience_level,
    p.location, p.last_active_at, pp.url
  ORDER BY
    badge_overlap_count DESC,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
         THEN ST_Distance(p.location, v_loc) ELSE NULL
    END ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_gym_buddies(UUID, FLOAT, INT) TO authenticated;

-- ── discover_running_buddies ─────────────────────────────────────────────────
CREATE FUNCTION public.discover_running_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT           DEFAULT 50,
  p_filter_run_type public.run_type DEFAULT NULL
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
BEGIN
  SELECT pr.location INTO v_loc
  FROM   public.profiles pr
  WHERE  pr.id = p_current_user_id;

  RETURN QUERY
  SELECT
    p.id                                                               AS profile_id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT         AS age,
    rp.run_types,
    rp.avg_pace_seconds_per_km,
    COUNT(DISTINCT pb.badge_id)::INT                                   AS badge_overlap_count,
    CASE
      WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
      THEN ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
      ELSE NULL::FLOAT
    END                                                                AS distance_km,
    pp.url                                                             AS profile_photo_url,
    p.last_active_at
  FROM public.profiles p
  JOIN public.running_preferences rp
    ON  rp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      SELECT my_pb.badge_id
      FROM   public.profile_badges my_pb
      WHERE  my_pb.profile_id = p_current_user_id
    )
  LEFT JOIN LATERAL (
    SELECT pph.url
    FROM   public.profile_photos pph
    WHERE  pph.profile_id = p.id
      AND  pph.position   = 0
    LIMIT  1
  ) pp ON true
  WHERE p.id <> p_current_user_id
    AND p.is_active = true
    AND (p_filter_run_type IS NULL OR p_filter_run_type = ANY(rp.run_types))
    AND (
      v_loc IS NULL
      OR p.location IS NULL
      OR ST_DWithin(p.location, v_loc, p_radius_km * 1000)
    )
  GROUP BY
    p.id, p.username, p.full_name, p.date_of_birth, rp.run_types,
    rp.avg_pace_seconds_per_km, p.location, p.last_active_at, pp.url
  ORDER BY
    badge_overlap_count DESC,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
         THEN ST_Distance(p.location, v_loc) ELSE NULL
    END ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_running_buddies(UUID, FLOAT, public.run_type) TO authenticated;
