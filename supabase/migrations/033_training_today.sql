-- ============================================================
-- GymStride — 033: "Training today" status + matching signals
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Adds a lightweight availability signal: a user can flag that they're
-- training today, which surfaces on their profile ("🔥 Training today")
-- and can drive better matching. Stored as a DATE so it auto-expires at
-- midnight — no cron needed; a stale yesterday value simply isn't "today".
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS training_today DATE;

CREATE OR REPLACE FUNCTION public.set_training_today(p_on BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET training_today = CASE WHEN p_on THEN CURRENT_DATE ELSE NULL END
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_training_today(BOOLEAN) TO authenticated;
