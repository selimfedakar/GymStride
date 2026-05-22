import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, SectionList, Pressable, Image,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  respondToChatRequest,
  fetchConversationsWithDetails,
  cancelChatRequest,
  type ConversationDetail,
} from '@/lib/queries/messages'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import type { ChatRequest } from '@/types/database'

interface ChatRequestWithProfile extends ChatRequest {
  requester_profile: {
    full_name:         string
    profile_photo_url: string | null
  } | null
}

interface SentPendingRequest {
  id:              string
  opening_message: string
  created_at:      string
  target_profile: Array<{
    id:                string
    full_name:         string
    profile_photo_url: string | null
  }> | null
}

type Section =
  | { title: 'Requests';      data: ChatRequestWithProfile[] }
  | { title: 'Pending';       data: SentPendingRequest[]     }
  | { title: 'Conversations'; data: ConversationDetail[]     }

export default function MessagesScreen() {
  const router  = useRouter()
  const profile = useAuthStore((s) => s.profile)

  const [requests,       setRequests]       = useState<ChatRequestWithProfile[]>([])
  const [sentPending,    setSentPending]    = useState<SentPendingRequest[]>([])
  const [conversations,  setConversations]  = useState<ConversationDetail[]>([])
  const [loading,        setLoading]        = useState(true)
  const [responding,     setResponding]     = useState<string | null>(null)
  const reviewRequestedRef = useRef(false)

  const load = useCallback(async () => {
    if (!profile) return
    const [reqRes, sentRes, convoRes] = await Promise.all([
      supabase
        .from('chat_requests')
        .select('*, requester_profile:profiles!requester_id(full_name, profile_photo_url)')
        .eq('target_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('chat_requests')
        .select('id, opening_message, created_at, target_profile:profiles!target_id(id, full_name, profile_photo_url)')
        .eq('requester_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      fetchConversationsWithDetails(profile.id).catch(() => [] as ConversationDetail[]),
    ])
    setRequests((reqRes.data ?? []) as ChatRequestWithProfile[])
    setSentPending((sentRes.data ?? []) as unknown as SentPendingRequest[])
    setConversations(convoRes)
    setLoading(false)
  }, [profile])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!profile?.id) return
    const pid = profile.id
    const channelName = `messages-tab-${pid}`

    // Pre-cleanup: remove any stale channel with this name before creating a fresh one.
    // supabase.channel() returns the existing instance if the name already exists,
    // so this safely evicts a previously subscribed-but-not-cleaned-up channel.
    supabase.removeChannel(supabase.channel(channelName))

    const channel = supabase.channel(channelName)

    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchConversationsWithDetails(pid).then(setConversations).catch(() => null),
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_requests', filter: `target_id=eq.${pid}` },
        () => supabase
          .from('chat_requests')
          .select('*, requester_profile:profiles!requester_id(full_name, profile_photo_url)')
          .eq('target_id', pid)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .then(({ data }) => setRequests((data ?? []) as ChatRequestWithProfile[])),
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `requester_id=eq.${pid}` },
        () => Promise.all([
          supabase
            .from('chat_requests')
            .select('id, opening_message, created_at, target_profile:profiles!target_id(id, full_name, profile_photo_url)')
            .eq('requester_id', pid)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .then(({ data }) => setSentPending((data ?? []) as unknown as SentPendingRequest[])),
          fetchConversationsWithDetails(pid).then(setConversations).catch(() => null),
        ]).catch(() => null),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  async function respond(requestId: string, accept: boolean) {
    setResponding(requestId)
    const newConvoId = await respondToChatRequest(requestId, accept).catch(() => null)
    setRequests((prev) => prev.filter((r) => r.id !== requestId))
    setResponding(null)
    if (accept && newConvoId) {
      router.push(`/chat/${newConvoId}`)
      if (!reviewRequestedRef.current) {
        reviewRequestedRef.current = true
        import('expo-store-review').then((m: any) => {
          m.isAvailableAsync?.().then((ok: boolean) => { if (ok) m.requestReview?.() })
        }).catch(() => null)
      }
    } else if (accept) {
      // Fallback: refresh conversation list if RPC didn't return ID
      const updated = await fetchConversationsWithDetails(profile!.id).catch(() => conversations)
      setConversations(updated)
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      await cancelChatRequest(requestId)
      setSentPending((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      Alert.alert('Error', 'Could not cancel request. Please try again.')
    }
  }

  const sections: Section[] = []
  if (requests.length > 0)      sections.push({ title: 'Requests',      data: requests })
  if (sentPending.length > 0)   sections.push({ title: 'Pending',       data: sentPending })
  if (conversations.length > 0) sections.push({ title: 'Conversations', data: conversations })

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      {sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Find gym or running buddies and send them a chat request
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections as any}
          keyExtractor={(item: any) => item.id ?? item.conversationId}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={Colors.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => {
            if (section.title === 'Requests') {
              const req = item as ChatRequestWithProfile
              return (
                <RequestCard
                  request={req}
                  responding={responding === req.id}
                  onAccept={() => respond(req.id, true)}
                  onDecline={() => respond(req.id, false)}
                />
              )
            }
            if (section.title === 'Pending') {
              const req = item as SentPendingRequest
              return (
                <SentPendingCard
                  request={req}
                  onPress={() => router.push({
                    pathname: `/chat/${req.id}` as any,
                    params: { pending: 'true', targetName: (Array.isArray(req.target_profile) ? req.target_profile[0] : req.target_profile)?.full_name ?? '' },
                  })}
                  onCancel={() => cancelRequest(req.id)}
                />
              )
            }
            const convo = item as ConversationDetail
            return (
              <ConvoRow
                convo={convo}
                myId={profile!.id}
                onPress={() => router.push(`/chat/${convo.conversationId}`)}
              />
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

// ─── Request card ────────────────────────────────────────────────────────────

function RequestCard({
  request, responding, onAccept, onDecline,
}: {
  request:    ChatRequestWithProfile
  responding: boolean
  onAccept:   () => void
  onDecline:  () => void
}) {
  const name    = request.requester_profile?.full_name ?? 'Someone'
  const photo   = request.requester_profile?.profile_photo_url
  const initial = name.charAt(0).toUpperCase()

  return (
    <View style={cardStyles.card}>
      {photo ? (
        <Image source={{ uri: photo }} style={cardStyles.avatarImg} />
      ) : (
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={cardStyles.body}>
        <Text style={cardStyles.from}>
          <Text style={cardStyles.fromName}>{name}</Text> wants to train with you
        </Text>
        <Text style={cardStyles.message} numberOfLines={3}>
          "{request.opening_message}"
        </Text>
        <View style={cardStyles.btnRow}>
          <Pressable
            style={[cardStyles.btn, cardStyles.declineBtn, responding && cardStyles.disabled]}
            onPress={onDecline}
            disabled={responding}
          >
            <Text style={cardStyles.declineText}>Decline</Text>
          </Pressable>
          <Pressable
            style={[cardStyles.btn, cardStyles.acceptBtn, responding && cardStyles.disabled]}
            onPress={onAccept}
            disabled={responding}
          >
            {responding
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={cardStyles.acceptText}>Accept & Chat</Text>
            }
          </Pressable>
        </View>
      </View>
    </View>
  )
}

// ─── Sent pending card ───────────────────────────────────────────────────────

function SentPendingCard({
  request, onPress, onCancel,
}: {
  request:  SentPendingRequest
  onPress:  () => void
  onCancel: () => void
}) {
  const tp      = Array.isArray(request.target_profile) ? request.target_profile[0] : request.target_profile
  const name    = tp?.full_name ?? 'Someone'
  const photo   = tp?.profile_photo_url
  const initial = name.charAt(0).toUpperCase()

  function renderRightActions() {
    return (
      <Pressable style={sentStyles.deleteAction} onPress={onCancel}>
        <Text style={sentStyles.deleteIcon}>🗑</Text>
        <Text style={sentStyles.deleteLabel}>Cancel</Text>
      </Pressable>
    )
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [sentStyles.card, pressed && sentStyles.pressed]}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={sentStyles.avatarImg} />
        ) : (
          <View style={sentStyles.avatar}>
            <Text style={sentStyles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={sentStyles.body}>
          <View style={sentStyles.topRow}>
            <Text style={sentStyles.name} numberOfLines={1}>{name}</Text>
            <View style={sentStyles.chip}>
              <Text style={sentStyles.chipText}>Pending</Text>
            </View>
          </View>
          <Text style={sentStyles.preview} numberOfLines={2}>
            "{request.opening_message}"
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  )
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConvoRow({ convo, myId, onPress }: { convo: ConversationDetail; myId: string; onPress: () => void }) {
  const name    = convo.otherProfile?.full_name ?? 'Unknown'
  const photo   = convo.otherProfile?.profile_photo_url
  const initial = name.charAt(0).toUpperCase()
  const preview = convo.lastMessage?.content ?? ''
  const isUnread = convo.lastMessage?.sender_id !== myId && !convo.lastMessage?.read_at
  const time    = convo.lastMessageAt
    ? new Date(convo.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [convoStyles.row, pressed && convoStyles.pressed]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={convoStyles.avatarImg} />
      ) : (
        <View style={convoStyles.avatar}>
          <Text style={convoStyles.initial}>{initial}</Text>
        </View>
      )}
      <View style={convoStyles.body}>
        <View style={convoStyles.topRow}>
          <Text style={[convoStyles.name, isUnread && convoStyles.bold]}>{name}</Text>
          <Text style={convoStyles.time}>{time}</Text>
        </View>
        <Text
          style={[convoStyles.preview, isUnread && convoStyles.previewUnread]}
          numberOfLines={1}
        >
          {preview}
        </Text>
      </View>
      {isUnread && <View style={convoStyles.dot} />}
    </Pressable>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title:         { fontSize: 24, fontWeight: '800', color: Colors.text },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyEmoji:    { fontSize: 48, marginBottom: 8 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText:     { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list:          { padding: 16, paddingBottom: 32 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
})

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImg:     { width: 48, height: 48, borderRadius: 24, flexShrink: 0 },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  body:          { flex: 1 },
  from:          { fontSize: 14, color: Colors.muted, marginBottom: 4 },
  fromName:      { color: Colors.text, fontWeight: '700' },
  message:       { fontSize: 15, color: Colors.text, lineHeight: 22, fontStyle: 'italic', marginBottom: 12 },
  btnRow:        { flexDirection: 'row', gap: 8 },
  btn:           { flex: 1, borderRadius: 10, padding: 11, alignItems: 'center' },
  declineBtn:    { borderWidth: 1, borderColor: Colors.border },
  acceptBtn:     { backgroundColor: Colors.primary },
  disabled:      { opacity: 0.5 },
  declineText:   { color: Colors.muted, fontWeight: '600', fontSize: 14 },
  acceptText:    { color: Colors.text, fontWeight: '700', fontSize: 14 },
})

const sentStyles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: Colors.surface,
    borderRadius:   14,
    padding:        14,
    marginBottom:   8,
    borderWidth:    1,
    borderColor:    Colors.border,
    gap:            12,
  },
  pressed:      { opacity: 0.7 },
  avatarImg:    { width: 46, height: 46, borderRadius: 23, flexShrink: 0 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, flexShrink: 0,
    backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  body:    { flex: 1 },
  topRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name:    { fontSize: 16, fontWeight: '600', color: Colors.text, flex: 1 },
  chip: {
    backgroundColor:  Colors.muted + '25',
    borderRadius:     6,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  chipText:  { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  preview:   { fontSize: 14, color: Colors.muted, fontStyle: 'italic' },
  deleteAction: {
    backgroundColor: Colors.error,
    borderRadius:    14,
    marginBottom:    8,
    marginLeft:      8,
    width:           72,
    alignItems:      'center',
    justifyContent:  'center',
    gap:              4,
  },
  deleteIcon:  { fontSize: 20 },
  deleteLabel: { fontSize: 11, color: '#fff', fontWeight: '700' },
})

const convoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  pressed: { opacity: 0.7 },
  avatarImg:      { width: 46, height: 46, borderRadius: 23 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center',
  },
  initial:        { fontSize: 20, fontWeight: '700', color: Colors.primary },
  body:           { flex: 1 },
  topRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  name:           { fontSize: 16, color: Colors.text, fontWeight: '500' },
  bold:           { fontWeight: '700' },
  time:           { fontSize: 12, color: Colors.muted },
  preview:        { fontSize: 14, color: Colors.muted },
  previewUnread:  { color: Colors.text, fontWeight: '500' },
  dot: {
    width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary,
  },
})
