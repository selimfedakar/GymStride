import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, Pressable, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import {
  fetchEventById, fetchEventParticipants, fetchEventMessages,
  sendEventMessage, subscribeToEventMessages, joinEvent, leaveEvent,
  type EventDetail, type EventParticipant, type EventMessage,
} from '@/lib/queries/events'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import { track, captureError } from '@/lib/analytics'

const TYPE_EMOJI: Record<string, string> = { gym: '🏋️', running: '🏃', other: '📍' }

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function EventScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const profile = useAuthStore((s) => s.profile)
  const myId    = profile?.id ?? ''

  const [event,        setEvent]        = useState<EventDetail | null>(null)
  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [messages,     setMessages]     = useState<EventMessage[]>([])
  const [text,         setText]         = useState('')
  const [loading,      setLoading]      = useState(true)
  const [sending,      setSending]      = useState(false)
  const [busy,         setBusy]         = useState(false)
  const listRef = useRef<FlatList<EventMessage>>(null)

  const joined = participants.some((p) => p.profile_id === myId)

  const loadAll = useCallback(async () => {
    if (!eventId) return
    const [ev, parts] = await Promise.all([
      fetchEventById(eventId).catch((e) => { captureError(e, { where: 'event.fetch' }); return null }),
      fetchEventParticipants(eventId).catch((e) => { captureError(e, { where: 'event.participants' }); return [] as EventParticipant[] }),
    ])
    setEvent(ev)
    setParticipants(parts)
    // Messages only readable to participants — guard the query
    if (parts.some((p) => p.profile_id === myId)) {
      const msgs = await fetchEventMessages(eventId).catch(() => [] as EventMessage[])
      setMessages(msgs)
    } else {
      setMessages([])
    }
    setLoading(false)
  }, [eventId, myId])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!eventId || !joined) return
    const ch = subscribeToEventMessages(eventId, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
    })
    return () => { ch.unsubscribe() }
  }, [eventId, joined])

  async function toggleJoin() {
    setBusy(true)
    try {
      if (joined) {
        await leaveEvent(eventId)
      } else {
        await joinEvent(eventId)
        track('event_joined', { type: event?.event_type })
      }
      await loadAll()
    } catch (e: any) {
      Alert.alert('Event', e?.message === 'event is full' ? 'This event is full.' : 'Could not update. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSend() {
    const content = text.trim()
    if (!content || !myId || sending) return
    setText('')
    setSending(true)
    try {
      const msg = await sendEventMessage(eventId, myId, content)
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]))
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    } catch (e) {
      captureError(e, { where: 'event.send' })
      setText(content)
    } finally {
      setSending(false)
    }
  }

  const headerOpts = {
    headerShown:      true,
    title:            event?.title ?? 'Event',
    headerStyle:      { backgroundColor: Colors.surface } as any,
    headerTintColor:  Colors.text,
    headerTitleStyle: { fontWeight: '700' } as any,
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={headerOpts} />
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>
      </>
    )
  }

  if (!event) {
    return (
      <>
        <Stack.Screen options={headerOpts} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Event not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backText}>Go back</Text></Pressable>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={headerOpts} />
      <View style={styles.container}>
        {/* Event header */}
        <View style={styles.info}>
          <Text style={styles.infoTitle}>{TYPE_EMOJI[event.event_type] ?? '📍'} {event.title}</Text>
          <Text style={styles.infoWhen}>{formatWhen(event.starts_at)}</Text>
          {event.location_name && <Text style={styles.infoMeta}>📍 {event.location_name}</Text>}
          <Text style={styles.infoMeta}>Hosted by {event.creator_name}</Text>
          {event.notes ? <Text style={styles.infoNotes}>{event.notes}</Text> : null}

          <View style={styles.avatars}>
            {participants.slice(0, 8).map((p) => (
              p.profile_photo_url
                ? <Image key={p.profile_id} source={{ uri: p.profile_photo_url }} style={styles.avatarImg} />
                : (
                  <View key={p.profile_id} style={styles.avatar}>
                    <Text style={styles.avatarInitial}>{p.full_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )
            ))}
            <Text style={styles.countText}>
              {participants.length}{event.max_participants ? `/${event.max_participants}` : ''} going
            </Text>
          </View>

          <Pressable
            style={[styles.joinBtn, joined && styles.leaveBtn, busy && styles.disabled]}
            onPress={toggleJoin}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={joined ? Colors.error : '#fff'} />
              : <Text style={[styles.joinText, joined && styles.leaveText]}>{joined ? 'Leave event' : 'Join event'}</Text>
            }
          </Pressable>
        </View>

        {/* Group chat */}
        {joined ? (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              style={styles.chat}
              contentContainerStyle={{ padding: 16, paddingBottom: 88 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => {
                const mine = item.sender_id === myId
                const sender = participants.find((p) => p.profile_id === item.sender_id)
                return (
                  <View style={[styles.msgRow, mine && styles.msgRowMine]}>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                      {!mine && <Text style={styles.msgSender}>{sender?.full_name?.split(' ')[0] ?? '...'}</Text>}
                      <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content}</Text>
                    </View>
                  </View>
                )
              }}
              ListEmptyComponent={<Text style={styles.chatEmpty}>Say hi to the group 👋</Text>}
            />
            <KeyboardStickyView offset={{ opened: 0, closed: 0 }}>
              <View style={[styles.composer, { paddingBottom: insets.bottom }]}>
                <TextInput
                  style={styles.composerInput}
                  placeholder="Message the group..."
                  placeholderTextColor={Colors.muted}
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={1000}
                />
                <Pressable
                  style={[styles.sendBtn, (!text.trim() || sending) && styles.disabled]}
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                >
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendIcon}>↑</Text>}
                </Pressable>
              </View>
            </KeyboardStickyView>
          </>
        ) : (
          <View style={styles.joinPrompt}>
            <Text style={styles.joinPromptText}>Join this event to see and join the group chat.</Text>
          </View>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered:  { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', gap: 14 },
  errorText: { color: Colors.error, fontSize: 16, fontWeight: '600' },
  backBtn:   { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  backText:  { color: Colors.muted, fontWeight: '600' },
  info: {
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6,
  },
  infoTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  infoWhen:  { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  infoMeta:  { fontSize: 13, color: Colors.muted },
  infoNotes: { fontSize: 14, color: Colors.text, lineHeight: 20, marginTop: 6 },
  avatars:   { flexDirection: 'row', alignItems: 'center', gap: -6, marginTop: 10 },
  avatarImg: { width: 30, height: 30, borderRadius: 15, marginRight: -6, borderWidth: 2, borderColor: Colors.bg },
  avatar: {
    width: 30, height: 30, borderRadius: 15, marginRight: -6,
    backgroundColor: Colors.primary + '30', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.bg,
  },
  avatarInitial: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  countText:     { fontSize: 13, color: Colors.muted, marginLeft: 14 },
  joinBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  leaveBtn:  { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.error },
  joinText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  leaveText: { color: Colors.error },
  disabled:  { opacity: 0.5 },
  chat:      { flex: 1 },
  chatEmpty: { color: Colors.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  msgRow:     { marginBottom: 8, alignItems: 'flex-start' },
  msgRowMine: { alignItems: 'flex-end' },
  bubble:     { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine:  { backgroundColor: Colors.primary },
  bubbleOther: { backgroundColor: Colors.surfaceHigh },
  msgSender:   { fontSize: 11, color: Colors.primary, fontWeight: '700', marginBottom: 2 },
  msgText:     { fontSize: 15, color: Colors.text },
  msgTextMine: { color: '#fff' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  composerInput: {
    flex: 1, backgroundColor: Colors.surfaceHigh, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.text,
    maxHeight: 120, borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
  joinPrompt:     { padding: 32, alignItems: 'center' },
  joinPromptText: { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
