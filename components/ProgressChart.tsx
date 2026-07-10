import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg'
import { Colors } from '@/constants/colors'
import type { ProgressSummary } from '@/lib/queries/workouts'

type Metric = 'sessions' | 'km'

const CHART_HEIGHT = 130
const BAR_GAP      = 10

// Weekly training-volume bar chart for the Profile tab. Toggles between
// total sessions and running km over the caller's last 8 weeks.
export function ProgressChart({ progress }: { progress: ProgressSummary }) {
  const [metric, setMetric] = useState<Metric>('sessions')

  const weeks  = progress.weeks
  const values = weeks.map((w) => (metric === 'sessions' ? w.sessions : w.run_km))
  const maxVal = Math.max(1, ...values)

  const screenW  = Dimensions.get('window').width
  const chartW   = screenW - 48 /* screen padding */ - 32 /* card padding */
  const n        = Math.max(weeks.length, 1)
  const barW     = Math.max((chartW - BAR_GAP * (n - 1)) / n, 4)
  const accent   = metric === 'km' ? Colors.running : Colors.primary

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>📈 Progress</Text>
        <View style={styles.toggle}>
          {(['sessions', 'km'] as Metric[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.toggleBtn, metric === m && styles.toggleActive]}
              onPress={() => setMetric(m)}
            >
              <Text style={[styles.toggleText, metric === m && styles.toggleTextActive]}>
                {m === 'sessions' ? 'Sessions' : 'Run km'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Svg width={chartW} height={CHART_HEIGHT + 20}>
        {/* baseline */}
        <Line x1={0} y1={CHART_HEIGHT} x2={chartW} y2={CHART_HEIGHT} stroke={Colors.border} strokeWidth={1} />
        {weeks.map((w, i) => {
          const v = values[i]
          const h = Math.round((v / maxVal) * (CHART_HEIGHT - 10))
          const x = i * (barW + BAR_GAP)
          const y = CHART_HEIGHT - h
          const label = new Date(w.week_start + 'T00:00:00Z')
            .toLocaleDateString([], { day: 'numeric', month: 'numeric' })
          return (
            <G key={w.week_start}>
              <Rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx={4} fill={v > 0 ? accent : Colors.surfaceHigh} />
              {v > 0 && (
                <SvgText x={x + barW / 2} y={y - 4} fontSize={9} fill={Colors.muted} textAnchor="middle">
                  {String(v)}
                </SvgText>
              )}
              <SvgText x={x + barW / 2} y={CHART_HEIGHT + 14} fontSize={8} fill={Colors.muted} textAnchor="middle">
                {label}
              </SvgText>
            </G>
          )
        })}
      </Svg>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{progress.thisMonthSessions}</Text>
          <Text style={styles.statLabel}>Sessions this month</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{progress.thisMonthKm} km</Text>
          <Text style={styles.statLabel}>Run this month</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    20,
    gap:             14,
  },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  toggle:  { flexDirection: 'row', backgroundColor: Colors.surfaceHigh, borderRadius: 8, padding: 2 },
  toggleBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  toggleActive: { backgroundColor: Colors.bg },
  toggleText:      { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  toggleTextActive:{ color: Colors.text },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12,
  },
  stat:        { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  statValue:   { fontSize: 18, fontWeight: '800', color: Colors.text },
  statLabel:   { fontSize: 11, color: Colors.muted, marginTop: 2 },
})
