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

    refresh()

    // Unique name per effect run — prevents "cannot add callbacks after subscribe()"
    // which happens when a same-named channel is reused before removeChannel finishes.
    const channel = supabase
      .channel(`unread-${profileId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_requests', filter: `target_id=eq.${profileId}` },
        refresh,
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        refresh,
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  return count
}
