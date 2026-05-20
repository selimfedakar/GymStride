import { useState } from 'react'
import {
  View, Image, Pressable, Text, StyleSheet,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { fetchProfilePhotos, upsertProfilePhoto, deleteProfilePhoto } from '@/lib/queries/profile'
import { Colors } from '@/constants/colors'
import type { ProfilePhoto } from '@/types/database'

const { width } = Dimensions.get('window')
const SLOT_SIZE = Math.floor((width - 48 - 16) / 3)  // 3 slots, 24px side padding, 8px gaps

interface Props {
  profileId: string
  photos: ProfilePhoto[]
  editable?: boolean
  onPhotosChange?: (photos: ProfilePhoto[]) => void
}

export function ProfilePhotos({ profileId, photos, editable = false, onPhotosChange }: Props) {
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null)

  async function pickAndUpload(position: number) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    setLoadingSlot(position)
    try {
      const photo = await upsertProfilePhoto(profileId, result.assets[0].uri, position)
      const updated = await fetchProfilePhotos(profileId)
      onPhotosChange?.(updated)
    } catch (e: any) {
      Alert.alert('Upload failed', e.message)
    } finally {
      setLoadingSlot(null)
    }
  }

  async function handleDelete(position: number) {
    Alert.alert('Remove photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLoadingSlot(position)
          try {
            await deleteProfilePhoto(profileId, position)
            const updated = await fetchProfilePhotos(profileId)
            onPhotosChange?.(updated)
          } catch (e: any) {
            Alert.alert('Error', e.message)
          } finally {
            setLoadingSlot(null)
          }
        },
      },
    ])
  }

  const slots = [0, 1, 2]

  if (!editable && photos.length === 0) return null

  return (
    <View style={styles.container}>
      {slots.map((pos) => {
        const photo = photos.find((p) => p.position === pos)
        const isLoading = loadingSlot === pos

        if (!editable && !photo) return null

        return (
          <Pressable
            key={pos}
            style={styles.slot}
            onPress={editable ? () => pickAndUpload(pos) : undefined}
            onLongPress={editable && photo ? () => handleDelete(pos) : undefined}
            disabled={!editable || isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingSlot}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : photo ? (
              <>
                <Image source={{ uri: photo.url }} style={styles.photo} />
                {editable && (
                  <Pressable style={styles.deleteBtn} onPress={() => handleDelete(pos)}>
                    <Text style={styles.deleteIcon}>✕</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <View style={styles.emptySlot}>
                <Text style={styles.plus}>+</Text>
                <Text style={styles.slotHint}>Photo {pos + 1}</Text>
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap:            8,
    marginVertical: 16,
  },
  slot: {
    width:        SLOT_SIZE,
    height:       Math.floor(SLOT_SIZE * 4 / 3),
    borderRadius: 12,
    overflow:     'hidden',
  },
  photo: {
    width:  '100%',
    height: '100%',
  },
  loadingSlot: {
    width:           '100%',
    height:          '100%',
    backgroundColor: Colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    12,
  },
  emptySlot: {
    width:           '100%',
    height:          '100%',
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    12,
    borderStyle:     'dashed',
    alignItems:      'center',
    justifyContent:  'center',
    gap:              4,
  },
  plus:     { fontSize: 24, color: Colors.muted },
  slotHint: { fontSize: 11, color: Colors.muted },
  deleteBtn: {
    position:        'absolute',
    top:              6,
    right:            6,
    width:            22,
    height:           22,
    borderRadius:     11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  deleteIcon: { color: '#fff', fontSize: 11, fontWeight: '700' },
})
