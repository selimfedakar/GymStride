import { View, ActivityIndicator } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'

export default function Index() {
  const loading = useAuthStore((s) => s.loading)
  const session = useAuthStore((s) => s.session)

  // While session is being restored OR a session exists (let _layout.tsx navigate),
  // show a spinner instead of flashing the login screen.
  if (loading || session) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return <Redirect href="/(auth)/login" />
}
