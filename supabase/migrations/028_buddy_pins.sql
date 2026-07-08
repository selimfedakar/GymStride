-- ============================================================
-- GymStride — 028: Map pins for discovery (privacy-fuzzed)
-- Run in Supabase SQL Editor → New Query → Run.
--
-- get_buddy_pins() powers the list↔map toggle on the Gym/Running tabs.
-- Coordinates are snapped to 2 decimal places (≈1.1 km cells) so the map
-- conveys density and rough area WITHOUT exposing anyone's precise
-- location. Runs for auth.uid() (center = caller), excludes blocked users.
-- p_type: 'gym' | 'running' | NULL (all).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_buddy_pins(
  p_radius_km FLOAT DEFAULT 50,
  p_type      TEXT  DEFAULT NULL
)
RETURNS TABLE (
  profile_id        UUID,
  full_name         TEXT,
  profile_photo_url TEXT,
  lat               FLOAT,
  lng               FLOAT,
  distance_km       FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_loc GEOGRAPHY;
BEGIN
  SELECT pr.location INTO v_loc FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_loc IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.profile_photo_url,
    ROUND(ST_Y(p.location::geometry)::NUMERIC, 2)::FLOAT AS lat,
    ROUND(ST_X(p.location::geometry)::NUMERIC, 2)::FLOAT AS lng,
    ROUND((ST_Distance(p.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT AS distance_km
  FROM public.profiles p
  WHERE p.id <> v_uid
    AND p.is_active = true
    AND p.location IS NOT NULL
    AND ST_DWithin(p.location, v_loc, p_radius_km * 1000)
    AND (
      p_type IS NULL
      OR (p_type = 'gym'     AND EXISTS (SELECT 1 FROM public.gym_preferences gp     WHERE gp.profile_id = p.id))
      OR (p_type = 'running' AND EXISTS (SELECT 1 FROM public.running_preferences rp WHERE rp.profile_id = p.id))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = v_uid AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = v_uid)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_buddy_pins(FLOAT, TEXT) TO authenticated;
