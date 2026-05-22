import { useState } from 'react'
import {
  View, Text, FlatList, Pressable, Modal,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useRunningBuddies } from '@/hooks/useRunningBuddies'
import { BuddyCard } from '@/components/BuddyCard'
import { NearbyPanel } from '@/components/NearbyPanel'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import type { RunType } from '@/types/database'

const RUN_FILTERS: { label: string; value: RunType | null }[] = [
  { label: 'All',        value: null        },
  { label: 'Long Runs',  value: 'long_run'  },
  { label: 'Short Runs', value: 'short_run' },
  { label: 'Sprints',    value: 'sprint'    },
]

const RADIUS_OPTIONS = [10, 25, 50, 100]

export default function RunningScreen() {
  const router         = useRouter()
  const sentRequestIds = useAuthStore((s) => s.sentRequestIds)

  const [runType,     setRunType]     = useState<RunType | null>(null)
  const [radius,      setRadius]      = useState(50)
  const [showFilters, setShowFilters] = useState(false)

  const {
    data, isLoading, isError,
    refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useRunningBuddies(radius, runType)

  const buddies = data?.pages.flat() ?? []

  function goToProfile(profileId: string, distanceKm: number, badgeOverlap: number) {
    router.push(`/profile/${profileId}?distanceKm=${distanceKm}&badgeOverlap=${badgeOverlap}`)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Running Buddies</Text>
          <Text style={styles.sub}>Within {radius} km</Text>
        </View>
        <Pressable style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <Text style={styles.filterText}>Radius ⚙️</Text>
        </Pressable>
      </View>

      {/* Run type tabs */}
      <View style={styles.tabBar}>
        {RUN_FILTERS.map((f) => (
          <Pressable
            key={String(f.value)}
            style={[styles.tab, runType === f.value && styles.tabActive]}
            onPress={() => setRunType(f.value)}
          >
            <Text style={[styles.tabText, runType === f.value && styles.tabTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content area */}
      <View style={styles.content}>
        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.running} size="large" />
            <Text style={styles.loadingText}>Finding running partners...</Text>
          </View>
        )}

        {isError && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Could not load buddies</Text>
            <Pressable style={[styles.retryBtn, { borderColor: Colors.running }]} onPress={() => refetch()}>
              <Text style={[styles.retryText, { color: Colors.running }]}>Try again</Text>
            </Pressable>
          </View>
        )}

        {buddies.length === 0 && !isLoading && !isError && (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>🏃</Text>
            <Text style={styles.emptyTitle}>No running buddies nearby</Text>
            <Text style={styles.emptyText}>Try switching run types or expanding your radius</Text>
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
                tintColor={Colors.running}
              />
            }
            onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingNextPage
                ? <ActivityIndicator color={Colors.running} style={styles.pageLoader} />
                : null
            }
            renderItem={({ item }) => (
              <BuddyCard
                buddy={item}
                sent={sentRequestIds.includes(item.profile_id)}
                onPress={() => goToProfile(item.profile_id, item.distance_km, item.badge_overlap_count)}
              />
            )}
          />
        )}

        <NearbyPanel
          profiles={buddies}
          accentColor={Colors.running}
          onProfilePress={(p) => {
            const b = (buddies ?? []).find((b) => b.profile_id === p.profile_id)
            if (b) goToProfile(b.profile_id, b.distance_km, b.badge_overlap_count)
          }}
        />
      </View>

      {/* Radius Filter Modal */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <Pressable style={styles.backdrop} onPress={() => setShowFilters(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Search radius</Text>
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
  container:   { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         20,
    paddingBottom:   12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.text },
  sub:      { fontSize: 13, color: Colors.muted, marginTop: 2 },
  filterBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  filterText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  optionActive:     { borderColor: Colors.running, backgroundColor: Colors.running + '25' },
  optionText:       { color: Colors.muted, fontSize: 14 },
  optionTextActive: { color: Colors.running, fontWeight: '700' },
  tabBar: {
    flexDirection:  'row',
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:             8,
  },
  tab: {
    flex:        1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems:  'center',
  },
  tabActive: {
    borderColor:     Colors.running,
    backgroundColor: Colors.running + '20',
  },
  tabText:       { color: Colors.muted, fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: Colors.running, fontWeight: '700' },
  content: {
    flex:     1,
    position: 'relative',
  },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12,
  },
  loadingText: { color: Colors.muted, fontSize: 14 },
  errorText:   { color: Colors.error, fontSize: 16, fontWeight: '600' },
  retryBtn: {
    borderWidth: 1, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  retryText:   { fontWeight: '600' },
  emptyEmoji:  { fontSize: 48, marginBottom: 8 },
  emptyTitle:  { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText:   { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list:        { padding: 16, paddingBottom: 32 },
  pageLoader:  { paddingVertical: 16 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  sheetTitle:  { fontSize: 22, fontWeight: '800', color: Colors.text },
  applyBtn: {
    backgroundColor: Colors.running,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       8,
  },
  applyText: { color: Colors.text, fontSize: 17, fontWeight: '700' },
})
