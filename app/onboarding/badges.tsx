import { useState, useEffect } from 'react'
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { fetchAllBadges, toggleBadge } from '@/lib/queries/badges'
import { useAuthStore } from '@/store/auth'
import { StepProgress } from '@/components/StepProgress'
import { Colors } from '@/constants/colors'
import type { Badge, BadgeCategory } from '@/types/database'

const categoryColor: Record<BadgeCategory, string> = {
  gym:     Colors.primary,
  running: Colors.running,
  general: Colors.muted,
}

export default function OnboardingBadgesScreen() {
  const router  = useRouter()
  const session = useAuthStore((s) => s.session)

  const [allBadges, setAllBadges]   = useState<Badge[]>([])
  const [selected,  setSelected]    = useState<Set<string>>(new Set())
  const [loading,   setLoading]     = useState(true)
  const [saving,    setSaving]      = useState(false)

  useEffect(() => {
    fetchAllBadges()
      .then(setAllBadges)
      .finally(() => setLoading(false))
  }, [])

  function toggle(badgeId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(badgeId) ? next.delete(badgeId) : next.add(badgeId)
      return next
    })
  }

  async function handleNext() {
    setSaving(true)
    try {
      await Promise.all(
        [...selected].map((id) => toggleBadge(session!.user.id, id))
      )
      router.push('/onboarding/preferences')
    } finally {
      setSaving(false)
    }
  }

  const gymBadges     = allBadges.filter((b) => b.category === 'gym'     && !b.is_earnable)
  const runningBadges = allBadges.filter((b) => b.category === 'running' && !b.is_earnable)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <StepProgress total={4} current={2} />

      <Text style={styles.title}>Pick your badges</Text>
      <Text style={styles.subtitle}>
        Step 3 of 4 — badges are how others discover you
      </Text>

      <BadgeSection
        title="🏋️ Gym"
        color={Colors.primary}
        badges={gymBadges}
        selected={selected}
        onToggle={toggle}
      />

      <BadgeSection
        title="🏃 Running"
        color={Colors.running}
        badges={runningBadges}
        selected={selected}
        onToggle={toggle}
      />

      <Text style={styles.earnNote}>
        ⚡ Some badges are earned automatically by logging workouts.
      </Text>

      <Pressable
        style={[styles.btn, (saving || selected.size === 0) && styles.btnDisabled]}
        onPress={handleNext}
        disabled={saving || selected.size === 0}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Next → ({selected.size} selected)</Text>
        }
      </Pressable>

      <Pressable style={styles.skipBtn} onPress={() => router.push('/onboarding/preferences')}>
        <Text style={styles.skipText}>Skip for now</Text>
      </Pressable>
    </ScrollView>
  )
}

function BadgeSection({
  title, color, badges, selected, onToggle,
}: {
  title:    string
  color:    string
  badges:   Badge[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <View style={sectionStyles.section}>
      <Text style={[sectionStyles.heading, { color }]}>{title}</Text>
      <View style={sectionStyles.grid}>
        {badges.map((b) => {
          const active = selected.has(b.id)
          return (
            <Pressable
              key={b.id}
              style={[sectionStyles.tile, active && { borderColor: color, backgroundColor: color + '20' }]}
              onPress={() => onToggle(b.id)}
            >
              <Text style={[sectionStyles.name, active && { color }]}>{b.name}</Text>
              {b.description && (
                <Text style={sectionStyles.desc} numberOfLines={2}>{b.description}</Text>
              )}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: {
    padding:    24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  title: {
    fontSize:    28,
    fontWeight:  '800',
    color:       Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize:    14,
    color:       Colors.muted,
    marginBottom: 24,
  },
  earnNote: {
    fontSize:    13,
    color:       Colors.muted,
    fontStyle:   'italic',
    marginVertical: 16,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginBottom:    12,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color:    Colors.muted,
    fontSize: 15,
  },
})

const sectionStyles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  heading: {
    fontSize:    18,
    fontWeight:  '700',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            10,
  },
  tile: {
    width:           '47%',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  name: {
    fontSize:    15,
    fontWeight:  '700',
    color:       Colors.text,
    marginBottom: 4,
  },
  desc: {
    fontSize: 12,
    color:    Colors.muted,
    lineHeight: 16,
  },
})
