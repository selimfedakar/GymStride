import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, Pressable, Modal,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useGymBuddies } from '@/hooks/useGymBuddies'
import { BuddyCard } from '@/components/BuddyCard'
import { NearbyPanel } from '@/components/NearbyPanel'
import { BuddyMap } from '@/components/BuddyMap'
import { fetchBuddyPins, type BuddyPin } from '@/lib/queries/discovery'
import { track, captureError } from '@/lib/analytics'
import { useAuthStore } from '@/store/auth'
import { useProStore } from '@/store/pro'
import { Colors } from '@/constants/colors'
import type { ExperienceLevel } from '@/types/database'

const RADIUS_OPTIONS = [10, 25, 50, 100]
const FREQ_OPTIONS   = [1, 2, 3, 4, 5]
const EXPERIENCE_OPTIONS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced', 'elite']

export default function GymScreen() {
  const router          = useRouter()
  const sentRequestIds  = useAuthStore((s) => s.sentRequestIds)
  const isPro           = useProStore((s) => s.isPro)

  const [radius,      setRadius]      = useState(50)
  const [minFreq,     setMinFreq]     = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [view,        setView]        = useState<'list' | 'map'>('list')
  const [pins,        setPins]        = useState<BuddyPin[]>([])
  const [pinsLoading, setPinsLoading] = useState(false)
  const [sameCampus,  setSameCampus]  = useState(false)
  const [experience,  setExperience]  = useState<ExperienceLevel | null>(null)

  const {
    data, isLoading, isError, error,
    refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useGymBuddies(radius, minFreq, { sameUniversity: sameCampus, experience: isPro ? experience : null })

  const buddies = data?.pages.flat() ?? []

  useFocusEffect(useCallback(() => {
    track('discovery_viewed', { tab: 'gym' })
  }, []))

  // Load privacy-fuzzed pins whenever the map is shown or the radius changes.
  useEffect(() => {
    if (view !== 'map') return
    setPinsLoading(true)
    fetchBuddyPins(radius, 'gym')
      .then(setPins)
      .catch((e) => captureError(e, { where: 'gym.pins' }))
      .finally(() => setPinsLoading(false))
  }, [view, radius])

  function goToProfile(profileId: string, distanceKm: number, badgeOverlap: number) {
    router.push(`/profile/${profileId}?distanceKm=${distanceKm}&badgeOverlap=${badgeOverlap}`)
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Gym Buddies</Text>
          <Text style={styles.sub}>Within {radius} km · {minFreq}+ days/wk</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.filterBtn}
            onPress={() => {
              const next = view === 'list' ? 'map' : 'list'
              setView(next)
              if (next === 'map') track('map_view_opened', { tab: 'gym' })
            }}
          >
            <Text style={styles.filterText}>{view === 'list' ? '🗺️ Map' : '☰ List'}</Text>
          </Pressable>
          <Pressable style={styles.filterBtn} onPress={() => setShowFilters(true)}>
            <Text style={styles.filterText}>Filters ⚙️</Text>
          </Pressable>
        </View>
      </View>

      {/* Content area */}
      <View style={styles.content}>
        {view === 'map' ? (
          pinsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <BuddyMap
              pins={pins}
              accent={Colors.primary}
              onPinPress={(id) => {
                const pin = pins.find((p) => p.profile_id === id)
                router.push(`/profile/${id}${pin ? `?distanceKm=${pin.distance_km}` : ''}`)
              }}
            />
          )
        ) : (
        <>
        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Finding gym buddies near you...</Text>
          </View>
        )}

        {isError && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Could not load buddies</Text>
            {!!error && (
              <Text style={styles.errorDetail} numberOfLines={4}>
                {(error as any)?.message ?? String(error)}
              </Text>
            )}
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {buddies.length === 0 && !isLoading && !isError && (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>🏋️</Text>
            <Text style={styles.emptyTitle}>No buddies found yet</Text>
            <Text style={styles.emptyText}>Try expanding your radius or lowering the frequency filter</Text>
          </View>
        )}

        {buddies.length > 0 && (
          <FlatList
            data={buddies}
            keyExtractor={(item) => item.profile_id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={() => refetch()}
                tintColor={Colors.primary}
              />
            }
            onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingNextPage
                ? <ActivityIndicator color={Colors.primary} style={styles.pageLoader} />
                : null
            }
            renderItem={({ item }) => (
              <BuddyCard
                buddy={item}
                sent={sentRequestIds.includes(item.profile_id)}
                onPress={() => goToProfile(item.profile_id, item.distance_km, item.badge_overlap_count)}
              />
            )}
            ItemSeparatorComponent={() => null}
          />
        )}

        <NearbyPanel
          profiles={buddies}
          accentColor={Colors.primary}
          onProfilePress={(p) => {
            const b = (buddies ?? []).find((b) => b.profile_id === p.profile_id)
            if (b) goToProfile(b.profile_id, b.distance_km, b.badge_overlap_count)
          }}
        />
        </>
        )}
      </View>

      {/* Filter Sheet */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <Pressable style={styles.backdrop} onPress={() => setShowFilters(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Filters</Text>

          <Text style={styles.sheetLabel}>Search radius</Text>
          <View style={styles.optionRow}>
            {RADIUS_OPTIONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.optionChip, radius === r && styles.optionActive]}
                onPress={() => setRadius(r)}
              >
                <Text style={[styles.optionText, radius === r && styles.optionTextActive]}>
                  {r} km
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetLabel}>Min gym days / week</Text>
          <View style={styles.optionRow}>
            {FREQ_OPTIONS.map((f) => (
              <Pressable
                key={f}
                style={[styles.optionChip, minFreq === f && styles.optionActive]}
                onPress={() => setMinFreq(f)}
              >
                <Text style={[styles.optionText, minFreq === f && styles.optionTextActive]}>
                  {f}x
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Same campus (free) */}
          <Pressable
            style={[styles.campusRow, sameCampus && styles.optionActive]}
            onPress={() => setSameCampus((v) => !v)}
          >
            <Text style={[styles.optionText, sameCampus && styles.optionTextActive]}>🎓 Same campus only</Text>
            <Text style={[styles.optionText, sameCampus && styles.optionTextActive]}>{sameCampus ? 'On' : 'Off'}</Text>
          </Pressable>

          {/* Experience (Pro) */}
          <Text style={styles.sheetLabel}>
            Experience {!isPro && <Text style={styles.proTag}>PRO</Text>}
          </Text>
          <View style={styles.optionRow}>
            {EXPERIENCE_OPTIONS.map((e) => (
              <Pressable
                key={e}
                style={[styles.optionChip, experience === e && isPro && styles.optionActive]}
                onPress={() => {
                  if (!isPro) { setShowFilters(false); router.push('/paywall'); return }
                  setExperience((prev) => (prev === e ? null : e))
                }}
              >
                <Text style={[styles.optionText, experience === e && isPro && styles.optionTextActive]}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.applyBtn}
            onPress={() => { setShowFilters(false); refetch() }}
          >
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         20,
    paddingBottom:   12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: {
    fontSize:   24,
    fontWeight: '800',
    color:      Colors.text,
  },
  sub: {
    fontSize: 13,
    color:    Colors.muted,
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  filterText: {
    color:    Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex:     1,
    position: 'relative',
  },
  centered: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    padding:        32,
    gap:             12,
  },
  loadingText:  { color: Colors.muted, fontSize: 14 },
  errorText:    { color: Colors.error, fontSize: 16, fontWeight: '600' },
  errorDetail:  { color: Colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },
  retryBtn: {
    borderWidth:   1,
    borderColor:   Colors.primary,
    borderRadius:  10,
    paddingVertical:   10,
    paddingHorizontal: 20,
  },
  retryText: { color: Colors.primary, fontWeight: '600' },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText:  { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list:       { padding: 16, paddingBottom: 32 },
  pageLoader: { paddingVertical: 16 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position:        'absolute',
    bottom:           0,
    left:             0,
    right:            0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:         24,
    paddingBottom:   40,
    gap:              14,
  },
  sheetTitle: {
    fontSize:   22,
    fontWeight: '800',
    color:      Colors.text,
  },
  sheetLabel: {
    fontSize:    13,
    color:       Colors.muted,
    fontWeight:  '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  optionChip: {
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  10,
    paddingVertical:   9,
    paddingHorizontal: 16,
  },
  optionActive: {
    borderColor:     Colors.primary,
    backgroundColor: Colors.primary + '25',
  },
  optionText:       { color: Colors.muted, fontSize: 14 },
  optionTextActive: { color: Colors.primary, fontWeight: '700' },
  campusRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    borderWidth:    1,
    borderColor:    Colors.border,
    borderRadius:   10,
    paddingVertical:   12,
    paddingHorizontal: 14,
  },
  proTag: {
    color: Colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.5,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       8,
  },
  applyText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
})
