import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function AuthCallback() {
  const router = useRouter()
  const { code, access_token, refresh_token, type } = useLocalSearchParams<{
    code?:          string
    access_token?:  string
    refresh_token?: string
    type?:          string
  }>()

  useEffect(() => {
    async function handle() {
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      } catch {
        // session exchange failed — fall through to login
      }

      if (type === 'recovery') {
        router.replace('/(auth)/set-password')
      } else {
        router.replace('/')
      }
    }
    handle()
  }, [])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  )
}
