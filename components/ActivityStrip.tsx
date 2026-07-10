import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'
import type { StreakSummary } from '@/lib/queries/workouts'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Compact 7-day activity strip for the Profile tab.
// Shows the flame count inline plus the last-7-days dot row.
export function ActivityStrip({ streak }: { streak: StreakSummary }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>🔥 Activity</Text>
        <Text style={styles.streakText}>
          {streak.currentStreak > 0 ? `${streak.currentStreak}-day streak` : 'No active streak'}
        </Text>
      </View>
      <View style={styles.strip}>
        {streak.last7Days.map((d) => {
          const active = d.count > 0
          const dow = DOW[new Date(d.date + 'T00:00:00Z').getUTCDay()]
          return (
            <View key={d.date} style={styles.dayCol}>
              <View style={[styles.bar, active && styles.barActive]} />
              <Text style={styles.dow}>{dow}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    20,
    gap:             14,
  },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:      { fontSize: 15, fontWeight: '700', color: Colors.text },
  streakText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  strip:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  dayCol:     { alignItems: 'center', gap: 6, flex: 1 },
  bar: {
    width: '70%', height: 26, borderRadius: 6,
    backgroundColor: Colors.surfaceHigh,
    borderWidth: 1, borderColor: Colors.border,
  },
  barActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dow:       { fontSize: 11, color: Colors.muted, fontWeight: '600' },
})
