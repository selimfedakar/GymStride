-- ============================================================
-- GymStride — 029: Progress aggregates for charts
-- Run in Supabase SQL Editor → New Query → Run.
--
-- get_my_progress() returns the caller's last 8 ISO weeks of training
-- volume (total sessions + running km per week, oldest → newest) plus
-- current-month totals. Powers the Profile progress chart.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_progress()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_weeks        JSONB;
  v_month_km     FLOAT;
  v_month_count  INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'week_start', w.week_start,
             'sessions',   COALESCE(agg.sessions, 0),
             'run_km',     ROUND(COALESCE(agg.run_km, 0)::NUMERIC, 1)
           ) ORDER BY w.week_start
         ), '[]'::JSONB)
  INTO v_weeks
  FROM (
    SELECT (DATE_TRUNC('week', CURRENT_DATE) - (g || ' weeks')::INTERVAL)::DATE AS week_start
    FROM generate_series(0, 7) AS g
  ) w
  LEFT JOIN (
    SELECT
      DATE_TRUNC('week', logged_at)::DATE AS week_start,
      COUNT(*)                            AS sessions,
      SUM(CASE WHEN workout_type IN ('long_run','short_run','sprint')
               THEN COALESCE(distance_km, 0) ELSE 0 END) AS run_km
    FROM public.workout_logs
    WHERE profile_id = v_uid
      AND logged_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
    GROUP BY 1
  ) agg ON agg.week_start = w.week_start;

  SELECT
    ROUND(COALESCE(SUM(CASE WHEN workout_type IN ('long_run','short_run','sprint')
                            THEN COALESCE(distance_km, 0) ELSE 0 END), 0)::NUMERIC, 1),
    COUNT(*)
  INTO v_month_km, v_month_count
  FROM public.workout_logs
  WHERE profile_id = v_uid
    AND logged_at >= DATE_TRUNC('month', CURRENT_DATE);

  RETURN jsonb_build_object(
    'weeks',              v_weeks,
    'this_month_km',      v_month_km,
    'this_month_sessions', v_month_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_progress() TO authenticated;
