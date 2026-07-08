-- ============================================================
-- GymStride — 024: Activity streaks
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Exposes get_my_streak(): the workout_logs table already holds
-- everything needed; this surfaces it as a single cheap call so the
-- Log tab can render a "🔥 X-day streak" card and Profile can render a
-- 7-day activity strip. Runs for auth.uid() only (no profile_id param)
-- so a client can never read another user's activity.
--
-- A "streak day" = any calendar day (UTC) with ≥1 workout_log.
-- current_streak counts consecutive days ending on the most recent
-- logged day, but only if that day is today or yesterday (otherwise 0).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_streak()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_current      INT  := 0;
  v_longest      INT  := 0;
  v_run          INT  := 0;
  v_prev_day     DATE := NULL;
  v_last_day     DATE := NULL;
  v_active_today BOOLEAN := false;
  v_week_count   INT  := 0;
  v_days         JSONB := '[]'::JSONB;
  r              RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Longest streak across all history + capture the most recent day.
  FOR r IN
    SELECT DISTINCT DATE(logged_at AT TIME ZONE 'UTC') AS d
    FROM   public.workout_logs
    WHERE  profile_id = v_uid
    ORDER  BY d
  LOOP
    IF v_prev_day IS NULL OR r.d = v_prev_day + INTERVAL '1 day' THEN
      v_run := CASE WHEN v_prev_day IS NULL THEN 1 ELSE v_run + 1 END;
    ELSE
      v_run := 1;
    END IF;
    IF v_run > v_longest THEN v_longest := v_run; END IF;
    v_prev_day := r.d;
    v_last_day := r.d;
  END LOOP;

  -- The run value at the end of the loop is the streak ending on v_last_day.
  -- It only counts as "current" if the last logged day is today or yesterday.
  IF v_last_day IS NOT NULL
     AND v_last_day >= (CURRENT_DATE - INTERVAL '1 day') THEN
    v_current      := v_run;
    v_active_today := (v_last_day = CURRENT_DATE);
  END IF;

  -- Workouts logged in the current ISO week.
  SELECT COUNT(DISTINCT DATE(logged_at AT TIME ZONE 'UTC'))
  INTO   v_week_count
  FROM   public.workout_logs
  WHERE  profile_id = v_uid
    AND  logged_at >= DATE_TRUNC('week', CURRENT_DATE);

  -- Last 7 days (today back to 6 days ago) as [{date, count}] for the strip.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.day, 'count', COALESCE(c.cnt, 0)) ORDER BY d.day), '[]'::JSONB)
  INTO   v_days
  FROM (
    SELECT (CURRENT_DATE - g)::DATE AS day
    FROM   generate_series(0, 6) AS g
  ) d
  LEFT JOIN (
    SELECT DATE(logged_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS cnt
    FROM   public.workout_logs
    WHERE  profile_id = v_uid
      AND  logged_at >= (CURRENT_DATE - INTERVAL '6 days')
    GROUP  BY 1
  ) c ON c.day = d.day;

  RETURN jsonb_build_object(
    'current_streak', v_current,
    'longest_streak', v_longest,
    'active_today',   v_active_today,
    'this_week',      v_week_count,
    'last_7_days',    v_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_streak() TO authenticated;
