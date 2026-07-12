import { useEffect, useRef } from 'react'
import { Stack, useRouter, useSegments, usePathname, useGlobalSearchParams } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { PostHogProvider } from 'posthog-react-native'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/lib/queries/profile'
import { registerPushToken, deregisterPushToken, onNotificationTap } from '@/lib/notifications'
import { useAuthStore } from '@/store/auth'
import {
  initMonitoring, wrapRoot, identify, resetUser, track, captureError, posthogClient,
} from '@/lib/analytics'
import { configurePurchases } from '@/lib/purchases'
import { useProStore } from '@/store/pro'

// Initialise crash reporting + analytics before anything else renders.
initMonitoring()

const queryClient = new QueryClient()

// Tracks screen changes for PostHog screen analytics with Expo Router.
function ScreenTracker() {
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const previousPathname = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthogClient.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...params,
      })
      previousPathname.current = pathname
    }
  }, [pathname, params])

  return null
}

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
          const p = await withTimeout(fetchProfile(newSession.user.id), 5_000)
            .catch((e) => { captureError(e, { where: 'fetchProfile', event }); return null })
          setProfile(p)

          if (p) {
            identify(p.id, { username: p.username, onboarded: p.onboarding_completed })
            track('app_opened')
            // Configure IAP for this user and refresh Pro entitlement
            configurePurchases(p.id)
            useProStore.getState().refresh().catch((e) => captureError(e, { where: 'pro.refresh' }))
            registerPushToken(p.id).catch((e) => captureError(e, { where: 'registerPushToken' }))
            supabase.from('profiles')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', p.id)
              .then(({ error }) => { if (error) captureError(error, { where: 'last_active_at' }) })
          }
        } else {
          const currentProfile = useAuthStore.getState().profile
          if (currentProfile) deregisterPushToken(currentProfile.id).catch((e) => captureError(e, { where: 'deregisterPushToken' }))
          resetUser()
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

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PostHogProvider
        client={posthogClient}
        autocapture={{
          captureScreens: false,
          captureTouches: true,
          propsToCapture: ['testID'],
        }}
      >
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ScreenTracker />
            <AuthGate />
          </KeyboardProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  )
}

export default wrapRoot(RootLayout)
