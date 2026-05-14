import { supabase } from '../supabase'
import type { ChatRequest, ChatRequestInsert, Message, MessageInsert, Conversation } from '@/types/database'

export async function cancelChatRequest(requestId: string): Promise<void> {
  const { error } = await supabase.from('chat_requests').delete().eq('id', requestId)
  if (error) throw error
}

export async function sendChatRequest(req: ChatRequestInsert): Promise<ChatRequest> {
  const { data, error } = await supabase
    .from('chat_requests')
    .insert(req)
    .select()
    .single()
  if (error) throw error
  return data
}

// Returns the new conversation_id on accept, null on decline.
// Delegates to SECURITY DEFINER RPCs — direct table writes on
// conversations/conversation_participants are blocked by RLS.
export async function respondToChatRequest(
  requestId: string,
  accept: boolean
): Promise<string | null> {
  if (accept) {
    const { data, error } = await supabase
      .rpc('accept_chat_request', { p_request_id: requestId })
    if (error) throw error
    return data as string   // new conversation_id
  } else {
    const { error } = await supabase
      .rpc('decline_chat_request', { p_request_id: requestId })
    if (error) throw error
    return null
  }
}

export async function sendMessage(msg: MessageInsert): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert(msg)
    .select()
    .single()
  if (error) throw error
  return data
}

export interface ConversationDetail {
  conversationId:  string
  lastMessageAt:   string
  otherProfile: {
    id:                string
    full_name:         string
    username:          string
    profile_photo_url: string | null
  } | null
  lastMessage: {
    content:    string
    created_at: string
    sender_id:  string
    read_at:    string | null
  } | null
}

export async function fetchConversationsWithDetails(_profileId: string): Promise<ConversationDetail[]> {
  const { data, error } = await supabase.rpc('get_my_conversations')
  if (error) throw error

  return ((data ?? []) as any[]).map((row) => ({
    conversationId: row.conversation_id,
    lastMessageAt:  row.last_message_at,
    otherProfile: row.other_profile_id ? {
      id:                row.other_profile_id,
      full_name:         row.other_full_name,
      username:          row.other_username,
      profile_photo_url: row.other_photo_url,
    } : null,
    lastMessage: row.last_msg_content != null ? {
      content:    row.last_msg_content,
      created_at: row.last_msg_at,
      sender_id:  row.last_msg_sender_id,
      read_at:    row.last_msg_read_at,
    } : null,
  })) satisfies ConversationDetail[]
}

export async function findConversationWithUser(targetProfileId: string): Promise<string | null> {
  const { data } = await supabase.rpc('get_my_conversations')
  if (!data) return null
  const row = (data as any[]).find((r) => r.other_profile_id === targetProfileId)
  return row?.conversation_id ?? null
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Delegates to SECURITY DEFINER RPC — direct UPDATE on messages is blocked by RLS.
export async function markMessagesRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .rpc('mark_messages_read', { p_conversation_id: conversationId })
  if (error) throw error
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (msg: Message) => void
) {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe()
}
