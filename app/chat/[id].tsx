import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, Pressable,
  StyleSheet, Keyboard, Platform, ActivityIndicator,
} from 'react-native'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import {
  fetchMessages,
  sendMessage,
  markMessagesRead,
  subscribeToMessages,
} from '@/lib/queries/messages'
import { useAuthStore } from '@/store/auth'
import { MessageBubble } from '@/components/MessageBubble'
import { Colors } from '@/constants/colors'
import { track, captureError } from '@/lib/analytics'
import type { Message } from '@/types/database'

// Appends a message only if its id isn't already present — guards against
// the double-render when a sent message arrives back over realtime too.
function appendUnique(prev: Message[], msg: Message): Message[] {
  return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
}

interface OtherProfile {
  id:       string
  full_name: string
}

export default function ChatScreen() {
  const { id: conversationId, pending, targetName } = useLocalSearchParams<{
    id: string; pending?: string; targetName?: string
  }>()
  const isPending = pending === 'true'
  const insets  = useSafeAreaInsets()
  const profile = useAuthStore((s) => s.profile)
  const myId    = profile?.id ?? ''

  const [text,          setText]          = useState('')
  const [messages,      setMessages]      = useState<Message[]>([])
  const [otherProfile,  setOtherProfile]  = useState<OtherProfile | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [sending,       setSending]       = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)

  const listRef          = useRef<FlatList<Message>>(null)
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll list up when keyboard opens so last message stays visible
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      listRef.current?.scrollToEnd({ animated: true })
    })
    return () => sub.remove()
  }, [])

  const loadOtherProfile = useCallback(async () => {
    const { data } = await supabase
      .from('conversation_participants')
      .select('profiles(id, full_name)')
      .eq('conversation_id', conversationId)
      .neq('profile_id', myId)
      .limit(1)
      .single()
    if (data) setOtherProfile((data as any).profiles)
  }, [conversationId, myId])

  useEffect(() => {
    if (!conversationId || !myId || isPending) return

    Promise.all([
      fetchMessages(conversationId).then(setMessages),
      loadOtherProfile(),
      markMessagesRead(conversationId),
    ]).finally(() => setLoading(false))

    const msgChannel = subscribeToMessages(conversationId, (msg) => {
      setMessages((prev) => appendUnique(prev, msg))
      if (msg.sender_id !== myId) {
        markMessagesRead(conversationId)
        setIsOtherTyping(false)
      }
    })

    const typingChannel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== myId) {
          setIsOtherTyping(true)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000)
        }
      })
      .subscribe()
    typingChannelRef.current = typingChannel

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(typingChannel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [conversationId, myId, isPending])

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

  function handleTextChange(t: string) {
    setText(t)
    if (t && typingChannelRef.current) {
      typingChannelRef.current.send({
        type:    'broadcast',
        event:   'typing',
        payload: { userId: myId },
      })
    }
  }

  async function handleSend() {
    const content = text.trim()
    if (!content || !myId || sending) return
    // Optimistically clear the field, but keep the text so we can restore
    // it if the send fails — otherwise a network error silently eats it.
    setText('')
    setSending(true)
    try {
      const msg = await sendMessage({ conversation_id: conversationId, sender_id: myId, content })
      setMessages((prev) => appendUnique(prev, msg))
      track('message_sent')
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    } catch (e) {
      captureError(e, { where: 'chat.send' })
      setText(content)   // restore the unsent text
    } finally {
      setSending(false)
    }
  }

  function showTimeFor(index: number): boolean {
    if (index === messages.length - 1) return true
    return messages[index].sender_id !== messages[index + 1].sender_id
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown:       true,
            title:             targetName ?? '...',
            headerStyle:       { backgroundColor: Colors.surface },
            headerTintColor:   Colors.text,
            headerTitleStyle:  { fontWeight: '700' },
            headerBackVisible: true,
          }}
        />
        <View style={styles.container}>
          <View style={styles.pendingCenter}>
            <Text style={styles.pendingEmoji}>⏳</Text>
            <Text style={styles.pendingTitle}>Request Pending</Text>
            <Text style={styles.pendingBody}>
              Your request has been sent.{'\n'}This conversation will become active once{' '}
              <Text style={{ fontWeight: '700', color: Colors.text }}>
                {targetName ?? 'they'}
              </Text>{' '}accepts.
            </Text>
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:       true,
          title:             otherProfile?.full_name ?? '...',
          headerStyle:       { backgroundColor: Colors.surface },
          headerTintColor:   Colors.text,
          headerTitleStyle:  { fontWeight: '700' },
          headerBackVisible: true,
        }}
      />

      <View style={styles.container}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 88 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item, index }) => (
              <MessageBubble
                message={item}
                isMine={item.sender_id === myId}
                showTime={showTimeFor(index)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyCentered}>
                <Text style={styles.emptyText}>Say hello 👋</Text>
              </View>
            }
          />
        )}

        {/*
          KeyboardStickyView: native-tracked, sticks composer to top of keyboard.
          offset closed=0 → sits at screen bottom when keyboard is hidden.
          offset opened=0 → sits directly on keyboard top when keyboard is visible.
          Composer is ALWAYS mounted — never conditionally rendered.
        */}
        <KeyboardStickyView offset={{ opened: 0, closed: 0 }}>
          <View style={[styles.composer, { paddingBottom: insets.bottom }]}>
            {isOtherTyping && otherProfile && (
              <View style={styles.typingBar}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
                <Text style={styles.typingText}>
                  {otherProfile.full_name.split(' ')[0]} is typing...
                </Text>
              </View>
            )}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor={Colors.muted}
                value={text}
                onChangeText={handleTextChange}
                multiline
                maxLength={1000}
                returnKeyType="default"
              />
              <Pressable
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!text.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.sendIcon}>↑</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardStickyView>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:      { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop:        12,
    flexGrow:          1,
  },
  emptyCentered: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    paddingTop:     80,
  },
  emptyText: { color: Colors.muted, fontSize: 15 },
  composer: {
    backgroundColor: Colors.surface,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
  },
  typingBar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                8,
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  typingDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.muted,
  },
  dot1: { opacity: 1 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 0.4 },
  typingText: { color: Colors.muted, fontSize: 12, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:            8,
    padding:        12,
  },
  input: {
    flex:              1,
    backgroundColor:   Colors.surfaceHigh,
    borderRadius:      22,
    paddingHorizontal: 16,
    paddingVertical:   10,
    fontSize:          15,
    color:             Colors.text,
    maxHeight:         120,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  sendBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
  pendingCenter: {
    flex:              1,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 36,
    gap:               12,
  },
  pendingEmoji: { fontSize: 48, marginBottom: 4 },
  pendingTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  pendingBody:  { fontSize: 15, color: Colors.muted, textAlign: 'center', lineHeight: 24 },
})
