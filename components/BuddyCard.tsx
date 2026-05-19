import { Alert, View, Text, Image, StyleSheet, Pressable } from 'react-native'
import { Colors } from '@/constants/colors'
import { BadgePill } from './BadgePill'
import { calcAge } from '@/types/database'
import { reportUser } from '@/lib/queries/profile'
import { useAuthStore } from '@/store/auth'
import type { GymBuddyResult, RunningBuddyResult } from '@/types/database'

type BuddyData =
  | (GymBuddyResult & { badges?: { name: string; category: 'gym' | 'running' | 'general' }[] })
  | (RunningBuddyResult & { badges?: { name: string; category: 'gym' | 'running' | 'general' }[] })

interface Props {
  buddy:   BuddyData
  onPress: () => void
  sent?:   boolean
}

function formatLastActive(iso: string | null): string | null {
  if (!iso) return null
  const diffMs    = Date.now() - new Date(iso).getTime()
  const diffHours = diffMs / 3_600_000
  if (diffHours < 1)  return 'Active now'
  if (diffHours < 24) return 'Active today'
  const days = Math.floor(diffHours / 24)
  if (days === 1)    return 'Active yesterday'
  if (days < 7)      return `Active ${days}d ago`
  return null
}

export function BuddyCard({ buddy, onPress, sent = false }: Props) {
  const myProfile = useAuthStore((s) => s.profile)

  const runTypes = 'run_types' in buddy && buddy.run_types
    ? buddy.run_types.map((t) => t.replace('_', ' ')).join(' · ')
    : null

  const gymInfo = 'experience_level' in buddy
    ? buddy.experience_level
    : null

  const lastActive = formatLastActive(buddy.last_active_at ?? null)

  function handleReport() {
    if (!myProfile) return
    Alert.alert(
      `Report ${buddy.full_name}`,
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
    try {
      await reportUser(buddy.profile_id, reason)
      Alert.alert('Reported', 'Thank you. We will review this profile.')
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.')
    }
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.avatarCol}>
        {buddy.profile_photo_url ? (
          <Image source={{ uri: buddy.profile_photo_url }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {buddy.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{buddy.full_name}</Text>
          <Text style={styles.age}>{buddy.age}</Text>
        </View>

        {gymInfo && (
          <Text style={styles.sub}>{gymInfo}</Text>
        )}
        {runTypes && (
          <Text style={styles.sub}>{runTypes}</Text>
        )}

        <View style={styles.metaRow}>
          <OverlapBadge count={buddy.badge_overlap_count} />
          <Text style={styles.distance}>{buddy.distance_km} km away</Text>
          {lastActive && <Text style={styles.activeText}>{lastActive}</Text>}
        </View>

        {buddy.badges && buddy.badges.length > 0 && (
          <View style={styles.pills}>
            {buddy.badges.slice(0, 3).map((b) => (
              <BadgePill key={b.name} name={b.name} category={b.category} small />
            ))}
          </View>
        )}

        {sent && (
          <View style={styles.sentChip}>
            <Text style={styles.sentText}>Request Sent ✓</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.reportBtn} onPress={handleReport} hitSlop={12}>
        <Text style={styles.reportDots}>⋯</Text>
      </Pressable>
    </Pressable>
  )
}

function OverlapBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <View style={styles.overlapBadge}>
      <Text style={styles.overlapText}>⚡ {count} badge{count > 1 ? 's' : ''} in common</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    backgroundColor: Colors.surface,
    borderRadius:   16,
    padding:        16,
    marginBottom:   12,
    borderWidth:    1,
    borderColor:    Colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  avatarCol: {
    marginRight: 14,
  },
  avatarImg: {
    width:        56,
    height:       56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: Colors.primary + '30',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarInitial: {
    fontSize:   22,
    fontWeight: '700',
    color:      Colors.primary,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection:  'row',
    alignItems:     'baseline',
    gap:             8,
    marginBottom:   2,
  },
  name: {
    fontSize:   17,
    fontWeight: '700',
    color:      Colors.text,
  },
  age: {
    fontSize: 15,
    color:    Colors.muted,
  },
  sub: {
    fontSize:     13,
    color:        Colors.muted,
    marginBottom: 6,
    textTransform:'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:            8,
    marginBottom:  8,
  },
  overlapBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius:    8,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  overlapText: {
    fontSize: 12,
    color:    Colors.primary,
    fontWeight: '600',
  },
  distance: {
    fontSize: 12,
    color:    Colors.muted,
  },
  activeText: {
    fontSize:   11,
    color:      Colors.success,
    fontWeight: '500',
  },
  pills: {
    flexDirection: 'row',
    flexWrap:      'wrap',
  },
  sentChip: {
    marginTop:        8,
    alignSelf:        'flex-start',
    backgroundColor:  Colors.success + '20',
    borderRadius:     8,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  sentText: {
    color:      Colors.success,
    fontSize:   12,
    fontWeight: '700',
  },
  reportBtn: {
    position:   'absolute',
    top:         12,
    right:       12,
    padding:     4,
  },
  reportDots: {
    color:    Colors.muted,
    fontSize: 18,
    lineHeight: 18,
  },
})
