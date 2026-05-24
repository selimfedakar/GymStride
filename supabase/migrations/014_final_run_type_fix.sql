-- GymStride — 014: Final bulletproof fix for discover_running_buddies
-- Previous migrations may have left old overloads alive.
-- This drops EVERY version via pg_proc (ignores signature), then recreates clean.
-- Run in Supabase SQL Editor → New Query → Run.

-- ── Step 1: Drop ALL overloads by name, not by signature ──────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM   pg_proc
    WHERE  proname      = 'discover_running_buddies'
    AND    pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ── Step 2: Recreate with TEXT param — JSON null never causes a type clash ─
CREATE FUNCTION public.discover_running_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT   DEFAULT 50,
  p_filter_run_type TEXT    DEFAULT NULL,
  p_limit           INT     DEFAULT 20,
  p_offset          INT     DEFAULT 0
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
  v_loc      GEOGRAPHY;
  v_run_type public.run_type;
BEGIN
  SELECT pr.location INTO v_loc
  FROM   public.profiles pr
  WHERE  pr.id = p_current_user_id;

  -- TEXT → run_type safely; blank/null stays NULL (no = operator error possible)
  v_run_type := CASE
    WHEN COALESCE(TRIM(p_filter_run_type), '') = '' THEN NULL
    ELSE p_filter_run_type::public.run_type
  END;

  RETURN QUERY
  SELECT
    p.id                                                                AS profile_id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT          AS age,
    rp.run_types,
    rp.avg_pace_seconds_per_km,
    COUNT(DISTINCT pb.badge_id)::INT                                    AS badge_overlap_count,
    CASE
      WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
      THEN ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
      ELSE NULL::FLOAT
    END                                                                 AS distance_km,
    pp.url                                                              AS profile_photo_url,
    p.last_active_at
  FROM  public.profiles p
  JOIN  public.running_preferences rp ON rp.profile_id = p.id
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
    WHERE  pph.profile_id = p.id AND pph.position = 0
    LIMIT  1
  ) pp ON true
  WHERE p.id <> p_current_user_id
    AND p.is_active = true
    AND (v_run_type IS NULL OR rp.run_types @> ARRAY[v_run_type])
    AND (
      v_loc IS NULL
      OR p.location IS NULL
      OR ST_DWithin(p.location, v_loc, p_radius_km * 1000)
    )
  GROUP BY
    p.id, p.username, p.full_name, p.date_of_birth,
    rp.run_types, rp.avg_pace_seconds_per_km,
    p.location, p.last_active_at, pp.url
  ORDER BY
    badge_overlap_count DESC,
    CASE WHEN v_loc IS NOT NULL AND p.location IS NOT NULL
         THEN ST_Distance(p.location, v_loc) ELSE NULL
    END ASC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_running_buddies(UUID, FLOAT, TEXT, INT, INT) TO authenticated;

-- ── Step 3: Reload PostgREST schema cache immediately ─────────────────────
NOTIFY pgrst, 'reload schema';
