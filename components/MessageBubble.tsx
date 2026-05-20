import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'
import type { Message } from '@/types/database'

interface Props {
  message:     Message
  isMine:      boolean
  showTime?:   boolean
}

export function MessageBubble({ message, isMine, showTime }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
  })

  return (
    <View style={[styles.row, isMine && styles.rowMine]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
          {message.content}
        </Text>
      </View>
      {showTime && (
        <Text style={[styles.time, isMine && styles.timeRight]}>
          {time}{isMine && message.read_at ? ' · Seen' : ''}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems:   'flex-start',
    marginBottom: 4,
  },
  rowMine: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth:     '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  bubbleMine: {
    backgroundColor:          Colors.primary,
    borderBottomRightRadius:  4,
  },
  bubbleTheirs: {
    backgroundColor:         Colors.surface,
    borderWidth:             1,
    borderColor:             Colors.border,
    borderBottomLeftRadius:  4,
  },
  text:       { fontSize: 15, lineHeight: 21 },
  textMine:   { color: '#fff' },
  textTheirs: { color: Colors.text },
  time: {
    fontSize:  11,
    color:     Colors.muted,
    marginTop: 3,
    marginHorizontal: 4,
  },
  timeRight: { alignSelf: 'flex-end' },
})
