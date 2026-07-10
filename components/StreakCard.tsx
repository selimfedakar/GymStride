import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'
import type { StreakSummary } from '@/lib/queries/workouts'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Hero streak card shown at the top of the Log tab.
// Renders the current 🔥 streak plus a 7-day dot strip.
export function StreakCard({ streak }: { streak: StreakSummary }) {
  const { currentStreak, longestStreak, activeToday, thisWeek, last7Days } = streak

  const headline = currentStreak > 0
    ? `${currentStreak}-day streak`
    : 'Start a streak today'

  const sub = currentStreak > 0
    ? (activeToday
        ? 'Logged today — keep it rolling'
        : 'Log a workout today to keep it alive')
    : 'Log any workout to begin'

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.flameWrap}>
          <Text style={styles.flame}>{currentStreak > 0 ? '🔥' : '💤'}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
      </View>

      {/* 7-day strip */}
      <View style={styles.strip}>
        {last7Days.map((d) => {
          const active = d.count > 0
          const dow = DOW[new Date(d.date + 'T00:00:00Z').getUTCDay()]
          return (
            <View key={d.date} style={styles.dayCol}>
              <View style={[styles.dot, active && styles.dotActive]}>
                {active && <Text style={styles.dotCheck}>✓</Text>}
              </View>
              <Text style={styles.dow}>{dow}</Text>
            </View>
          )
        })}
      </View>

      <View style={styles.statsRow}>
        <Stat label="This week" value={`${thisWeek}/7`} />
        <View style={styles.statDivider} />
        <Stat label="Longest" value={`${longestStreak}d`} />
      </View>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    18,
    padding:         18,
    borderWidth:     1,
    borderColor:     Colors.primary + '40',
    marginBottom:    24,
    gap:             16,
  },
  topRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flameWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  flame:    { fontSize: 28 },
  headText: { flex: 1 },
  headline: { fontSize: 20, fontWeight: '800', color: Colors.text },
  sub:      { fontSize: 13, color: Colors.muted, marginTop: 2 },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: { alignItems: 'center', gap: 6 },
  dot: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  dotCheck: { color: '#fff', fontSize: 14, fontWeight: '800' },
  dow:      { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop:    14,
  },
  stat:        { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  statValue:   { fontSize: 18, fontWeight: '800', color: Colors.primary },
  statLabel:   { fontSize: 11, color: Colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
})
