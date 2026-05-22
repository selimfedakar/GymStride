import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { createProfile, uploadProfilePhoto, updateProfile } from '@/lib/queries/profile'
import { useAuthStore } from '@/store/auth'
import { StepProgress } from '@/components/StepProgress'
import { Colors } from '@/constants/colors'
import type { GenderType } from '@/types/database'

const GENDERS: { label: string; value: GenderType }[] = [
  { label: 'Male',           value: 'male' },
  { label: 'Female',         value: 'female' },
  { label: 'Non-binary',     value: 'non_binary' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
]

export default function OnboardingProfileScreen() {
  const router  = useRouter()
  const session = useAuthStore((s) => s.session)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [username,  setUsername]  = useState('')
  const [fullName,  setFullName]  = useState('')
  const [dobDay,    setDobDay]    = useState('')
  const [dobMonth,  setDobMonth]  = useState('')
  const [dobYear,   setDobYear]   = useState('')
  const [gender,    setGender]    = useState<GenderType | null>(null)
  const [photoUri,  setPhotoUri]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
  }

  async function handleNext() {
    setError(null)

    if (!username.trim() || !fullName.trim() || !dobDay || !dobMonth || !dobYear || !gender) {
      setError('All fields are required')
      return
    }
    const day = parseInt(dobDay, 10), month = parseInt(dobMonth, 10), year = parseInt(dobYear, 10)
    const maxYear = new Date().getFullYear() - 13
    if (isNaN(day) || day < 1 || day > 31 || isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 1900 || year > maxYear) {
      setError('Please enter a valid date of birth (must be 13+)')
      return
    }
    const dob = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`

    setLoading(true)
    try {
      let profile = await createProfile({
        id:            session!.user.id,
        username:      username.trim().toLowerCase(),
        full_name:     fullName.trim(),
        date_of_birth: dob,
        gender,
      })

      if (photoUri) {
        const url = await uploadProfilePhoto(profile.id, photoUri).catch(() => null)
        if (url) {
          profile = await updateProfile(profile.id, { profile_photo_url: url })
        }
      }

      setProfile(profile)
      router.push('/onboarding/university')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <StepProgress total={4} current={0} />

      <Text style={styles.title}>Build your profile</Text>
      <Text style={styles.subtitle}>Step 1 of 4 — the basics</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Avatar picker */}
      <Pressable style={styles.avatarWrap} onPress={pickPhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarIcon}>📷</Text>
          </View>
        )}
        <View style={styles.cameraBadge}>
          <Text style={styles.cameraIcon}>+</Text>
        </View>
      </Pressable>

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        placeholder="@yourhandle"
        placeholderTextColor={Colors.muted}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Ahmet Selim Fedakar"
        placeholderTextColor={Colors.muted}
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Date of Birth</Text>
      <View style={styles.dobRow}>
        <View style={styles.dobFieldSmall}>
          <Text style={styles.dobFieldLabel}>Day</Text>
          <TextInput
            style={[styles.input, styles.dobInput]}
            placeholder="DD"
            placeholderTextColor={Colors.muted}
            value={dobDay}
            onChangeText={(v) => { if (/^\d{0,2}$/.test(v)) setDobDay(v) }}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.dobFieldSmall}>
          <Text style={styles.dobFieldLabel}>Month</Text>
          <TextInput
            style={[styles.input, styles.dobInput]}
            placeholder="MM"
            placeholderTextColor={Colors.muted}
            value={dobMonth}
            onChangeText={(v) => { if (/^\d{0,2}$/.test(v)) setDobMonth(v) }}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.dobFieldYear}>
          <Text style={styles.dobFieldLabel}>Year</Text>
          <TextInput
            style={[styles.input, styles.dobInput]}
            placeholder="YYYY"
            placeholderTextColor={Colors.muted}
            value={dobYear}
            onChangeText={(v) => { if (/^\d{0,4}$/.test(v)) setDobYear(v) }}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>

      <Text style={styles.label}>Gender</Text>
      <View style={styles.genderRow}>
        {GENDERS.map((g) => (
          <Pressable
            key={g.value}
            style={[styles.genderBtn, gender === g.value && styles.genderBtnActive]}
            onPress={() => setGender(g.value)}
          >
            <Text style={[styles.genderText, gender === g.value && styles.genderTextActive]}>
              {g.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleNext}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Next →</Text>
        }
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  container: {
    padding:    24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
    marginBottom: 32,
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
    fontSize:    13,
    color:       Colors.muted,
    fontWeight:  '600',
    marginBottom: 6,
    marginTop:   16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  dobRow: {
    flexDirection: 'row',
    gap:            8,
  },
  dobFieldSmall: { flex: 1 },
  dobFieldYear:  { flex: 2 },
  dobFieldLabel: {
    fontSize:    11,
    color:       Colors.muted,
    fontWeight:  '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dobInput: {
    textAlign: 'center',
    padding:    12,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  genderBtn: {
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  10,
    paddingVertical:   10,
    paddingHorizontal: 16,
  },
  genderBtnActive: {
    borderColor:     Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  genderText: {
    color:    Colors.muted,
    fontSize: 14,
  },
  genderTextActive: {
    color:      Colors.primary,
    fontWeight: '600',
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       32,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
  avatarWrap: {
    alignSelf:    'center',
    marginBottom: 24,
    marginTop:    8,
    position:     'relative',
  },
  avatar: {
    width:        88,
    height:       88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarIcon: { fontSize: 28 },
  cameraBadge: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           26,
    height:          26,
    borderRadius:    13,
    backgroundColor: Colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  cameraIcon: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 18 },
})
