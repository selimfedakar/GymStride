-- ============================================================
-- GymStride — 031: Multiple push tokens per user
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Previously push_tokens had profile_id as the PRIMARY KEY, so a user
-- with two devices kept overwriting a single row → only the last device
-- registered ever received notifications. Switch to a composite key on
-- (profile_id, token) so every device is kept and notified.
-- ============================================================

-- Drop the single-token primary key and key on the (profile, token) pair.
ALTER TABLE public.push_tokens DROP CONSTRAINT IF EXISTS push_tokens_pkey;

-- De-dupe any rows that would violate the new composite key before adding it.
DELETE FROM public.push_tokens a
USING public.push_tokens b
WHERE a.ctid < b.ctid
  AND a.profile_id = b.profile_id
  AND a.token      = b.token;

ALTER TABLE public.push_tokens ADD PRIMARY KEY (profile_id, token);

-- A given device token belongs to exactly one profile at a time; this lets
-- the client evict the token from a previous account on re-login.
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON public.push_tokens (token);
