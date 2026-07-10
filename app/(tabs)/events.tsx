import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, Pressable, Modal, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  fetchNearbyEvents, createEvent, joinEvent, leaveEvent,
  type EventSummary, type CreateEventInput,
} from '@/lib/queries/events'
import { resolveGpsLocation } from '@/lib/location'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import { track, captureError } from '@/lib/analytics'

const TYPE_TABS: { label: string; value: 'gym' | 'running' | null }[] = [
  { label: 'All',     value: null      },
  { label: '🏋️ Gym',  value: 'gym'     },
  { label: '🏃 Run',  value: 'running' },
]
const TYPE_EMOJI: Record<string, string> = { gym: '🏋️', running: '🏃', other: '📍' }
const MAX_OPTIONS = [2, 3, 5, 8, 12]

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay)    return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

export default function EventsScreen() {
  const router  = useRouter()
  const profile = useAuthStore((s) => s.profile)

  const [events,   setEvents]   = useState<EventSummary[]>([])
  const [typeTab,  setTypeTab]  = useState<'gym' | 'running' | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const list = await fetchNearbyEvents(50, typeTab).catch((e) => {
      captureError(e, { where: 'events.load' })
      return [] as EventSummary[]
    })
    setEvents(list)
    setLoading(false)
  }, [typeTab])

  useFocusEffect(useCallback(() => { setLoading(true); load() }, [load]))

  async function toggleJoin(ev: EventSummary) {
    setBusyId(ev.id)
    try {
      if (ev.joined) {
        await leaveEvent(ev.id)
      } else {
        await joinEvent(ev.id)
        track('event_joined', { type: ev.event_type })
      }
      await load()
    } catch (e: any) {
      Alert.alert('Event', e?.message === 'event is full' ? 'This event is full.' : 'Could not update. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Pressable style={styles.createBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.createText}>+ Create</Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {TYPE_TABS.map((t) => (
          <Pressable
            key={String(t.value)}
            style={[styles.tab, typeTab === t.value && styles.tabActive]}
            onPress={() => setTypeTab(t.value)}
          >
            <Text style={[styles.tabText, typeTab === t.value && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>No upcoming events</Text>
          <Text style={styles.emptyText}>Be the first — create a group workout near you.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/event/${item.id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardEmoji}>{TYPE_EMOJI[item.event_type] ?? '📍'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardWhen}>{formatWhen(item.starts_at)}</Text>
                </View>
                <Pressable
                  style={[styles.joinBtn, item.joined && styles.joinedBtn, busyId === item.id && styles.disabled]}
                  onPress={() => toggleJoin(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id
                    ? <ActivityIndicator color={item.joined ? Colors.muted : '#fff'} size="small" />
                    : <Text style={[styles.joinText, item.joined && styles.joinedText]}>{item.joined ? 'Joined' : 'Join'}</Text>
                  }
                </Pressable>
              </View>
              <View style={styles.cardMeta}>
                {item.location_name && <Text style={styles.metaText}>📍 {item.location_name}</Text>}
                {item.distance_km != null && <Text style={styles.metaText}>· {item.distance_km} km</Text>}
                <Text style={styles.metaText}>
                  · 👥 {item.participant_count}{item.max_participants ? `/${item.max_participants}` : ''}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <CreateEventModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => { setShowForm(false); setLoading(true); load() }}
        canCreate={!!profile}
      />
    </SafeAreaView>
  )
}

// ─── Create modal ─────────────────────────────────────────────────────────────

const DAY_OPTIONS = [0, 1, 2, 3]  // today, +1, +2, +3

function CreateEventModal({
  visible, onClose, onCreated, canCreate,
}: { visible: boolean; onClose: () => void; onCreated: () => void; canCreate: boolean }) {
  const [title,   setTitle]   = useState('')
  const [type,    setType]    = useState<'gym' | 'running' | 'other'>('gym')
  const [dayOff,  setDayOff]  = useState(0)
  const [time,    setTime]    = useState('18:00')
  const [maxP,    setMaxP]    = useState<number | null>(5)
  const [notes,   setNotes]   = useState('')
  const [locName, setLocName] = useState<string | null>(null)
  const [coords,  setCoords]  = useState<{ lat: number; lng: number } | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [saving,  setSaving]  = useState(false)

  async function useMyLocation() {
    setLocBusy(true)
    try {
      const r = await resolveGpsLocation()
      setCoords({ lat: r.lat, lng: r.lng })
      setLocName(r.name || 'My location')
    } catch {
      Alert.alert('Location', 'Could not get your location.')
    } finally {
      setLocBusy(false)
    }
  }

  function buildStartsAt(): string | null {
    const m = time.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10)
    if (h > 23 || min > 59) return null
    const d = new Date()
    d.setDate(d.getDate() + dayOff)
    d.setHours(h, min, 0, 0)
    // If today + time already passed, still allow (server checks > now on listing)
    return d.toISOString()
  }

  async function handleCreate() {
    if (!canCreate || !title.trim()) { Alert.alert('Event', 'Please add a title.'); return }
    const startsAt = buildStartsAt()
    if (!startsAt) { Alert.alert('Event', 'Enter a valid time as HH:MM.'); return }
    setSaving(true)
    try {
      const input: CreateEventInput = {
        title:           title.trim(),
        eventType:       type,
        startsAt,
        locationName:    locName,
        lat:             coords?.lat ?? null,
        lng:             coords?.lng ?? null,
        maxParticipants: maxP,
        notes:           notes.trim() || null,
      }
      await createEvent(input)
      track('event_created', { type })
      // reset
      setTitle(''); setNotes(''); setLocName(null); setCoords(null); setDayOff(0); setTime('18:00'); setMaxP(5)
      onCreated()
    } catch (e) {
      captureError(e, { where: 'events.create' })
      Alert.alert('Event', 'Could not create the event. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const dayLabel = (off: number) => {
    if (off === 0) return 'Today'
    if (off === 1) return 'Tomorrow'
    const d = new Date(); d.setDate(d.getDate() + off)
    return d.toLocaleDateString([], { weekday: 'short' })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>New Event</Text>

        <TextInput
          style={styles.input}
          placeholder="Title (e.g. Saturday long run)"
          placeholderTextColor={Colors.muted}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        <View style={styles.chipRow}>
          {(['gym', 'running', 'other'] as const).map((t) => (
            <Pressable key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
              <Text style={[styles.chipText, type === t && styles.chipTextActive]}>
                {t === 'gym' ? '🏋️ Gym' : t === 'running' ? '🏃 Run' : '📍 Other'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.rowSplit}>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Day</Text>
            <View style={styles.chipRow}>
              {DAY_OPTIONS.map((o) => (
                <Pressable key={o} style={[styles.chipSm, dayOff === o && styles.chipActive]} onPress={() => setDayOff(o)}>
                  <Text style={[styles.chipText, dayOff === o && styles.chipTextActive]}>{dayLabel(o)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.rowSplit}>
          <View>
            <Text style={styles.miniLabel}>Time</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              placeholder="18:00"
              placeholderTextColor={Colors.muted}
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>Max people</Text>
            <View style={styles.chipRow}>
              {MAX_OPTIONS.map((n) => (
                <Pressable key={n} style={[styles.chipSm, maxP === n && styles.chipActive]} onPress={() => setMaxP(n)}>
                  <Text style={[styles.chipText, maxP === n && styles.chipTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locBusy}>
          {locBusy
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={styles.locBtnText}>{locName ? `📍 ${locName}` : '📍 Add my location'}</Text>
          }
        </Pressable>

        <TextInput
          style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
          placeholder="Notes (optional)"
          placeholderTextColor={Colors.muted}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={200}
        />

        <Pressable style={[styles.createEventBtn, saving && styles.disabled]} onPress={handleCreate} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createEventText}>Create Event</Text>}
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title:      { fontSize: 24, fontWeight: '800', color: Colors.text },
  createBtn:  { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  createText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabBar:     { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 8, alignItems: 'center',
  },
  tabActive:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  tabText:       { color: Colors.muted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText:  { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list:       { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 26 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  cardWhen:  { fontSize: 13, color: Colors.primary, marginTop: 2, fontWeight: '600' },
  joinBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16, minWidth: 74, alignItems: 'center',
  },
  joinedBtn:  { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  joinText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  joinedText: { color: Colors.muted },
  disabled:   { opacity: 0.5 },
  cardMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  metaText:   { fontSize: 12, color: Colors.muted },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36, gap: 12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  input: {
    backgroundColor: Colors.surfaceHigh, borderRadius: 12, padding: 12,
    fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  chipSm: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  chipActive:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  chipText:       { color: Colors.muted, fontSize: 13 },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  rowSplit:   { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  miniLabel:  { fontSize: 12, color: Colors.muted, fontWeight: '600', marginBottom: 6 },
  locBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  locBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  createEventBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 4,
  },
  createEventText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
