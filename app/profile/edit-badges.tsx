import { useEffect, useState } from 'react'
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { fetchAllBadges, fetchProfileBadges, toggleBadge } from '@/lib/queries/badges'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import type { Badge, BadgeCategory } from '@/types/database'

const categoryColor: Record<BadgeCategory, string> = {
  gym:     Colors.primary,
  running: Colors.running,
  general: Colors.muted,
}

export default function EditBadgesScreen() {
  const router  = useRouter()
  const profile = useAuthStore((s) => s.profile)

  const [allBadges,  setAllBadges]  = useState<Badge[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [earned,     setEarned]     = useState<Set<string>>(new Set())  // can't be de-selected
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (!profile) return
    Promise.all([fetchAllBadges(), fetchProfileBadges(profile.id)])
      .then(([all, existing]) => {
        setAllBadges(all)
        const sel  = new Set(existing.map((b) => b.badge_id))
        const earn = new Set(existing.filter((b) => b.is_earned).map((b) => b.badge_id))
        setSelected(sel)
        setEarned(earn)
      })
      .finally(() => setLoading(false))
  }, [profile])

  function toggle(badgeId: string) {
    if (earned.has(badgeId)) return  // earned badges are locked
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(badgeId) ? next.delete(badgeId) : next.add(badgeId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const [all, current] = await Promise.all([
        Promise.resolve(allBadges),
        fetchProfileBadges(profile!.id),
      ])
      const currentIds = new Set(current.map((b) => b.badge_id))

      // Add newly selected (skip earned — they exist already)
      const toAdd    = [...selected].filter((id) => !currentIds.has(id) && !earned.has(id))
      // Remove deselected (skip earned)
      const toRemove = [...currentIds].filter((id) => !selected.has(id) && !earned.has(id))

      await Promise.all([
        ...toAdd.map((id) => toggleBadge(profile!.id, id)),
        ...toRemove.map((id) => toggleBadge(profile!.id, id)),
      ])

      router.back()
    } finally {
      setSaving(false)
    }
  }

  const selectableGym     = allBadges.filter((b) => b.category === 'gym'     && !b.is_earnable)
  const selectableRunning = allBadges.filter((b) => b.category === 'running' && !b.is_earnable)
  const earnableBadges    = allBadges.filter((b) => b.is_earnable)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title:           'Manage Badges',
          headerShown:     true,
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle:{ fontWeight: '700' },
          headerRight: () => (
            <Pressable onPress={handleSave} disabled={saving} style={{ marginRight: 16 }}>
              {saving
                ? <ActivityIndicator color={Colors.primary} size="small" />
                : <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 16 }}>Save</Text>
              }
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <BadgeSection
          title="🏋️ Gym"
          color={Colors.primary}
          badges={selectableGym}
          selected={selected}
          earned={earned}
          onToggle={toggle}
        />
        <BadgeSection
          title="🏃 Running"
          color={Colors.running}
          badges={selectableRunning}
          selected={selected}
          earned={earned}
          onToggle={toggle}
        />

        {earnableBadges.length > 0 && (
          <View style={styles.earnSection}>
            <Text style={styles.earnTitle}>⚡ Earnable Badges</Text>
            <Text style={styles.earnSub}>
              These are awarded automatically when you hit milestones in the Log tab.
            </Text>
            <View style={styles.earnGrid}>
              {earnableBadges.map((b) => {
                const isEarned = earned.has(b.id)
                const color    = categoryColor[b.category]
                return (
                  <View
                    key={b.id}
                    style={[
                      styles.earnTile,
                      isEarned && { borderColor: color, backgroundColor: color + '15' },
                    ]}
                  >
                    <Text style={[styles.earnName, isEarned && { color }]}>{b.name}</Text>
                    {b.description && (
                      <Text style={styles.earnDesc} numberOfLines={2}>{b.description}</Text>
                    )}
                    {isEarned && <Text style={[styles.earnedTag, { color }]}>✓ Earned</Text>}
                  </View>
                )
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </>
  )
}

function BadgeSection({
  title, color, badges, selected, earned, onToggle,
}: {
  title:    string
  color:    string
  badges:   Badge[]
  selected: Set<string>
  earned:   Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <View style={sectionStyles.section}>
      <Text style={[sectionStyles.heading, { color }]}>{title}</Text>
      <View style={sectionStyles.grid}>
        {badges.map((b) => {
          const active  = selected.has(b.id)
          const isEarned = earned.has(b.id)
          return (
            <Pressable
              key={b.id}
              style={[
                sectionStyles.tile,
                active && { borderColor: color, backgroundColor: color + '20' },
                isEarned && sectionStyles.tileEarned,
              ]}
              onPress={() => onToggle(b.id)}
              disabled={isEarned}
            >
              {isEarned && <Text style={sectionStyles.earnedBadge}>🏅</Text>}
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
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { padding: 24, paddingBottom: 48 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  earnSection: { marginTop: 24 },
  earnTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  earnSub:   { fontSize: 13, color: Colors.muted, marginBottom: 14, lineHeight: 18 },
  earnGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  earnTile: {
    width:           '47%',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
    gap:              4,
  },
  earnName:  { fontSize: 14, fontWeight: '700', color: Colors.muted },
  earnDesc:  { fontSize: 12, color: Colors.muted, lineHeight: 16 },
  earnedTag: { fontSize: 12, fontWeight: '700', marginTop: 4 },
})

const sectionStyles = StyleSheet.create({
  section:    { marginBottom: 28 },
  heading:    { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width:           '47%',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
    position:        'relative',
  },
  tileEarned: { opacity: 0.7 },
  earnedBadge: {
    position:  'absolute',
    top:        8,
    right:      8,
    fontSize:  14,
  },
  name:  { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  desc:  { fontSize: 12, color: Colors.muted, lineHeight: 16 },
})
