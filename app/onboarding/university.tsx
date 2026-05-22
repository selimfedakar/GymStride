import { useState, useCallback } from 'react'
import {
  View, Text, TextInput, Pressable, FlatList,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { searchUniversities, updateProfile } from '@/lib/queries/profile'
import { useAuthStore } from '@/store/auth'
import { StepProgress } from '@/components/StepProgress'
import { Colors } from '@/constants/colors'
import type { University } from '@/types/database'

export default function OnboardingUniversityScreen() {
  const router     = useRouter()
  const session    = useAuthStore((s) => s.session)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<University[]>([])
  const [selected, setSelected] = useState<University | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text)
    if (text.length < 2) { setResults([]); return }
    setLoading(true)
    const unis = await searchUniversities(text).catch(() => [])
    setResults(unis)
    setLoading(false)
  }, [])

  async function handleNext() {
    setSaving(true)
    try {
      if (selected) {
        const updated = await updateProfile(session!.user.id, { university_id: selected.id })
        setProfile(updated)
      }
      router.push('/onboarding/badges')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <StepProgress total={4} current={1} />

      <Text style={styles.title}>Your university</Text>
      <Text style={styles.subtitle}>
        Step 2 of 4 — connect with people from your campus
      </Text>

      {selected ? (
        <Pressable style={styles.selectedCard} onPress={() => { setSelected(null); setQuery('') }}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.selectedCity}>{selected.city}, {selected.country}</Text>
          <Text style={styles.changeLink}>Tap to change</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search universities..."
            placeholderTextColor={Colors.muted}
            value={query}
            onChangeText={handleSearch}
            autoFocus
          />

          {loading && <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.resultRow}
                onPress={() => { setSelected(item); setResults([]) }}
              >
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultCity}>{item.city}, {item.country}</Text>
              </Pressable>
            )}
          />
        </>
      )}

      <View style={styles.footer}>
        <Pressable style={styles.skipBtn} onPress={() => router.push('/onboarding/badges')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, saving && styles.btnDisabled]}
          onPress={handleNext}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Next →</Text>
          }
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
    padding:         24,
    paddingTop:      Platform.OS === 'ios' ? 60 : 40,
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
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    8,
  },
  list: {
    flex: 1,
  },
  resultRow: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    marginBottom:    8,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  resultName: {
    fontSize:    16,
    color:       Colors.text,
    fontWeight:  '600',
    marginBottom: 2,
  },
  resultCity: {
    fontSize: 13,
    color:    Colors.muted,
  },
  selectedCard: {
    backgroundColor: Colors.primary + '15',
    borderWidth:     1,
    borderColor:     Colors.primary,
    borderRadius:    14,
    padding:         20,
    marginBottom:    24,
  },
  selectedName: {
    fontSize:    18,
    fontWeight:  '700',
    color:       Colors.text,
    marginBottom: 4,
  },
  selectedCity: {
    fontSize:    14,
    color:       Colors.muted,
    marginBottom: 8,
  },
  changeLink: {
    fontSize:   13,
    color:      Colors.primary,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap:            12,
    marginTop:     24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  skipBtn: {
    flex:          1,
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  14,
    padding:       16,
    alignItems:    'center',
  },
  skipText: {
    color:    Colors.muted,
    fontSize: 16,
  },
  btn: {
    flex:            2,
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
})
