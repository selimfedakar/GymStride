-- ============================================================
-- GymStride — 025: Block user (Apple Guideline 1.2 — UGC safety)
-- Run in Supabase SQL Editor → New Query → Run.
--
-- A block hides the two users from each other in discovery, in the
-- conversation list, and cancels any pending requests between them.
-- Enforced server-side so a blocked user can never re-surface via a
-- crafted client request.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks: owner can read"   ON public.blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "blocks: owner can insert" ON public.blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks: owner can delete" ON public.blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ────────────────────────────────────────────────────────────
-- block_user(): records the block AND cancels pending requests
-- in both directions so nothing dangles.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_blocked_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot block yourself';
  END IF;

  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  DELETE FROM public.chat_requests
  WHERE status = 'pending'
    AND (
      (requester_id = auth.uid() AND target_id = p_blocked_id) OR
      (requester_id = p_blocked_id AND target_id = auth.uid())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.blocks
  WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$;

-- Returns the ids the caller has blocked (client uses this to hide rows
-- the discovery/conversation RPCs already exclude — belt and suspenders).
CREATE OR REPLACE FUNCTION public.get_my_blocked_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT blocked_id FROM public.blocks WHERE blocker_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_ids()    TO authenticated;

-- ────────────────────────────────────────────────────────────
-- get_my_conversations(): exclude conversations whose other member
-- is blocked in either direction.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id    UUID,
  last_message_at    TIMESTAMPTZ,
  other_profile_id   UUID,
  other_full_name    TEXT,
  other_username     TEXT,
  other_photo_url    TEXT,
  last_msg_content   TEXT,
  last_msg_at        TIMESTAMPTZ,
  last_msg_sender_id UUID,
  last_msg_read_at   TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    c.id                      AS conversation_id,
    c.last_message_at,
    other_p.id                AS other_profile_id,
    other_p.full_name         AS other_full_name,
    other_p.username          AS other_username,
    other_p.profile_photo_url AS other_photo_url,
    last_msg.content          AS last_msg_content,
    last_msg.created_at       AS last_msg_at,
    last_msg.sender_id        AS last_msg_sender_id,
    last_msg.read_at          AS last_msg_read_at
  FROM conversation_participants cp
  JOIN conversations c
    ON c.id = cp.conversation_id
  JOIN conversation_participants other_cp
    ON other_cp.conversation_id = cp.conversation_id
   AND other_cp.profile_id != auth.uid()
  JOIN profiles other_p
    ON other_p.id = other_cp.profile_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.sender_id, m.read_at
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  WHERE cp.profile_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid()   AND b.blocked_id = other_p.id)
         OR (b.blocker_id = other_p.id   AND b.blocked_id = auth.uid())
    )
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION get_my_conversations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_my_conversations() TO authenticated;

-- ────────────────────────────────────────────────────────────
-- Rewrite discovery RPCs with block exclusion (supersedes 011).
-- Bodies are identical to 011 plus a NOT EXISTS (blocks) filter.
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discover_gym_buddies(UUID, FLOAT, INT, INT, INT);
DROP FUNCTION IF EXISTS public.discover_running_buddies(UUID, FLOAT, public.run_type, INT, INT);

CREATE FUNCTION public.discover_gym_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT DEFAULT 50,
  p_min_frequency   INT   DEFAULT 1,
  p_limit           INT   DEFAULT 20,
  p_offset          INT   DEFAULT 0
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
  SELECT pr.location INTO v_loc FROM public.profiles pr WHERE pr.id = p_current_user_id;

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

GRANT EXECUTE ON FUNCTION public.discover_gym_buddies(UUID, FLOAT, INT, INT, INT) TO authenticated;

CREATE FUNCTION public.discover_running_buddies(
  p_current_user_id UUID,
  p_radius_km       FLOAT           DEFAULT 50,
  p_filter_run_type public.run_type DEFAULT NULL,
  p_limit           INT             DEFAULT 20,
  p_offset          INT             DEFAULT 0
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
  SELECT pr.location INTO v_loc FROM public.profiles pr WHERE pr.id = p_current_user_id;

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

GRANT EXECUTE ON FUNCTION public.discover_running_buddies(UUID, FLOAT, public.run_type, INT, INT) TO authenticated;
