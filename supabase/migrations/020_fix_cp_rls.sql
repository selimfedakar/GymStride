-- Fix: infinite recursion in conversation_participants RLS policy (42P17)
--
-- Root cause: the SELECT policy used EXISTS(...FROM conversation_participants...)
-- inside the policy for conversation_participants itself — PostgreSQL detects
-- the self-reference and raises 42P17.
--
-- Fix: drop the recursive policy, create a SECURITY DEFINER helper that queries
-- the table without RLS applied (breaks the recursion), then write a
-- non-recursive policy that calls the helper.

-- 1. Drop the offending policy
DROP POLICY IF EXISTS "conversation_participants: co-members can read"
  ON public.conversation_participants;

-- 2. SECURITY DEFINER helper — runs as DB owner, bypasses RLS on the table
CREATE OR REPLACE FUNCTION public._gs_is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND profile_id = auth.uid()
  );
$$;

-- Only authenticated users may call it; public cannot
REVOKE EXECUTE ON FUNCTION public._gs_is_conversation_participant(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._gs_is_conversation_participant(UUID) TO authenticated;

-- 3. New non-recursive policy
CREATE POLICY "conversation_participants: members can read"
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (public._gs_is_conversation_participant(conversation_id));
