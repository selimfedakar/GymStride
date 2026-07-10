import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Colors } from '@/constants/colors'
import type { BuddyPin } from '@/lib/queries/discovery'

interface Props {
  pins:        BuddyPin[]
  accent:      string
  onPinPress:  (profileId: string) => void
}

// Map view for discovery. Pin coordinates are already privacy-fuzzed
// server-side (≈1.1km cells) — we never receive precise locations.
export function BuddyMap({ pins, accent, onPinPress }: Props) {
  const region = useMemo(() => {
    if (pins.length === 0) return null
    const lats = pins.map((p) => p.lat)
    const lngs = pins.map((p) => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    return {
      latitude:       (minLat + maxLat) / 2,
      longitude:      (minLng + maxLng) / 2,
      // pad the deltas so pins aren't flush to the edges; floor avoids a 0-span
      latitudeDelta:  Math.max((maxLat - minLat) * 1.6, 0.05),
      longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.05),
    }
  }, [pins])

  if (!region) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🗺️</Text>
        <Text style={styles.emptyTitle}>No one to map yet</Text>
        <Text style={styles.emptyText}>
          Buddies with a location will appear here as approximate pins.
        </Text>
      </View>
    )
  }

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      userInterfaceStyle="dark"
      showsUserLocation
      showsMyLocationButton={false}
    >
      {pins.map((p) => (
        <Marker
          key={p.profile_id}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          onPress={() => onPinPress(p.profile_id)}
          title={p.full_name}
          description={`≈ ${p.distance_km} km away`}
          pinColor={accent}
        />
      ))}
    </MapView>
  )
}

const styles = StyleSheet.create({
  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 10,
  },
  emptyEmoji: { fontSize: 46 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText:  { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
