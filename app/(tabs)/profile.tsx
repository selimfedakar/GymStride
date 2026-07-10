import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, Pressable, Image,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { fetchProfileBadges } from '@/lib/queries/badges'
import { fetchProfile, fetchProfilePhotos, setTrainingToday } from '@/lib/queries/profile'
import { fetchMyStreak, fetchMyProgress } from '@/lib/queries/workouts'
import { deregisterPushToken } from '@/lib/notifications'
import { useAuthStore } from '@/store/auth'
import { useProStore } from '@/store/pro'
import { BadgePill } from '@/components/BadgePill'
import { ProfilePhotos } from '@/components/ProfilePhotos'
import { ActivityStrip } from '@/components/ActivityStrip'
import { ProgressChart } from '@/components/ProgressChart'
import { Colors } from '@/constants/colors'
import { captureError } from '@/lib/analytics'
import { calcAge } from '@/types/database'
import type { ProfileBadge, Badge, ProfilePhoto } from '@/types/database'
import type { StreakSummary, ProgressSummary } from '@/lib/queries/workouts'

export default function ProfileScreen() {
  const router = useRouter()
  const { profile, setProfile, reset } = useAuthStore()
  const isPro = useProStore((s) => s.isPro)

  const [badges,  setBadges]  = useState<(ProfileBadge & { badge: Badge })[]>([])
  const [photos,  setPhotos]  = useState<ProfilePhoto[]>([])
  const [streak,   setStreak]   = useState<StreakSummary | null>(null)
  const [progress, setProgress] = useState<ProgressSummary | null>(null)
  const [loading,  setLoading]  = useState(true)

  const loadData = useCallback(async () => {
    if (!profile) return
    const [fresh, b, p, s, pr] = await Promise.all([
      fetchProfile(profile.id).catch((e) => { captureError(e, { where: 'profile.fetchProfile' }); return null }),
      fetchProfileBadges(profile.id).catch((e) => { captureError(e, { where: 'profile.fetchBadges' }); return [] }),
      fetchProfilePhotos(profile.id).catch((e) => { captureError(e, { where: 'profile.fetchPhotos' }); return [] }),
      fetchMyStreak().catch((e) => { captureError(e, { where: 'profile.fetchStreak' }); return null }),
      fetchMyProgress().catch((e) => { captureError(e, { where: 'profile.fetchProgress' }); return null }),
    ])
    if (fresh) setProfile(fresh)
    setBadges(b)
    setPhotos(p)
    setStreak(s)
    setProgress(pr)
    setLoading(false)
  }, [profile?.id])

  useFocusEffect(useCallback(() => {
    setLoading(true)
    loadData()
  }, [loadData]))

  const todayISO = new Date().toISOString().slice(0, 10)
  const trainingToday = profile?.training_today?.slice(0, 10) === todayISO

  async function toggleTrainingToday() {
    if (!profile) return
    const next = !trainingToday
    // Optimistic update
    setProfile({ ...profile, training_today: next ? todayISO : null })
    try {
      await setTrainingToday(next)
    } catch (e) {
      captureError(e, { where: 'profile.trainingToday' })
      setProfile({ ...profile, training_today: trainingToday ? todayISO : null })
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          if (profile) await deregisterPushToken(profile.id).catch(() => null)
          await supabase.auth.signOut()
          reset()
        },
      },
    ])
  }

  if (!profile || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  const age       = calcAge(profile.date_of_birth)
  const gymBadges = badges.filter((b) => b.badge.category === 'gym')
  const runBadges = badges.filter((b) => b.badge.category === 'running')
  const earned    = badges.filter((b) => b.is_earned)

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profile</Text>
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push('/profile/edit')}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        {/* Avatar + meta */}
        <View style={styles.avatarRow}>
          {(photos.find((p) => p.position === 0)?.url ?? profile.profile_photo_url) ? (
            <Image
              source={{ uri: photos.find((p) => p.position === 0)?.url ?? profile.profile_photo_url! }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {profile.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.name}>{profile.full_name}</Text>
            <Text style={styles.handle}>@{profile.username}</Text>
            <Text style={styles.metaLine}>
              {age} · {profile.experience_level} · {profile.location_name ?? 'no location'}
            </Text>
          </View>
        </View>

        {/* Pro upsell / status */}
        {isPro ? (
          <View style={styles.proCard}>
            <Text style={styles.proBadge}>✦ PRO</Text>
            <Text style={styles.proText}>You're a GymStride Pro member</Text>
          </View>
        ) : (
          <Pressable style={styles.proUpsell} onPress={() => router.push('/paywall')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.proUpsellTitle}>Upgrade to Pro ✦</Text>
              <Text style={styles.proUpsellSub}>Unlimited requests, advanced filters & more</Text>
            </View>
            <Text style={styles.proChevron}>›</Text>
          </Pressable>
        )}

        {/* Training-today availability */}
        <Pressable
          style={[styles.trainingRow, trainingToday && styles.trainingRowActive]}
          onPress={toggleTrainingToday}
        >
          <Text style={[styles.trainingText, trainingToday && styles.trainingTextActive]}>
            {trainingToday ? '🔥 Training today' : '💤 Not training today'}
          </Text>
          <Text style={[styles.trainingToggle, trainingToday && styles.trainingTextActive]}>
            {trainingToday ? 'On' : 'Tap to set'}
          </Text>
        </Pressable>

        {/* Weekly activity + streak */}
        {streak && <ActivityStrip streak={streak} />}

        {/* Progress charts */}
        {progress && <ProgressChart progress={progress} />}

        {/* Extra photos grid */}
        <ProfilePhotos
          profileId={profile.id}
          photos={photos}
          editable={false}
        />

        {profile.bio ? (
          <Text style={styles.bio}>{profile.bio}</Text>
        ) : (
          <Pressable onPress={() => router.push('/profile/edit')}>
            <Text style={styles.bioPlaceholder}>+ Add a bio</Text>
          </Pressable>
        )}

        {/* Earned badges */}
        {earned.length > 0 && (
          <Section title="🏆 Earned Badges">
            <View style={styles.pillWrap}>
              {earned.map((b) => (
                <BadgePill key={b.id} name={b.badge.name} category={b.badge.category} />
              ))}
            </View>
          </Section>
        )}

        {/* Self-selected badges */}
        <View style={styles.badgeHeader}>
          <Text style={styles.sectionTitle}>My Badges</Text>
          <Pressable onPress={() => router.push('/profile/edit-badges')}>
            <Text style={styles.manageBadgesLink}>Manage →</Text>
          </Pressable>
        </View>

        {gymBadges.length === 0 && runBadges.length === 0 ? (
          <Pressable
            style={styles.addBadgesCard}
            onPress={() => router.push('/profile/edit-badges')}
          >
            <Text style={styles.addBadgesText}>+ Add badges to improve discovery</Text>
          </Pressable>
        ) : (
          <>
            {gymBadges.length > 0 && (
              <View style={styles.badgeGroup}>
                <Text style={styles.badgeGroupLabel}>🏋️ Gym</Text>
                <View style={styles.pillWrap}>
                  {gymBadges.map((b) => (
                    <BadgePill key={b.id} name={b.badge.name} category="gym" />
                  ))}
                </View>
              </View>
            )}
            {runBadges.length > 0 && (
              <View style={styles.badgeGroup}>
                <Text style={styles.badgeGroupLabel}>🏃 Running</Text>
                <View style={styles.pillWrap}>
                  {runBadges.map((b) => (
                    <BadgePill key={b.id} name={b.badge.name} category="running" />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll:    { padding: 24, paddingBottom: 48 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  headerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   20,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  editBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    paddingVertical:   8,
    paddingHorizontal: 16,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  editBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  avatarRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            16,
    marginBottom:  16,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: Colors.primary + '30',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  meta:          { flex: 1 },
  name:          { fontSize: 20, fontWeight: '800', color: Colors.text },
  handle:        { fontSize: 14, color: Colors.muted, marginTop: 2 },
  metaLine:      { fontSize: 13, color: Colors.muted, marginTop: 4, textTransform: 'capitalize' },
  bio: {
    fontSize:     15,
    color:        Colors.text,
    lineHeight:   22,
    marginBottom: 20,
    paddingTop:   16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bioPlaceholder: {
    fontSize:     14,
    color:        Colors.primary,
    marginBottom: 20,
    paddingTop:   16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  pillWrap:     { flexDirection: 'row', flexWrap: 'wrap' },
  badgeHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
    marginTop:      8,
  },
  manageBadgesLink: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  addBadgesCard: {
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  14,
    borderStyle:   'dashed',
    padding:       18,
    alignItems:    'center',
    marginBottom:  20,
  },
  addBadgesText: { color: Colors.muted, fontSize: 14 },
  badgeGroup:    { marginBottom: 14 },
  badgeGroupLabel: { fontSize: 14, color: Colors.muted, fontWeight: '600', marginBottom: 8 },
  proCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: Colors.primary + '15',
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.primary + '50',
    marginBottom:    20,
  },
  proBadge: { color: Colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  proText:  { color: Colors.text, fontSize: 14, fontWeight: '600' },
  proUpsell: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.primary + '50',
    marginBottom:    20,
  },
  proUpsellTitle: { color: Colors.primary, fontSize: 16, fontWeight: '800' },
  proUpsellSub:   { color: Colors.muted, fontSize: 13, marginTop: 2 },
  proChevron:     { color: Colors.primary, fontSize: 24, fontWeight: '400' },
  trainingRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    20,
  },
  trainingRowActive:  { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  trainingText:       { color: Colors.text, fontSize: 15, fontWeight: '600' },
  trainingToggle:     { color: Colors.muted, fontSize: 13 },
  trainingTextActive: { color: Colors.primary },
  signOutBtn: {
    marginTop:   32,
    borderWidth:  1,
    borderColor:  Colors.error + '60',
    borderRadius: 14,
    padding:      16,
    alignItems:   'center',
  },
  signOutText: { color: Colors.error, fontSize: 16, fontWeight: '600' },
})
