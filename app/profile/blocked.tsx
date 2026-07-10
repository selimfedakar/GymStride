import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, Image, Pressable,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { Stack } from 'expo-router'
import { fetchBlockedProfiles, unblockUser, type BlockedProfile } from '@/lib/queries/blocks'
import { Colors } from '@/constants/colors'
import { captureError } from '@/lib/analytics'

export default function BlockedUsersScreen() {
  const [blocked, setBlocked] = useState<BlockedProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await fetchBlockedProfiles().catch((e) => {
      captureError(e, { where: 'blocked.load' })
      return [] as BlockedProfile[]
    })
    setBlocked(list)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function confirmUnblock(user: BlockedProfile) {
    Alert.alert(
      `Unblock ${user.full_name.split(' ')[0]}?`,
      'They will be able to find and message you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => doUnblock(user.id) },
      ]
    )
  }

  async function doUnblock(id: string) {
    setBusy(id)
    try {
      await unblockUser(id)
      setBlocked((prev) => prev.filter((u) => u.id !== id))
    } catch (e) {
      captureError(e, { where: 'blocked.unblock' })
      Alert.alert('Error', 'Could not unblock. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title:           'Blocked Users',
          headerShown:     true,
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle:{ fontWeight: '700' },
        }}
      />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : blocked.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>🛡️</Text>
            <Text style={styles.emptyTitle}>No blocked users</Text>
            <Text style={styles.emptyText}>People you block will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={(u) => u.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.row}>
                {item.profile_photo_url ? (
                  <Image source={{ uri: item.profile_photo_url }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.initial}>{item.full_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.body}>
                  <Text style={styles.name}>{item.full_name}</Text>
                  <Text style={styles.handle}>@{item.username}</Text>
                </View>
                <Pressable
                  style={[styles.unblockBtn, busy === item.id && styles.disabled]}
                  onPress={() => confirmUnblock(item)}
                  disabled={busy === item.id}
                >
                  {busy === item.id
                    ? <ActivityIndicator color={Colors.primary} size="small" />
                    : <Text style={styles.unblockText}>Unblock</Text>
                  }
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText:  { fontSize: 14, color: Colors.muted, textAlign: 'center' },
  list:       { padding: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center',
  },
  initial: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  body:    { flex: 1 },
  name:    { fontSize: 15, fontWeight: '600', color: Colors.text },
  handle:  { fontSize: 13, color: Colors.muted, marginTop: 2 },
  unblockBtn: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 84, alignItems: 'center',
  },
  unblockText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  disabled:    { opacity: 0.5 },
})
