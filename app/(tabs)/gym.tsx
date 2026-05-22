import { useState } from 'react'
import {
  View, Text, FlatList, Pressable, Modal,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useGymBuddies } from '@/hooks/useGymBuddies'
import { BuddyCard } from '@/components/BuddyCard'
import { NearbyPanel } from '@/components/NearbyPanel'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'

const RADIUS_OPTIONS = [10, 25, 50, 100]
const FREQ_OPTIONS   = [1, 2, 3, 4, 5]

export default function GymScreen() {
  const router          = useRouter()
  const sentRequestIds  = useAuthStore((s) => s.sentRequestIds)

  const [radius,      setRadius]      = useState(50)
  const [minFreq,     setMinFreq]     = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  const {
    data, isLoading, isError, error,
    refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useGymBuddies(radius, minFreq)

  const buddies = data?.pages.flat() ?? []

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
        <Pressable style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <Text style={styles.filterText}>Filters ⚙️</Text>
        </Pressable>
      </View>

      {/* Content area */}
      <View style={styles.content}>
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
