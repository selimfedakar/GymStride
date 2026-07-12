-- ============================================================
-- GymStride — 032: Group events (create / join / group chat)
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Moves the app from 1:1 only to group workouts: "Saturday 09:00 long
-- run, 5 people". Events have their own participant list + group chat.
-- The 1:1 conversations schema is left untouched (event chat is its own
-- table so get_my_conversations stays simple).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  event_type       TEXT NOT NULL DEFAULT 'gym',  -- 'gym' | 'running' | 'other'
  location         GEOGRAPHY(POINT, 4326),
  location_name    TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,
  max_participants INT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_location  ON public.events USING GIST (location);

CREATE TABLE IF NOT EXISTS public.event_participants (
  event_id   UUID NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.event_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event ON public.event_messages (event_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_messages     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events: authenticated can read" ON public.events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "events: creator can insert" ON public.events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "events: creator can update" ON public.events
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "events: creator can delete" ON public.events
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "event_participants: authenticated can read" ON public.event_participants
  FOR SELECT TO authenticated USING (true);
-- join/leave go through SECURITY DEFINER RPCs (capacity enforced there),
-- but allow a direct self-delete as a safety valve.
CREATE POLICY "event_participants: self can leave" ON public.event_participants
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

CREATE POLICY "event_messages: participants can read" ON public.event_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.event_participants ep
            WHERE ep.event_id = event_messages.event_id AND ep.profile_id = auth.uid())
  );
CREATE POLICY "event_messages: participants can insert as self" ON public.event_messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM public.event_participants ep
                WHERE ep.event_id = event_messages.event_id AND ep.profile_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- create_event(): inserts + auto-joins the creator, returns event id.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_event(
  p_title            TEXT,
  p_event_type       TEXT,
  p_starts_at        TIMESTAMPTZ,
  p_location_name    TEXT DEFAULT NULL,
  p_lat              FLOAT DEFAULT NULL,
  p_lng              FLOAT DEFAULT NULL,
  p_max_participants INT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id  UUID;
  v_loc GEOGRAPHY;
BEGIN
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_loc := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  END IF;

  INSERT INTO public.events (creator_id, title, event_type, location, location_name, starts_at, max_participants, notes)
  VALUES (auth.uid(), p_title, p_event_type, v_loc, p_location_name, p_starts_at, p_max_participants, p_notes)
  RETURNING id INTO v_id;

  INSERT INTO public.event_participants (event_id, profile_id) VALUES (v_id, auth.uid());
  RETURN v_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- join_event(): capacity-checked join.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max   INT;
  v_count INT;
BEGIN
  SELECT max_participants INTO v_max FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.event_participants WHERE event_id = p_event_id;
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'event is full';
  END IF;

  INSERT INTO public.event_participants (event_id, profile_id)
  VALUES (p_event_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.event_participants
  WHERE event_id = p_event_id AND profile_id = auth.uid();
END;
$$;

-- ────────────────────────────────────────────────────────────
-- get_nearby_events(): upcoming events within radius, with participant
-- count + whether the caller has joined. Excludes blocked creators.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_nearby_events(
  p_radius_km FLOAT DEFAULT 50,
  p_type      TEXT  DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  title             TEXT,
  event_type        TEXT,
  location_name     TEXT,
  starts_at         TIMESTAMPTZ,
  max_participants  INT,
  notes             TEXT,
  creator_id        UUID,
  creator_name      TEXT,
  participant_count INT,
  joined            BOOLEAN,
  distance_km       FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_loc GEOGRAPHY;
BEGIN
  SELECT pr.location INTO v_loc FROM public.profiles pr WHERE pr.id = v_uid;

  RETURN QUERY
  SELECT
    e.id, e.title, e.event_type, e.location_name, e.starts_at, e.max_participants, e.notes,
    e.creator_id, cp.full_name,
    (SELECT COUNT(*)::INT FROM public.event_participants ep WHERE ep.event_id = e.id),
    EXISTS (SELECT 1 FROM public.event_participants ep WHERE ep.event_id = e.id AND ep.profile_id = v_uid),
    CASE WHEN v_loc IS NOT NULL AND e.location IS NOT NULL
         THEN ROUND((ST_Distance(e.location, v_loc) / 1000.0)::NUMERIC, 1)::FLOAT
         ELSE NULL::FLOAT END
  FROM public.events e
  JOIN public.profiles cp ON cp.id = e.creator_id
  WHERE e.starts_at > NOW()
    AND (p_type IS NULL OR e.event_type = p_type)
    AND (v_loc IS NULL OR e.location IS NULL OR ST_DWithin(e.location, v_loc, p_radius_km * 1000))
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = v_uid AND b.blocked_id = e.creator_id)
         OR (b.blocker_id = e.creator_id AND b.blocked_id = v_uid)
    )
  ORDER BY e.starts_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event(TEXT, TEXT, TIMESTAMPTZ, TEXT, FLOAT, FLOAT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_event(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_event(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_events(FLOAT, TEXT) TO authenticated;
