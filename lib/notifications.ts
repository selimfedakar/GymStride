import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

export async function registerPushToken(profileId: string): Promise<void> {
  if (!Device.isDevice) return  // push tokens don't work in simulators

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:             'default',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#FF6B35',
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    console.warn('[notifications] No EAS projectId in app.json — push tokens unavailable')
    return
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

  await supabase
    .from('push_tokens')
    .upsert(
      { profile_id: profileId, token, platform: Platform.OS },
      { onConflict: 'profile_id' }
    )
}

// Call on sign-out so stale tokens don't accumulate
export async function deregisterPushToken(profileId: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('profile_id', profileId)
}

// Returns a subscription handle; call .remove() on unmount
export function onNotificationTap(
  handler: (data: Record<string, any>) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, any>
    handler(data)
  })
}
