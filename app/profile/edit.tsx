import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { Image } from 'expo-image'
import { Stack, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  updateProfile,
  upsertGymPreferences,
  upsertRunningPreferences,
  uploadProfilePhoto,
  fetchProfilePhotos,
} from '@/lib/queries/profile'
import { ProfilePhotos } from '@/components/ProfilePhotos'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Colors } from '@/constants/colors'
import type { ExperienceLevel, RunType, ProfilePhoto } from '@/types/database'

const EXPERIENCE: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced', 'elite']
const GYM_STYLES = ['Powerlifting', 'Bodybuilding', 'CrossFit', 'Calisthenics', 'Olympic Lifting', 'Kettlebell']
const RUN_TYPES: { label: string; value: RunType }[] = [
  { label: 'Long Runs',  value: 'long_run'  },
  { label: 'Short Runs', value: 'short_run' },
  { label: 'Sprints',    value: 'sprint'    },
]
const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7]

export default function EditProfileScreen() {
  const router     = useRouter()
  const { profile, setProfile, reset } = useAuthStore()

  const [fullName,    setFullName]    = useState(profile?.full_name     ?? '')
  const [username,    setUsername]    = useState(profile?.username      ?? '')
  const [bio,         setBio]         = useState(profile?.bio           ?? '')
  const [experience,  setExperience]  = useState<ExperienceLevel>(profile?.experience_level ?? 'beginner')
  const [photoUri,    setPhotoUri]    = useState<string | null>(profile?.profile_photo_url ?? null)
  const [photoChanged, setPhotoChanged] = useState(false)

  // Gym prefs (loaded lazily — pre-populated on first open via loadPrefs)
  const [gymFrequency,   setGymFrequency]   = useState<number | null>(null)
  const [gymStyles,      setGymStyles]      = useState<Set<string>>(new Set())

  // Running prefs
  const [runTypes,    setRunTypes]    = useState<Set<RunType>>(new Set())
  const [paceMin,     setPaceMin]     = useState('')
  const [paceSec,     setPaceSec]     = useState('')

  const [extraPhotos, setExtraPhotos] = useState<ProfilePhoto[]>([])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      fetchProfilePhotos(profile.id).then(setExtraPhotos).catch(() => null)
    }
  }, [profile?.id])

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
      setPhotoChanged(true)
    }
  }

  function toggleGymStyle(style: string) {
    setGymStyles((prev) => {
      const next = new Set(prev)
      next.has(style) ? next.delete(style) : next.add(style)
      return next
    })
  }

  function toggleRunType(type: RunType) {
    setRunTypes((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  async function handleSave() {
    setError(null)
    if (!fullName.trim() || !username.trim()) {
      setError('Name and username are required')
      return
    }
    setSaving(true)
    try {
      let photoUrl = profile?.profile_photo_url ?? null
      if (photoChanged && photoUri) {
        photoUrl = await uploadProfilePhoto(profile!.id, photoUri)
      }

      const updated = await updateProfile(profile!.id, {
        full_name:        fullName.trim(),
        username:         username.trim().toLowerCase(),
        bio:              bio.trim() || null,
        experience_level: experience,
        profile_photo_url: photoUrl,
      })
      setProfile(updated)

      if (gymFrequency !== null) {
        await upsertGymPreferences({
          profile_id:         profile!.id,
          frequency_per_week: gymFrequency,
          workout_styles:     gymStyles.size > 0 ? [...gymStyles] : undefined,
        })
      }

      if (runTypes.size > 0) {
        const paceSeconds = paceMin && paceSec
          ? parseInt(paceMin) * 60 + parseInt(paceSec)
          : undefined
        await upsertRunningPreferences({
          profile_id:              profile!.id,
          run_types:               [...runTypes],
          avg_pace_seconds_per_km: paceSeconds,
        })
      }

      router.back()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your profile, all chats, workout logs and badges. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('delete_my_account')
              if (error) throw error
              await supabase.auth.signOut()
              reset()
            } catch (e: any) {
              Alert.alert('Error', e.message)
            }
          },
        },
      ]
    )
  }

  const initial = (profile?.full_name ?? '?').charAt(0).toUpperCase()

  return (
    <>
      <Stack.Screen
        options={{
          title:           'Edit Profile',
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
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Avatar */}
        <Pressable style={styles.avatarWrap} onPress={pickPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
        </Pressable>

        {/* Extra photos */}
        <SectionDivider title="📸 Photos (max 3)" />
        <Text style={styles.photoHint}>Tap a slot to upload · tap ✕ to remove</Text>
        <ProfilePhotos
          profileId={profile!.id}
          photos={extraPhotos}
          editable
          onPhotosChange={setExtraPhotos}
        />

        {/* Basic info */}
        <Label text="Full Name" />
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ahmet Selim Fedakar"
          placeholderTextColor={Colors.muted}
        />

        <Label text="Username" />
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="yourhandle"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
        />

        <Label text="Bio" />
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people what drives you..."
          placeholderTextColor={Colors.muted}
          multiline
          maxLength={200}
        />
        <Text style={styles.charCount}>{bio.length}/200</Text>

        {/* Experience level */}
        <Label text="Experience Level" />
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

        {/* Gym preferences */}
        <SectionDivider title="🏋️ Gym Preferences" />

        <Label text="Days per week" />
        <View style={styles.chipRow}>
          {FREQUENCIES.map((f) => (
            <Pressable
              key={f}
              style={[styles.chip, gymFrequency === f && styles.chipActive]}
              onPress={() => setGymFrequency(f)}
            >
              <Text style={[styles.chipText, gymFrequency === f && styles.chipTextActive]}>{f}x</Text>
            </Pressable>
          ))}
        </View>

        <Label text="Workout styles" />
        <View style={styles.chipRow}>
          {GYM_STYLES.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, gymStyles.has(s) && styles.chipActive]}
              onPress={() => toggleGymStyle(s)}
            >
              <Text style={[styles.chipText, gymStyles.has(s) && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* Running preferences */}
        <SectionDivider title="🏃 Running Preferences" />

        <Label text="Run types" />
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

        <Label text="Average pace (optional)" />
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

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </Pressable>

        {/* Danger zone */}
        <View style={styles.dangerZone}>
          <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  )
}

function Label({ text }: { text: string }) {
  return (
    <Text style={styles.label}>{text}</Text>
  )
}

function SectionDivider({ title }: { title: string }) {
  return (
    <View style={styles.dividerRow}>
      <Text style={styles.dividerText}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: Colors.bg },
  container:  { padding: 24, paddingBottom: 48 },
  error: {
    color:        Colors.error,
    fontSize:     14,
    marginBottom: 16,
    backgroundColor: Colors.error + '15',
    padding:      12,
    borderRadius: 10,
  },
  avatarWrap: {
    alignSelf:    'center',
    marginBottom: 28,
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
    backgroundColor: Colors.primary + '30',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: Colors.primary },
  cameraOverlay: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: Colors.surface,
    borderWidth:     2,
    borderColor:     Colors.bg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  cameraIcon: { fontSize: 14 },
  label: {
    fontSize:      13,
    color:         Colors.muted,
    fontWeight:    '600',
    marginBottom:  6,
    marginTop:     16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         14,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { color: Colors.muted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      10,
    paddingVertical:   9,
    paddingHorizontal: 14,
  },
  chipActive:    { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  chipRunActive: { borderColor: Colors.running, backgroundColor: Colors.running + '20' },
  chipText:      { color: Colors.muted, fontSize: 14 },
  chipTextActive:{ color: Colors.primary, fontWeight: '600' },
  chipRunText:   { color: Colors.running, fontWeight: '600' },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paceInput: { width: 64, textAlign: 'center' },
  paceColon: { color: Colors.text, fontSize: 24, fontWeight: '300' },
  paceUnit:  { color: Colors.muted, fontSize: 15, marginLeft: 4 },
  photoHint: {
    fontSize: 12,
    color:    Colors.muted,
    marginTop: 2,
  },
  dividerRow: {
    marginTop:         28,
    marginBottom:      4,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
    paddingTop:        20,
  },
  dividerText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       32,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  dangerZone: {
    marginTop:     40,
    borderTopWidth: 1,
    borderTopColor: Colors.error + '30',
    paddingTop:    24,
  },
  deleteBtn: {
    borderWidth:  1,
    borderColor:  Colors.error,
    borderRadius: 14,
    padding:      16,
    alignItems:   'center',
  },
  deleteBtnText: {
    color:      Colors.error,
    fontSize:   16,
    fontWeight: '700',
  },
})
