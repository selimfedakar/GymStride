import { View, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'

interface Props {
  total:   number
  current: number
}

export function StepProgress({ total, current }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < current ? styles.done : i === current ? styles.active : styles.idle,
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap:            8,
    justifyContent: 'center',
    marginBottom:  32,
  },
  dot: {
    height:       4,
    flex:         1,
    borderRadius: 2,
  },
  done:   { backgroundColor: Colors.primary },
  active: { backgroundColor: Colors.primary },
  idle:   { backgroundColor: Colors.border },
})
