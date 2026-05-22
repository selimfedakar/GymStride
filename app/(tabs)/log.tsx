import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, Pressable, FlatList,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { insertWorkoutLog, fetchRecentLogs, evaluateAndAwardBadges } from '@/lib/queries/workouts'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import type { WorkoutLog } from '@/types/database'

type WorkoutType = 'gym' | 'long_run' | 'short_run' | 'sprint'

const WORKOUT_TYPES: { label: string; emoji: string; value: WorkoutType; isRun: boolean }[] = [
  { label: 'Gym',        emoji: '🏋️', value: 'gym',       isRun: false },
  { label: 'Long Run',   emoji: '🛣️',  value: 'long_run',  isRun: true  },
  { label: 'Short Run',  emoji: '🏃',  value: 'short_run', isRun: true  },
  { label: 'Sprint',     emoji: '⚡',  value: 'sprint',    isRun: true  },
]

const TYPE_LABELS: Record<WorkoutType, string> = {
  gym:       '🏋️ Gym',
  long_run:  '🛣️  Long Run',
  short_run: '🏃 Short Run',
  sprint:    '⚡ Sprint',
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function LogScreen() {
  const profile = useAuthStore((s) => s.profile)

  const [type,       setType]       = useState<WorkoutType>('gym')
  const [distance,   setDistance]   = useState('')
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentLogs, setRecentLogs] = useState<WorkoutLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadLogs()
  }, [profile])

  async function loadLogs() {
    setLogsLoading(true)
    const logs = await fetchRecentLogs(profile!.id, 10).catch(() => [])
    setRecentLogs(logs)
    setLogsLoading(false)
  }

  async function handleSubmit() {
    if (!profile) return
    setSubmitting(true)
    try {
      const selectedType = WORKOUT_TYPES.find((t) => t.value === type)!
      await insertWorkoutLog({
        profile_id:   profile.id,
        workout_type: type,
        distance_km:  selectedType.isRun && distance ? parseFloat(distance) : undefined,
        notes:        notes.trim() || undefined,
      })

      // Reset form
      setDistance('')
      setNotes('')

      // Check for newly earned badges
      const earned = await evaluateAndAwardBadges()
      if (earned.length > 0) {
        const names = earned.map((b) => `🏅 ${b.badgeName}`).join('\n')
        Alert.alert(
          'Badge Earned! 🎉',
          `You just unlocked:\n\n${names}`,
          [{ text: 'Nice!', style: 'default' }]
        )
      }

      // Refresh log history
      await loadLogs()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedIsRun = WORKOUT_TYPES.find((t) => t.value === type)?.isRun ?? false

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Log Workout</Text>
          <Text style={styles.tagline}>
            Think of this as your training journal — log sets, weights, and notes. Share those PR attempts.
          </Text>

          {/* Type selector */}
          <Text style={styles.label}>Workout type</Text>
          <View style={styles.typeGrid}>
            {WORKOUT_TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.typeTile, type === t.value && styles.typeTileActive]}
                onPress={() => setType(t.value)}
              >
                <Text style={styles.typeEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Distance (runs only) */}
          {selectedIsRun && (
            <>
              <Text style={styles.label}>Distance (km)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10.5"
                placeholderTextColor={Colors.muted}
                value={distance}
                onChangeText={setDistance}
                keyboardType="decimal-pad"
              />
            </>
          )}

          {/* Notes */}
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="How did it feel?"
            placeholderTextColor={Colors.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />

          <Pressable
            style={[styles.btn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Log Workout ✓</Text>
            }
          </Pressable>

          {/* Recent logs */}
          <Text style={styles.sectionTitle}>Recent Activity</Text>

          {logsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
          ) : recentLogs.length === 0 ? (
            <Text style={styles.emptyText}>No workouts logged yet — start today!</Text>
          ) : (
            recentLogs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function LogRow({ log }: { log: WorkoutLog }) {
  const label = TYPE_LABELS[log.workout_type as WorkoutType] ?? log.workout_type
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.left}>
        <Text style={rowStyles.type}>{label}</Text>
        {log.distance_km != null && (
          <Text style={rowStyles.distance}>{log.distance_km} km</Text>
        )}
        {log.notes && (
          <Text style={rowStyles.notes} numberOfLines={1}>{log.notes}</Text>
        )}
      </View>
      <Text style={rowStyles.time}>{relativeTime(log.logged_at)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  kav:       { flex: 1 },
  scroll: {
    padding:       24,
    paddingTop:    Platform.OS === 'ios' ? 20 : 32,
    paddingBottom: 48,
  },
  title: {
    fontSize:    24,
    fontWeight:  '800',
    color:       Colors.text,
    marginBottom: 6,
  },
  tagline: {
    fontSize:    13,
    color:       Colors.primary,
    lineHeight:  19,
    opacity:     0.85,
    marginBottom: 20,
  },
  label: {
    fontSize:     13,
    color:        Colors.muted,
    fontWeight:   '600',
    marginBottom: 8,
    marginTop:    16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            10,
  },
  typeTile: {
    width:           '47%',
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
    gap:              6,
  },
  typeTileActive: {
    borderColor:     Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  typeEmoji:      { fontSize: 26 },
  typeLabel:      { fontSize: 14, fontWeight: '600', color: Colors.muted },
  typeLabelActive:{ color: Colors.primary },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         14,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  notesInput: {
    minHeight:         80,
    textAlignVertical: 'top',
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       24,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize:    18,
    fontWeight:  '700',
    color:       Colors.text,
    marginTop:   36,
    marginBottom: 14,
  },
  emptyText: {
    color:    Colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
})

const rowStyles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    marginBottom:    8,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  left:     { flex: 1, gap: 3 },
  type:     { fontSize: 15, fontWeight: '700', color: Colors.text },
  distance: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  notes:    { fontSize: 13, color: Colors.muted },
  time:     { fontSize: 12, color: Colors.muted, marginLeft: 8, marginTop: 2 },
})
