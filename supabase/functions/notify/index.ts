// Supabase Edge Function — Push Notification Dispatcher
// Trigger via Supabase Dashboard → Database → Webhooks:
//   Table: chat_requests  Event: INSERT  → this URL
//   Table: messages       Event: INSERT  → this URL
//
// Environment variables required (set in Supabase Dashboard → Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { table, record } = payload as { table: string; record: Record<string, any> }

    if (table === 'chat_requests') {
      await handleChatRequest(record)
    } else if (table === 'messages') {
      await handleMessage(record)
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error('[notify]', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

async function handleChatRequest(record: Record<string, any>) {
  const targetId = record.target_id as string

  const tokens = await getTokens(targetId)
  if (tokens.length === 0) return

  const { data: requester } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', record.requester_id)
    .single()

  await Promise.all(tokens.map((token) => sendPush(token, {
    title: 'New Training Request 💪',
    body:  `${requester?.full_name ?? 'Someone'} wants to train with you`,
    data:  { type: 'chat_request', id: record.id },
  })))
}

async function handleMessage(record: Record<string, any>) {
  // Find the other participant in the conversation
  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', record.conversation_id)
    .neq('profile_id', record.sender_id)

  if (!participants?.length) return

  const { data: sender } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', record.sender_id)
    .single()

  for (const { profile_id } of participants) {
    const tokens = await getTokens(profile_id)
    for (const token of tokens) {
      await sendPush(token, {
        title: sender?.full_name ?? 'New Message',
        body:  record.content.length > 80 ? record.content.slice(0, 77) + '…' : record.content,
        data:  { type: 'message', conversationId: record.conversation_id },
      })
    }
  }
}

// Returns all device tokens for a profile (a user may have several devices).
async function getTokens(profileId: string): Promise<string[]> {
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('profile_id', profileId)
  return (data ?? []).map((r: { token: string }) => r.token)
}

async function sendPush(token: string, notification: {
  title: string
  body:  string
  data:  Record<string, any>
}) {
  const res = await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to:    token,
      sound: 'default',
      ...notification,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[notify] Expo push error:', text)
  }
}
