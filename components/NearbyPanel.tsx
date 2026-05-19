import { useState } from 'react'
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Dimensions, Image,
} from 'react-native'
import { Colors } from '@/constants/colors'

const { width } = Dimensions.get('window')
const PANEL_WIDTH = Math.floor(width * 0.52)

export interface NearbyProfile {
  profile_id:        string
  full_name:         string
  distance_km:       number
  profile_photo_url?: string | null
}

interface Props {
  profiles:       NearbyProfile[]
  accentColor?:   string
  onProfilePress: (profile: NearbyProfile) => void
}

export function NearbyPanel({ profiles, accentColor = Colors.primary, onProfilePress }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (profiles.length === 0) return null

  const shown = profiles.slice(0, 5)

  return (
    <View style={[styles.container, { width: PANEL_WIDTH }]} pointerEvents="box-none">
      {/* Header chip */}
      <Pressable
        style={[styles.header, { borderColor: accentColor + '50' }]}
        onPress={() => setExpanded((e) => !e)}
      >
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Text style={styles.headerText}>Nearby ({profiles.length})</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {/* Profile list */}
      {expanded && (
        <View style={styles.list}>
          {shown.map((p) => (
            <Pressable key={p.profile_id} style={styles.row} onPress={() => onProfilePress(p)}>
              {p.profile_photo_url ? (
                <Image source={{ uri: p.profile_photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: accentColor + '30' }]}>
                  <Text style={[styles.initial, { color: accentColor }]}>
                    {p.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.full_name.split(' ')[0]}
                </Text>
                <Text style={styles.dist}>{p.distance_km.toFixed(1)} km</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position:        'absolute',
    top:              0,
    right:            0,
    zIndex:           10,
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              6,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderTopWidth:  0,
    borderRightWidth: 0,
    borderBottomLeftRadius:  12,
    paddingVertical:  8,
    paddingHorizontal: 12,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  headerText: {
    flex:       1,
    color:      Colors.text,
    fontSize:   13,
    fontWeight: '600',
  },
  chevron: {
    color:    Colors.muted,
    fontSize: 10,
  },
  list: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 12,
    borderLeftWidth:  1,
    borderBottomWidth: 1,
    borderColor:      Colors.border,
    paddingVertical:  4,
  },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              10,
    paddingVertical:  9,
    paddingHorizontal: 12,
  },
  avatar: {
    width:        34,
    height:       34,
    borderRadius: 17,
  },
  avatarFallback: {
    width:          34,
    height:         34,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize:   14,
    fontWeight: '700',
  },
  info: { flex: 1 },
  name: {
    color:      Colors.text,
    fontSize:   13,
    fontWeight: '600',
  },
  dist: {
    color:    Colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
})
