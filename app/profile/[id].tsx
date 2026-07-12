import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, Image, Pressable, Modal, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
  FlatList, Dimensions, StatusBar,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { fetchPublicProfile, reportUser } from '@/lib/queries/profile'
import { sendChatRequest, findConversationWithUser } from '@/lib/queries/messages'
import { blockUser } from '@/lib/queries/blocks'
import { track, captureError } from '@/lib/analytics'
import { useAuthStore } from '@/store/auth'
import { useProStore } from '@/store/pro'
import { BadgePill } from '@/components/BadgePill'
import { Colors } from '@/constants/colors'
import { calcAge, formatPace } from '@/types/database'
import type { PublicProfile } from '@/lib/queries/profile'
import type { ProfilePhoto, GymPreferences, RunningPreferences } from '@/types/database'

type ProfileData = {
  profile:      PublicProfile
  photos:       ProfilePhoto[]
  badges:       { name: string; category: 'gym' | 'running' | 'general'; icon_name: string | null }[]
  gymPrefs:     GymPreferences | null
  runningPrefs: RunningPreferences | null
}

function formatLastActive(iso: string): string {
  const diffHours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (diffHours < 1)  return 'Active now'
  if (diffHours < 24) return 'Active today'
  const days = Math.floor(diffHours / 24)
  if (days === 1) return 'Active yesterday'
  if (days < 7)   return `Active ${days} days ago`
  return 'Active a while ago'
}

export default function PublicProfileScreen() {
  const { id: profileId, distanceKm, badgeOverlap } = useLocalSearchParams<{
    id: string; distanceKm?: string; badgeOverlap?: string
  }>()
  const router           = useRouter()
  const myProfile        = useAuthStore((s) => s.profile)
  const sentRequestIds   = useAuthStore((s) => s.sentRequestIds)
  const addSentRequestId = useAuthStore((s) => s.addSentRequestId)
  const isPro            = useProStore((s) => s.isPro)

  const [data,           setData]           = useState<ProfileData | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [message,        setMessage]        = useState('')
  const [sending,        setSending]        = useState(false)
  const [viewerVisible,  setViewerVisible]  = useState(false)
  const [viewerIndex,    setViewerIndex]    = useState(0)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const viewerListRef = useRef<FlatList<ProfilePhoto>>(null)

  const alreadySent = !!profileId && sentRequestIds.includes(profileId)

  useEffect(() => {
    if (!profileId) return
    Promise.all([
      fetchPublicProfile(profileId).then(setData),
      findConversationWithUser(profileId).then((id) => { if (id) setConversationId(id) }),
    ]).catch(() => null).finally(() => setLoading(false))
  }, [profileId])

  useEffect(() => {
    if (!data) return
    track('profile_viewed', {
      distance_km:   distanceKm ? parseFloat(distanceKm) : undefined,
      badge_overlap: badgeOverlap ? parseInt(badgeOverlap, 10) : 0,
    })
  }, [data])

  async function handleOpenModal() {
    if (!myProfile) return
    // Pro + admins bypass the free-tier daily cap.
    if (!myProfile.is_admin && !isPro) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('chat_requests')
        .select('*', { count: 'exact', head: true })
        .eq('requester_id', myProfile.id)
        .gte('created_at', since)
      if ((count ?? 0) >= 5) {
        Alert.alert(
          'Daily Limit Reached',
          "You've used your 5 free requests for today. Upgrade to GymStride Pro for unlimited requests.",
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Go Pro', onPress: () => router.push('/paywall') },
          ]
        )
        return
      }
    }
    setShowModal(true)
  }

  async function handleSend() {
    if (!myProfile || !profileId || !message.trim()) return
    setSending(true)
    try {
      await sendChatRequest({
        requester_id:    myProfile.id,
        target_id:       profileId,
        opening_message: message.trim(),
      })
      addSentRequestId(profileId)
      track('chat_request_sent', { badgeOverlap: overlap })
      setShowModal(false)
      setMessage('')
    } catch (e: any) {
      if (e?.code === '23505') {
        addSentRequestId(profileId)
        setShowModal(false)
        setMessage('')
        Alert.alert(
          'Already Sent',
          "You've already sent a request to this person. Once they accept, you can view it in Messages."
        )
      } else {
        Alert.alert('Error', e.message)
      }
    } finally {
      setSending(false)
    }
  }

  function handleSafetyMenu() {
    if (!data) return
    const first = data.profile.full_name.split(' ')[0]
    Alert.alert(
      data.profile.full_name,
      'Choose an action',
      [
        { text: `Block ${first}`, style: 'destructive', onPress: confirmBlock },
        { text: 'Report profile', onPress: handleReport },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  function confirmBlock() {
    if (!data) return
    const first = data.profile.full_name.split(' ')[0]
    Alert.alert(
      `Block ${first}?`,
      `${first} won't be able to see your profile, find you in discovery, or message you — and you won't see them. Any pending request between you is cancelled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: doBlock },
      ]
    )
  }

  async function doBlock() {
    if (!profileId) return
    try {
      await blockUser(profileId)
      track('user_blocked')
      Alert.alert('Blocked', 'You will no longer see or hear from this person.')
      router.back()
    } catch (e) {
      captureError(e, { where: 'profile.block' })
      Alert.alert('Error', 'Could not block this user. Please try again.')
    }
  }

  function handleReport() {
    if (!data) return
    Alert.alert(
      `Report ${data.profile.full_name}`,
      'Why are you reporting this profile?',
      [
        { text: 'Spam',              onPress: () => submitReport('spam') },
        { text: 'Inappropriate',     onPress: () => submitReport('inappropriate') },
        { text: 'Fake profile',      onPress: () => submitReport('fake_profile') },
        { text: 'Harassment',        onPress: () => submitReport('harassment') },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  async function submitReport(reason: string) {
    if (!profileId) return
    try {
      await reportUser(profileId, reason)
      track('user_reported', { reason })
      Alert.alert('Reported', 'Thank you. We will review this profile.')
    } catch (e) {
      captureError(e, { where: 'profile.report' })
      Alert.alert('Error', 'Could not submit report. Please try again.')
    }
  }

  const headerOpts = {
    headerShown:      true,
    title:            data?.profile.full_name ?? '',
    headerStyle:      { backgroundColor: Colors.surface } as any,
    headerTintColor:  Colors.text,
    headerTitleStyle: { fontWeight: '700' } as any,
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={headerOpts} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </>
    )
  }

  if (!data) {
    return (
      <>
        <Stack.Screen options={headerOpts} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Profile not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </>
    )
  }

  const { profile, photos, badges, gymPrefs, runningPrefs } = data
  const age  = calcAge(profile.date_of_birth)
  const dist = distanceKm ? parseFloat(distanceKm).toFixed(1) : null
  const overlap = badgeOverlap ? parseInt(badgeOverlap, 10) : 0

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:      true,
          title:            profile.full_name,
          headerStyle:      { backgroundColor: Colors.surface },
          headerTintColor:  Colors.text,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {/* Avatar + identity */}
        <View style={styles.heroSection}>
          {profile.profile_photo_url ? (
            <Image source={{ uri: profile.profile_photo_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{profile.full_name.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <Text style={styles.name}>{profile.full_name}, {age}</Text>
          <Text style={styles.username}>@{profile.username}</Text>

          {profile.location_name && (
            <Text style={styles.location}>📍 {profile.location_name}</Text>
          )}

          <View style={styles.metaRow}>
            {profile.training_today?.slice(0, 10) === new Date().toISOString().slice(0, 10) && (
              <View style={[styles.metaChip, styles.overlapChip]}>
                <Text style={[styles.metaText, styles.overlapText]}>🔥 Training today</Text>
              </View>
            )}
            {myProfile?.experience_level === profile.experience_level && (
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>⚡ Same level</Text>
              </View>
            )}
            {dist && (
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>📏 {dist} km away</Text>
              </View>
            )}
            {overlap > 0 && (
              <View style={[styles.metaChip, styles.overlapChip]}>
                <Text style={[styles.metaText, styles.overlapText]}>⚡ {overlap} badge{overlap > 1 ? 's' : ''} in common</Text>
              </View>
            )}
            <View style={styles.metaChip}>
              <Text style={[styles.metaText, styles.activeText]}>{formatLastActive(profile.last_active_at)}</Text>
            </View>
          </View>
        </View>

        {/* Extra photos */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <View style={styles.photoGrid}>
              {photos.map((p, index) => (
                <Pressable
                  key={p.id}
                  style={styles.photoThumb}
                  onPress={() => {
                    setViewerIndex(index)
                    setViewerVisible(true)
                  }}
                >
                  <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Bio */}
        {profile.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Gym preferences */}
        {gymPrefs && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏋️ Gym</Text>
            <View style={styles.chipRow}>
              {gymPrefs.frequency_per_week != null && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{gymPrefs.frequency_per_week}x per week</Text>
                </View>
              )}
              <View style={styles.chip}>
                <Text style={styles.chipText}>{profile.experience_level}</Text>
              </View>
              {(gymPrefs.workout_styles ?? []).map((s) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Running preferences */}
        {runningPrefs && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏃 Running</Text>
            <View style={styles.chipRow}>
              {(runningPrefs.run_types ?? []).map((t) => (
                <View key={t} style={[styles.chip, styles.runChip]}>
                  <Text style={[styles.chipText, styles.runChipText]}>{t.replace('_', ' ')}</Text>
                </View>
              ))}
              {runningPrefs.avg_pace_seconds_per_km != null && (
                <View style={[styles.chip, styles.runChip]}>
                  <Text style={[styles.chipText, styles.runChipText]}>
                    {formatPace(runningPrefs.avg_pace_seconds_per_km)}
                  </Text>
                </View>
              )}
              {runningPrefs.preferred_time && (
                <View style={[styles.chip, styles.runChip]}>
                  <Text style={[styles.chipText, styles.runChipText]}>
                    🕐 {runningPrefs.preferred_time}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <View style={styles.badgeRow}>
              {badges.map((b) => (
                <BadgePill key={b.name} name={b.name} category={b.category} />
              ))}
            </View>
          </View>
        )}

        {/* CTA */}
        <View style={styles.ctaSection}>
          {conversationId ? (
            <Pressable
              style={styles.sendBtn}
              onPress={() => router.push(`/chat/${conversationId}` as any)}
            >
              <Text style={styles.sendBtnText}>See Conversation →</Text>
            </Pressable>
          ) : alreadySent ? (
            <>
              <View style={styles.sentBanner}>
                <Text style={styles.sentBannerText}>Request Sent ✓</Text>
              </View>
              <Pressable
                style={styles.seeConvoBtn}
                onPress={() => router.push('/(tabs)/messages' as any)}
              >
                <Text style={styles.seeConvoBtnText}>See Conversation →</Text>
              </Pressable>
              <Text style={styles.pendingNote}>
                Your request is pending. You'll be notified when {profile.full_name.split(' ')[0]} accepts.
              </Text>
            </>
          ) : (
            <Pressable style={styles.sendBtn} onPress={handleOpenModal}>
              <Text style={styles.sendBtnText}>Send Message Request 💬</Text>
            </Pressable>
          )}
        </View>

        {/* Safety: block or report */}
        <Pressable style={styles.reportLink} onPress={handleSafetyMenu}>
          <Text style={styles.reportLinkText}>Block or report this profile</Text>
        </Pressable>
      </ScrollView>

      {/* Photo viewer modal */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onShow={() => {
          viewerListRef.current?.scrollToIndex({ index: viewerIndex, animated: false })
        }}
      >
        <View style={styles.viewerBg}>
          <FlatList
            ref={viewerListRef}
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, i) => ({
              length: Dimensions.get('window').width,
              offset: Dimensions.get('window').width * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width)
              setViewerIndex(idx)
            }}
            renderItem={({ item }) => (
              <View style={styles.viewerSlide}>
                <Image
                  source={{ uri: item.url }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />
              </View>
            )}
          />
          {/* Dot indicators */}
          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === viewerIndex && styles.dotActive]} />
              ))}
            </View>
          )}
          {/* Close button */}
          <Pressable style={styles.viewerClose} onPress={() => setViewerVisible(false)}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Message modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <Pressable style={styles.backdrop} onPress={() => setShowModal(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            Message {profile.full_name.split(' ')[0]}
          </Text>
          <Text style={styles.sheetSub}>
            {overlap > 0
              ? `⚡ You share ${overlap} badge${overlap > 1 ? 's' : ''} in common`
              : 'Send a workout-focused opening message'}
          </Text>
          <TextInput
            style={styles.messageInput}
            placeholder={`Hey ${profile.full_name.split(' ')[0]}! I noticed we both...`}
            placeholderTextColor={Colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={280}
            autoFocus
          />
          <Text style={styles.charCount}>{message.length}/280</Text>
          <Pressable
            style={[styles.sendBtn, (sending || !message.trim()) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={sending || !message.trim()}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.sendBtnText}>Send Request</Text>
            }
          </Pressable>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center', gap: 16,
  },
  errorText: { color: Colors.error, fontSize: 16, fontWeight: '600' },
  backBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  backBtnText: { color: Colors.muted, fontWeight: '600' },
  scroll:     { flex: 1, backgroundColor: Colors.bg },
  container:  { paddingBottom: 48 },

  heroSection: {
    alignItems: 'center',
    paddingTop:  28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width:        100,
    height:       100,
    borderRadius: 50,
    marginBottom: 14,
  },
  avatarPlaceholder: {
    width:           100,
    height:          100,
    borderRadius:    50,
    backgroundColor: Colors.primary + '30',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    14,
  },
  avatarInitial: { fontSize: 40, fontWeight: '700', color: Colors.primary },
  name:     { fontSize: 24, fontWeight: '800', color: Colors.text },
  username: { fontSize: 14, color: Colors.muted, marginTop: 2, marginBottom: 6 },
  location: { fontSize: 14, color: Colors.muted, marginBottom: 12 },
  metaRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    justifyContent: 'center',
    gap:            8,
    marginTop:      4,
  },
  metaChip: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  overlapChip: {
    backgroundColor: Colors.primary + '15',
    borderColor:     Colors.primary + '40',
  },
  metaText:    { fontSize: 12, color: Colors.muted },
  overlapText: { color: Colors.primary, fontWeight: '600' },
  activeText:  { color: Colors.success },

  section: {
    paddingHorizontal: 24,
    paddingTop:        24,
    paddingBottom:     4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontSize:     15,
    fontWeight:   '700',
    color:        Colors.text,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    gap:            8,
    marginBottom:  16,
  },
  photoThumb: {
    flex:         1,
    aspectRatio:  1,
    borderRadius: 10,
  },
  bio: {
    fontSize:     15,
    color:        Colors.text,
    lineHeight:   22,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
    marginBottom:  16,
  },
  chip: {
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      10,
    paddingVertical:   7,
    paddingHorizontal: 12,
  },
  chipText:    { color: Colors.muted, fontSize: 13, textTransform: 'capitalize' },
  runChip:     { borderColor: Colors.running + '60', backgroundColor: Colors.running + '12' },
  runChipText: { color: Colors.running },
  badgeRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            6,
    marginBottom:  16,
  },

  ctaSection: {
    padding:   24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
  },
  sendBtnText: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  sentBanner: {
    backgroundColor: Colors.success + '15',
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.success + '40',
  },
  sentBannerText: { color: Colors.success, fontSize: 16, fontWeight: '700' },
  seeConvoBtn: {
    borderWidth:  1,
    borderColor:  Colors.primary,
    borderRadius: 14,
    padding:      14,
    alignItems:   'center',
    marginTop:    10,
  },
  seeConvoBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  pendingNote: {
    textAlign:         'center',
    color:             Colors.muted,
    fontSize:          13,
    marginTop:         8,
    paddingHorizontal: 8,
  },

  reportLink: {
    alignItems: 'center',
    padding:    24,
  },
  reportLinkText: { color: Colors.muted, fontSize: 13, textDecorationLine: 'underline' },

  viewerBg: {
    flex:            1,
    backgroundColor: '#000',
    justifyContent:  'center',
  },
  viewerSlide: {
    width:           Dimensions.get('window').width,
    flex:             1,
    justifyContent:  'center',
    alignItems:      'center',
  },
  viewerImage: {
    width:  Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  dots: {
    position:       'absolute',
    bottom:          48,
    left:            0,
    right:           0,
    flexDirection:  'row',
    justifyContent: 'center',
    gap:             8,
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width:           22,
    borderRadius:    4,
  },
  viewerClose: {
    position:        'absolute',
    top:              56,
    right:            20,
    width:            36,
    height:           36,
    borderRadius:     18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position:        'absolute',
    top:              80,
    left:             20,
    right:            20,
    backgroundColor: Colors.surface,
    borderRadius:    24,
    padding:         24,
    paddingBottom:   28,
    gap:              12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  sheetSub:   { fontSize: 14, color: Colors.muted, marginTop: -4 },
  messageInput: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius:    14,
    padding:         14,
    fontSize:        15,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
    minHeight:       100,
    textAlignVertical: 'top',
  },
  charCount: { color: Colors.muted, fontSize: 12, textAlign: 'right', marginTop: -4 },
})
