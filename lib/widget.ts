// ============================================================
// GymStride — Home-screen widget bridge (iOS)
// ------------------------------------------------------------
// Writes the current streak into the shared app-group defaults that the
// WidgetKit target (targets/widget/index.swift) reads, then asks
// WidgetKit to reload. No-op off iOS or before the native module exists.
// ============================================================
import { Platform } from 'react-native'
import { ExtensionStorage } from '@bacons/apple-targets'

const APP_GROUP = 'group.com.selimfedakar.gymstride'

let storage: any = null
function getStorage(): any {
  if (Platform.OS !== 'ios') return null
  try {
    if (!storage) storage = new ExtensionStorage(APP_GROUP)
    return storage
  } catch {
    return null
  }
}

export function updateStreakWidget(current: number, longest: number): void {
  const s = getStorage()
  if (!s) return
  try {
    s.set('current_streak', current)
    s.set('longest_streak', longest)
    ExtensionStorage.reloadWidget?.()
  } catch {
    // widget updates are best-effort — never surface to the user
  }
}
