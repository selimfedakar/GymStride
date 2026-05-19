import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'
import type { BadgeCategory } from '@/types/database'

interface Props {
  name:     string
  category: BadgeCategory
  small?:   boolean
}

const categoryColor: Record<BadgeCategory, string> = {
  gym:     Colors.primary,
  running: Colors.running,
  general: Colors.muted,
}

export function BadgePill({ name, category, small }: Props) {
  const color = categoryColor[category]
  return (
    <View style={[styles.pill, { borderColor: color }, small && styles.small]}>
      <Text style={[styles.text, { color }, small && styles.smallText]}>
        {name}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderWidth:   1,
    borderRadius:  20,
    paddingHorizontal: 10,
    paddingVertical:    4,
    marginRight:   6,
    marginBottom:  6,
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical:   2,
  },
  text: {
    fontSize:   13,
    fontWeight: '500',
  },
  smallText: {
    fontSize: 11,
  },
})
