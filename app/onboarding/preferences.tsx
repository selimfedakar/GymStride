import { useState } from 'react'
import {
  View, Text, Pressable, ScrollView, TextInput,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { resolveGpsLocation, resolveCityLocation, LocationPermissionError } from '@/lib/location'
import { upsertGymPreferences, upsertRunningPreferences, updateProfile } from '@/lib/queries/profile'
import { useAuthStore } from '@/store/auth'
import { StepProgress } from '@/components/StepProgress'
import { Colors } from '@/constants/colors'
import type { RunType, ExperienceLevel, ProfileUpdate } from '@/types/database'

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7]
const EXPERIENCE: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced', 'elite']
const RUN_TYPES: { label: string; value: RunType }[] = [
  { label: 'Long Runs',  value: 'long_run'  },
  { label: 'Short Runs', value: 'short_run' },
  { label: 'Sprints',    value: 'sprint'    },
]

type ActiveTab = 'gym' | 'running' | 'both'

export default function OnboardingPreferencesScreen() {
  const router     = useRouter()
  const session    = useAuthStore((s) => s.session)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [activeTab,     setActiveTab]     = useState<ActiveTab>('both')
  const [frequency,     setFrequency]     = useState<number | null>(null)
  const [experience,    setExperience]    = useState<ExperienceLevel | null>(null)
  const [runTypes,      setRunTypes]      = useState<Set<RunType>>(new Set())
  const [paceMin,       setPaceMin]       = useState('')
  const [paceSec,       setPaceSec]       = useState('')
  const [locationName,  setLocationName]  = useState<string | null>(null)
  const [manualCity,    setManualCity]    = useState('')
  const [coords,        setCoords]        = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading,    setLocLoading]    = useState(false)
  const [locDenied,     setLocDenied]     = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  function toggleRunType(type: RunType) {
    setRunTypes((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  async function requestLocation() {
    setLocLoading(true)
    setLocDenied(false)
    setError(null)
    try {
      const r = await resolveGpsLocation()
      setCoords({ lat: r.lat, lng: r.lng })
      setLocationName(r.name)
    } catch (e) {
      // Denied permission (or a fix failure) → offer the manual-city path
      if (e instanceof LocationPermissionError) setLocDenied(true)
      else setLocDenied(true)
    }
    setLocLoading(false)
  }

  async function applyManualCity() {
    const city = manualCity.trim()
    if (!city) return
    setLocLoading(true)
    const r = await resolveCityLocation(city)
    if ('lat' in r) setCoords({ lat: r.lat, lng: r.lng })
    setLocationName(r.name)
    setLocLoading(false)
  }

  async function handleFinish() {
    if (!locationName) {
      setError('Please share or enter your location')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const userId = session!.user.id

      const profileUpdates: ProfileUpdate = {
        location_name:        locationName,
        experience_level:     experience ?? 'beginner',
        onboarding_completed: true,
      }
      if (coords) {
        profileUpdates.location = `POINT(${coords.lng} ${coords.lat})`
      }

      const updated = await updateProfile(userId, profileUpdates)
      setProfile(updated)

      if ((activeTab === 'gym' || activeTab === 'both') && frequency) {
        await upsertGymPreferences({ profile_id: userId, frequency_per_week: frequency })
      }

      if ((activeTab === 'running' || activeTab === 'both') && runTypes.size > 0) {
        const paceSeconds = paceMin && paceSec
          ? parseInt(paceMin) * 60 + parseInt(paceSec)
          : undefined
        await upsertRunningPreferences({
          profile_id:              userId,
          run_types:               [...runTypes],
          avg_pace_seconds_per_km: paceSeconds,
        })
      }

      router.replace('/(tabs)/gym')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <StepProgress total={4} current={3} />

      <Text style={styles.title}>Your preferences</Text>
      <Text style={styles.subtitle}>Step 4 of 4 — help us find the right buddies</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Activity type */}
      <Text style={styles.label}>I want to find</Text>
      <View style={styles.tabRow}>
        {(['gym', 'running', 'both'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, activeTab === t && styles.tabBtnActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'both' ? 'Both' : t === 'gym' ? '🏋️ Gym' : '🏃 Running'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Gym section */}
      {(activeTab === 'gym' || activeTab === 'both') && (
        <>
          <Text style={styles.label}>Gym days per week</Text>
          <View style={styles.chipRow}>
            {FREQUENCIES.map((f) => (
              <Pressable
                key={f}
                style={[styles.chip, frequency === f && styles.chipActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[styles.chipText, frequency === f && styles.chipTextActive]}>{f}x</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Experience level</Text>
          <View style={styles.chipRow}>
            {EXPERIENCE.map((e) => (
              <Pressable
                key={e}
                style={[styles.chip, experience === e && styles.chipActive]}
                onPress={() => setExperience(e)}
              >
                <Text style={[styles.chipText, experience === e && styles.chipTextActive]}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Running section */}
      {(activeTab === 'running' || activeTab === 'both') && (
        <>
          <Text style={styles.label}>Run types</Text>
          <View style={styles.chipRow}>
            {RUN_TYPES.map((rt) => (
              <Pressable
                key={rt.value}
                style={[styles.chip, runTypes.has(rt.value) && styles.chipRunActive]}
                onPress={() => toggleRunType(rt.value)}
              >
                <Text style={[styles.chipText, runTypes.has(rt.value) && styles.chipRunText]}>
                  {rt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Average pace (optional)</Text>
          <View style={styles.paceRow}>
            <TextInput
              style={[styles.input, styles.paceInput]}
              placeholder="mm"
              placeholderTextColor={Colors.muted}
              value={paceMin}
              onChangeText={setPaceMin}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.paceColon}>:</Text>
            <TextInput
              style={[styles.input, styles.paceInput]}
              placeholder="ss"
              placeholderTextColor={Colors.muted}
              value={paceSec}
              onChangeText={(v) => {
                const n = parseInt(v)
                if (v === '' || (n >= 0 && n <= 59)) setPaceSec(v)
              }}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.paceUnit}>/km</Text>
          </View>
        </>
      )}

      {/* Location */}
      <Text style={styles.label}>Location</Text>

      {locationName ? (
        <View style={styles.locationCard}>
          <Text style={styles.locationText}>📍 {locationName}</Text>
          <Pressable onPress={() => { setLocationName(null); setCoords(null); setLocDenied(false) }}>
            <Text style={styles.changeLink}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={[styles.locationBtn, locLoading && styles.btnDisabled]}
            onPress={requestLocation}
            disabled={locLoading}
          >
            {locLoading
              ? <ActivityIndicator color={Colors.primary} />
              : <Text style={styles.locationBtnText}>📍 Use my GPS location</Text>
            }
          </Pressable>

          {locDenied && (
            <View style={styles.deniedBox}>
              <Text style={styles.deniedTitle}>Location access denied</Text>
              <Text style={styles.deniedText}>
                Without GPS your profile won't appear in other people's discovery results. You can enter your city manually below.
              </Text>
              <View style={styles.manualRow}>
                <TextInput
                  style={[styles.input, styles.manualInput]}
                  placeholder="City or neighborhood"
                  placeholderTextColor={Colors.muted}
                  value={manualCity}
                  onChangeText={setManualCity}
                  returnKeyType="done"
                  onSubmitEditing={applyManualCity}
                />
                <Pressable
                  style={[styles.manualBtn, !manualCity.trim() && styles.btnDisabled]}
                  onPress={applyManualCity}
                  disabled={!manualCity.trim()}
                >
                  <Text style={styles.manualBtnText}>Use</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}

      <Pressable
        style={[styles.btn, saving && styles.btnDisabled]}
        onPress={handleFinish}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Start Finding Buddies 🎯</Text>
        }
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: {
    padding:       24,
    paddingTop:    Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
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
  error: {
    color:        Colors.error,
    fontSize:     14,
    marginBottom: 16,
    backgroundColor: Colors.error + '15',
    padding:      12,
    borderRadius: 10,
  },
  label: {
    fontSize:     13,
    color:        Colors.muted,
    fontWeight:   '600',
    marginBottom: 8,
    marginTop:    20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: {
    flex:        1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding:      12,
    alignItems:  'center',
  },
  tabBtnActive: {
    borderColor:     Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  tabText:       { color: Colors.muted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  10,
    paddingVertical:   9,
    paddingHorizontal: 16,
  },
  chipActive:    { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  chipRunActive: { borderColor: Colors.running, backgroundColor: Colors.running + '20' },
  chipText:      { color: Colors.muted, fontSize: 14 },
  chipTextActive:{ color: Colors.primary, fontWeight: '600' },
  chipRunText:   { color: Colors.running, fontWeight: '600' },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paceInput:  { width: 64 },
  paceColon:  { color: Colors.text, fontSize: 24, fontWeight: '300' },
  paceUnit:   { color: Colors.muted, fontSize: 15, marginLeft: 4 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  locationCard: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.primary,
  },
  locationText:    { color: Colors.text, fontSize: 15 },
  changeLink:      { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  locationBtn: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  locationBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  deniedBox: {
    marginTop:       12,
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderWidth:     1,
    borderColor:     Colors.error + '40',
    gap:             10,
  },
  deniedTitle: { color: Colors.error, fontSize: 14, fontWeight: '700' },
  deniedText:  { color: Colors.muted, fontSize: 13, lineHeight: 19 },
  manualRow:   { flexDirection: 'row', gap: 8 },
  manualInput: { flex: 1 },
  manualBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    12,
    paddingHorizontal: 18,
    justifyContent:  'center',
    alignItems:      'center',
  },
  manualBtnText: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         18,
    alignItems:      'center',
    marginTop:       32,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
})
