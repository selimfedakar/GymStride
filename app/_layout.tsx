import { useEffect, useRef } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/lib/queries/profile'
import { registerPushToken, deregisterPushToken, onNotificationTap } from '@/lib/notifications'
import { useAuthStore } from '@/store/auth'

const queryClient = new QueryClient()

// Prevents a hung network call from blocking the loading gate indefinitely (tunnel mode safe)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

function AuthGate() {
  const { session, profile, loading, setSession, setProfile, setLoading, reset } = useAuthStore()
  const router   = useRouter()
  const segments = useSegments()
  const notifSubRef = useRef<ReturnType<typeof onNotificationTap> | null>(null)

  useEffect(() => {
    // Hard fallback: if auth never resolves (e.g. tunnel latency / network hang), unblock after 8s
    const safetyTimer = setTimeout(() => setLoading(false), 8_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession)

        if (newSession) {
          const p = await withTimeout(fetchProfile(newSession.user.id), 5_000).catch(() => null)
          setProfile(p)

          if (p) {
            registerPushToken(p.id).catch(() => null)
            supabase.from('profiles')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', p.id)
              .then(() => null)
          }
        } else {
          const currentProfile = useAuthStore.getState().profile
          if (currentProfile) deregisterPushToken(currentProfile.id).catch(() => null)
          reset()
        }

        setLoading(false)
      }
    )

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) setLoading(false)
    })

    // Deep-link from notification tap
    notifSubRef.current = onNotificationTap((data) => {
      if (data.type === 'message' && data.conversationId) {
        router.push(`/chat/${data.conversationId}`)
      } else if (data.type === 'chat_request') {
        router.push('/(tabs)/messages')
      }
    })

    return () => {
      subscription.unsubscribe()
      notifSubRef.current?.remove()
      clearTimeout(safetyTimer)
    }
  }, [])

  useEffect(() => {
    if (loading) return

    const inAuth       = segments[0] === '(auth)' || segments[0] === 'auth'
    const inOnboarding = segments[0] === 'onboarding'
    const inApp        = segments[0] === '(tabs)' || segments[0] === 'chat' || segments[0] === 'profile'

    if (!session && !inAuth) {
      router.replace('/(auth)/login')
    } else if (session && (!profile || !profile.onboarding_completed) && !inOnboarding) {
      // No profile yet, or profile exists but onboarding wasn't completed (e.g. review account reset)
      router.replace('/onboarding/profile')
    } else if (session && profile?.onboarding_completed && !inApp) {
      // Covers root (/), auth screens, and onboarding → send to main app
      router.replace('/(tabs)/gym')
    }
  }, [session, profile, loading])

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }} />
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <KeyboardProvider>
          <AuthGate />
        </KeyboardProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
