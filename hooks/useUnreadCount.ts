import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

export function useUnreadCount(): number {
  const profile = useAuthStore((s) => s.profile)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!profile) return

    const profileId = profile.id
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const [reqResult, msgResult] = await Promise.all([
        supabase
          .from('chat_requests')
          .select('*', { count: 'exact', head: true })
          .eq('target_id', profileId)
          .eq('status', 'pending'),
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .neq('sender_id', profileId)
          .is('read_at', null),
      ])
      if (active) setCount((reqResult.count ?? 0) + (msgResult.count ?? 0))
    }

    async function setup() {
      await refresh()
      if (!active) return

      // Scope the messages subscription to the user's own conversations.
      // Without this filter EVERY message insert in the system woke every
      // client — a hard scaling wall. The `in` filter pushes that down to
      // the realtime server so we only receive relevant events.
      const { data: parts } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('profile_id', profileId)
      const convoIds = (parts ?? []).map((p) => p.conversation_id)

      // Unique name per effect run — prevents "cannot add callbacks after
      // subscribe()" when a same-named channel is reused before cleanup.
      const ch = supabase
        .channel(`unread-${profileId}-${Date.now()}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'chat_requests', filter: `target_id=eq.${profileId}` },
          refresh,
        )
      if (convoIds.length > 0) {
        ch.on('postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=in.(${convoIds.join(',')})` },
          refresh,
        )
      }
      ch.subscribe()
      if (active) channel = ch
      else supabase.removeChannel(ch)
    }

    setup()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [profile?.id])

  return count
}
