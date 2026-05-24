-- Replaces the N+1 fetchConversationsWithDetails client-side loop with a single RPC.
-- Returns all conversations for the calling user with other participant + last message
-- in one round-trip using a LATERAL join.

CREATE OR REPLACE FUNCTION get_my_conversations()
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
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION get_my_conversations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_my_conversations() TO authenticated;
