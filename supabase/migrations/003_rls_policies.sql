-- ============================================================
-- GymStride — Row Level Security
-- ============================================================
-- Design principles:
--   1. Default-deny: RLS enabled on every table; no policy = no access.
--   2. Authenticated ≠ authorised: SELECT on shared data requires
--      auth.role() = 'authenticated'; writes require ownership.
--   3. Sensitive writes go through SECURITY DEFINER functions that
--      re-validate ownership server-side, preventing client spoofing.
--   4. All SECURITY DEFINER functions use SET search_path = '' and
--      fully-qualified identifiers to block search_path injection.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Enable RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_preferences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                ENABLE ROW LEVEL SECURITY;
-- push_tokens already has RLS from migration 002

-- ────────────────────────────────────────────────────────────
-- 2. profiles
--    Read:   any authenticated user (needed for discovery)
--    Write:  owner only; id must equal auth.uid()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "profiles: authenticated can read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles: owner can insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: owner can update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: owner can delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 3. badges  (master catalogue — read-only for users)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "badges: authenticated can read"
  ON public.badges FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE for authenticated role; use service role.

-- ────────────────────────────────────────────────────────────
-- 4. profile_badges
--    Read:   any authenticated user (badge overlap in discovery)
--    Insert: owner only AND is_earned must be false
--            (earned badges inserted exclusively via evaluate_and_award_badges())
--    Delete: owner only AND is_earned must be false
--            (earned badges are permanent records)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "profile_badges: authenticated can read"
  ON public.profile_badges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profile_badges: owner can insert self-selected"
  ON public.profile_badges FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = profile_id
    AND is_earned = false
  );

CREATE POLICY "profile_badges: owner can delete self-selected"
  ON public.profile_badges FOR DELETE
  TO authenticated
  USING (
    auth.uid() = profile_id
    AND is_earned = false
  );
-- No UPDATE policy — badges are toggled by delete+insert.

-- ────────────────────────────────────────────────────────────
-- 5. universities  (reference data — read-only for users)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "universities: authenticated can read"
  ON public.universities FOR SELECT
  TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 6. gym_preferences
--    Read:   any authenticated user (used in discovery filters)
--    Write:  owner only
-- ────────────────────────────────────────────────────────────
CREATE POLICY "gym_preferences: authenticated can read"
  ON public.gym_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gym_preferences: owner can insert"
  ON public.gym_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "gym_preferences: owner can update"
  ON public.gym_preferences FOR UPDATE
  TO authenticated
  USING      (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "gym_preferences: owner can delete"
  ON public.gym_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = profile_id);

-- ────────────────────────────────────────────────────────────
-- 7. running_preferences  (same shape as gym_preferences)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "running_preferences: authenticated can read"
  ON public.running_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "running_preferences: owner can insert"
  ON public.running_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "running_preferences: owner can update"
  ON public.running_preferences FOR UPDATE
  TO authenticated
  USING      (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "running_preferences: owner can delete"
  ON public.running_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = profile_id);

-- ────────────────────────────────────────────────────────────
-- 8. workout_logs  (private — owner only, never visible to others)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "workout_logs: owner can read"
  ON public.workout_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY "workout_logs: owner can insert"
  ON public.workout_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "workout_logs: owner can delete"
  ON public.workout_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = profile_id);
-- No UPDATE — logs are immutable; delete + reinsert if needed.

-- ────────────────────────────────────────────────────────────
-- 9. chat_requests
--    Read:   requester OR target only
--    Insert: requester must be caller; no self-requests
--    Update: NONE for users — use accept/decline RPC functions
--    Delete: requester can retract pending; target can clean up
-- ────────────────────────────────────────────────────────────
CREATE POLICY "chat_requests: participants can read"
  ON public.chat_requests FOR SELECT
  TO authenticated
  USING (auth.uid() IN (requester_id, target_id));

CREATE POLICY "chat_requests: requester can insert"
  ON public.chat_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> target_id
  );

CREATE POLICY "chat_requests: requester can retract pending"
  ON public.chat_requests FOR DELETE
  TO authenticated
  USING (
    auth.uid() = requester_id
    AND status = 'pending'
  );
-- accept/decline go through SECURITY DEFINER functions (see section 12).

-- ────────────────────────────────────────────────────────────
-- 10. conversations
--     Read:  participants only (via conversation_participants)
--     Write: NONE for users — created atomically by accept_chat_request()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "conversations: participants can read"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.profile_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 11. conversation_participants
--     Read:  members of the same conversation only
--     Write: NONE for users — managed by accept_chat_request()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "conversation_participants: co-members can read"
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp2
      WHERE cp2.conversation_id = conversation_participants.conversation_id
        AND cp2.profile_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 12. messages
--     Read:   participants only
--     Insert: participants only; sender_id must equal auth.uid()
--     Update: NONE for users — read receipts via mark_messages_read()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "messages: participants can read"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.profile_id = auth.uid()
    )
  );

CREATE POLICY "messages: participants can insert as self"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.profile_id = auth.uid()
    )
  );

-- ============================================================
-- SECTION 13 — SECURITY DEFINER FUNCTIONS
-- All functions:
--   • SET search_path = '' prevents search_path injection
--   • Use fully-qualified names (public.table)
--   • Re-validate ownership using auth.uid() — never trust client params
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- accept_chat_request(p_request_id)
--   Caller must be the request target.
--   Atomically: marks accepted, creates conversation, adds both
--   participants, seeds the opening message.
--   Returns: new conversation_id
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_chat_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req      public.chat_requests%ROWTYPE;
  v_convo_id UUID;
BEGIN
  SELECT * INTO v_req
  FROM public.chat_requests
  WHERE id = p_request_id
  FOR UPDATE;               -- lock row to prevent double-accept races

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat_request % not found', p_request_id;
  END IF;
  IF v_req.target_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the request target may accept';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request is already %', v_req.status;
  END IF;

  UPDATE public.chat_requests
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO v_convo_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES
    (v_convo_id, v_req.requester_id),
    (v_convo_id, v_req.target_id);

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (v_convo_id, v_req.requester_id, v_req.opening_message);

  RETURN v_convo_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- decline_chat_request(p_request_id)
--   Caller must be the request target.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_chat_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.chat_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM public.chat_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat_request % not found', p_request_id;
  END IF;
  IF v_req.target_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the request target may decline';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request is already %', v_req.status;
  END IF;

  UPDATE public.chat_requests
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_request_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- mark_messages_read(p_conversation_id)
--   Marks all unread messages sent by others as read.
--   Caller must be a participant.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in conversation %', p_conversation_id;
  END IF;

  UPDATE public.messages
  SET read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Badge evaluation helpers (SECURITY DEFINER, called only by
-- evaluate_and_award_badges — not exposed directly to clients)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._gs_check_consecutive_weeks(
  p_profile_id   UUID,
  p_workout_type TEXT,
  p_min_per_week INT,
  p_req_weeks    INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_streak      INT  := 0;
  v_max_streak  INT  := 0;
  v_prev_week   DATE := NULL;
  r             RECORD;
BEGIN
  FOR r IN
    SELECT
      DATE_TRUNC('week', logged_at)::DATE AS week_start,
      COUNT(*)                             AS cnt
    FROM public.workout_logs
    WHERE profile_id   = p_profile_id
      AND workout_type = p_workout_type
    GROUP BY week_start
    HAVING COUNT(*) >= p_min_per_week
    ORDER BY week_start
  LOOP
    IF v_prev_week IS NULL THEN
      v_streak := 1;
    ELSIF r.week_start = v_prev_week + INTERVAL '7 days' THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
    IF v_streak > v_max_streak THEN v_max_streak := v_streak; END IF;
    v_prev_week := r.week_start;
  END LOOP;
  RETURN v_max_streak >= p_req_weeks;
END;
$$;

CREATE OR REPLACE FUNCTION public._gs_check_running_streak(
  p_profile_id UUID,
  p_days       INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_streak     INT  := 0;
  v_max_streak INT  := 0;
  v_prev_day   DATE := NULL;
  r            RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT DATE(logged_at AT TIME ZONE 'UTC') AS run_day
    FROM public.workout_logs
    WHERE profile_id   = p_profile_id
      AND workout_type IN ('long_run', 'short_run', 'sprint')
    ORDER BY run_day
  LOOP
    IF v_prev_day IS NULL THEN
      v_streak := 1;
    ELSIF r.run_day = v_prev_day + INTERVAL '1 day' THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
    IF v_streak > v_max_streak THEN v_max_streak := v_streak; END IF;
    v_prev_day := r.run_day;
  END LOOP;
  RETURN v_max_streak >= p_days;
END;
$$;

CREATE OR REPLACE FUNCTION public._gs_check_monthly_distance(
  p_profile_id UUID,
  p_min_km     FLOAT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_max FLOAT := 0;
BEGIN
  SELECT COALESCE(MAX(monthly_total), 0) INTO v_max
  FROM (
    SELECT
      DATE_TRUNC('month', logged_at) AS month,
      SUM(COALESCE(distance_km, 0))  AS monthly_total
    FROM public.workout_logs
    WHERE profile_id   = p_profile_id
      AND workout_type IN ('long_run', 'short_run', 'sprint')
      AND distance_km  IS NOT NULL
    GROUP BY month
  ) t;
  RETURN v_max >= p_min_km;
END;
$$;

CREATE OR REPLACE FUNCTION public._gs_check_multi_run_week(
  p_profile_id    UUID,
  p_min_long_km   FLOAT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM (
      SELECT DATE_TRUNC('week', logged_at) AS wk
      FROM   public.workout_logs
      WHERE  profile_id   = p_profile_id
        AND  workout_type = 'long_run'
        AND  COALESCE(distance_km, 0) >= p_min_long_km
    ) lr
    JOIN (
      SELECT DATE_TRUNC('week', logged_at) AS wk
      FROM   public.workout_logs
      WHERE  profile_id   = p_profile_id
        AND  workout_type = 'sprint'
    ) sp USING (wk)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- evaluate_and_award_badges()
--   Runs entirely for auth.uid() — no profile_id parameter so
--   clients cannot evaluate another user's badges.
--   Returns JSONB array: [{"id":"...","name":"..."}]
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_and_award_badges()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID   := auth.uid();
  v_badge      RECORD;
  v_met        BOOLEAN;
  v_result     JSONB  := '[]'::JSONB;
  v_crit       JSONB;
BEGIN
  FOR v_badge IN
    SELECT id, name, earn_criteria
    FROM public.badges
    WHERE is_earnable = true
      AND id NOT IN (
        SELECT badge_id FROM public.profile_badges
        WHERE  profile_id = v_uid
          AND  is_earned  = true
      )
  LOOP
    v_crit := v_badge.earn_criteria;
    v_met  := CASE v_crit->>'type'
      WHEN 'total_sessions' THEN (
        SELECT COUNT(*) >= (v_crit->>'count')::INT
        FROM public.workout_logs
        WHERE profile_id   = v_uid
          AND workout_type = v_crit->>'workout_type'
      )
      WHEN 'gym_frequency' THEN
        public._gs_check_consecutive_weeks(
          v_uid, 'gym',
          (v_crit->>'sessions_per_week')::INT,
          (v_crit->>'weeks')::INT
        )
      WHEN 'running_streak' THEN
        public._gs_check_running_streak(v_uid, (v_crit->>'days')::INT)
      WHEN 'monthly_distance_km' THEN
        public._gs_check_monthly_distance(v_uid, (v_crit->>'amount')::FLOAT)
      WHEN 'multi_run_type_week' THEN
        public._gs_check_multi_run_week(v_uid, (v_crit->>'min_long_run_km')::FLOAT)
      ELSE false
    END;

    IF v_met THEN
      INSERT INTO public.profile_badges (profile_id, badge_id, is_earned)
      VALUES (v_uid, v_badge.id, true)
      ON CONFLICT (profile_id, badge_id) DO UPDATE SET is_earned = true;

      v_result := v_result || jsonb_build_object('id', v_badge.id, 'name', v_badge.name);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Harden discovery functions
-- Callers cannot impersonate another user by passing a foreign
-- current_user_id; the function validates auth.uid() matches.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discover_gym_buddies(
  current_user_id  UUID,
  radius_km        FLOAT   DEFAULT 50,
  min_frequency    INT     DEFAULT 1
)
RETURNS TABLE (
  profile_id          UUID,
  username            TEXT,
  full_name           TEXT,
  age                 INT,
  experience_level    public.experience_level,
  badge_overlap_count INT,
  distance_km         FLOAT
) LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'current_user_id must match the authenticated user';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT,
    p.experience_level,
    COUNT(DISTINCT pb.badge_id)::INT,
    ROUND((ST_Distance(p.location,
      (SELECT location FROM public.profiles WHERE id = current_user_id)
    ) / 1000.0)::NUMERIC, 1)::FLOAT
  FROM public.profiles p
  JOIN public.gym_preferences gp ON gp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      SELECT badge_id FROM public.profile_badges WHERE profile_id = current_user_id
    )
  WHERE p.id <> current_user_id
    AND p.is_active = true
    AND gp.frequency_per_week >= min_frequency
    AND ST_DWithin(
      p.location,
      (SELECT location FROM public.profiles WHERE id = current_user_id),
      radius_km * 1000
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, p.experience_level, p.location
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.discover_running_buddies(
  current_user_id UUID,
  radius_km       FLOAT               DEFAULT 50,
  filter_run_type public.run_type     DEFAULT NULL
)
RETURNS TABLE (
  profile_id              UUID,
  username                TEXT,
  full_name               TEXT,
  age                     INT,
  run_types               public.run_type[],
  avg_pace_seconds_per_km INT,
  badge_overlap_count     INT,
  distance_km             FLOAT
) LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'current_user_id must match the authenticated user';
  END IF;

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
      (SELECT location FROM public.profiles WHERE id = current_user_id)
    ) / 1000.0)::NUMERIC, 1)::FLOAT
  FROM public.profiles p
  JOIN public.running_preferences rp ON rp.profile_id = p.id
  LEFT JOIN public.profile_badges pb
    ON  pb.profile_id = p.id
    AND pb.badge_id IN (
      SELECT badge_id FROM public.profile_badges WHERE profile_id = current_user_id
    )
  WHERE p.id <> current_user_id
    AND p.is_active = true
    AND (filter_run_type IS NULL OR filter_run_type = ANY(rp.run_types))
    AND ST_DWithin(
      p.location,
      (SELECT location FROM public.profiles WHERE id = current_user_id),
      radius_km * 1000
    )
  GROUP BY p.id, p.username, p.full_name, p.date_of_birth, rp.run_types,
           rp.avg_pace_seconds_per_km, p.location
  ORDER BY badge_overlap_count DESC, distance_km ASC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Revoke EXECUTE on internal helpers from public/authenticated
-- (only callable within this file's SECURITY DEFINER context)
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._gs_check_consecutive_weeks  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._gs_check_running_streak      FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._gs_check_monthly_distance    FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._gs_check_multi_run_week      FROM PUBLIC, authenticated;

-- Grant EXECUTE on the public-facing functions to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_chat_request(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_chat_request(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_award_badges()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_gym_buddies(UUID, FLOAT, INT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_running_buddies(UUID, FLOAT, public.run_type) TO authenticated;
