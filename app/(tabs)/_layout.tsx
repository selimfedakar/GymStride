import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'
import { useUnreadCount } from '@/hooks/useUnreadCount'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarStyle:             { backgroundColor: Colors.surface, borderTopColor: Colors.border },
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle:        { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="gym"
        options={{ title: 'Gym', tabBarIcon: ({ color }) => <TabIcon emoji="🏋️" color={color} /> }}
      />
      <Tabs.Screen
        name="running"
        options={{ title: 'Running', tabBarIcon: ({ color }) => <TabIcon emoji="🏃" color={color} /> }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => (
            <View style={[logIcon.circle, focused && logIcon.circleActive]}>
              <Text style={logIcon.plus}>+</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: ({ color }) => <MessagesIcon color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  )
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return (
    <Text style={{ fontSize: 20, opacity: color === Colors.primary ? 1 : 0.5 }}>
      {emoji}
    </Text>
  )
}

function MessagesIcon({ color }: { color: string }) {
  const unread = useUnreadCount()
  return (
    <View>
      <TabIcon emoji="💬" color={color} />
      {unread > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </View>
  )
}

const badge = StyleSheet.create({
  dot: {
    position:         'absolute',
    top:              -4,
    right:            -8,
    backgroundColor:  Colors.error,
    borderRadius:     8,
    minWidth:         16,
    height:           16,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 3,
  },
  text: { color: '#fff', fontSize: 9, fontWeight: '700' },
})

const logIcon = StyleSheet.create({
  circle: {
    width:           30,
    height:          30,
    borderRadius:    15,
    backgroundColor: Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  circleActive: {
    backgroundColor: Colors.primary,
  },
  plus: {
    color:      '#fff',
    fontSize:   20,
    fontWeight: '700',
    lineHeight: 22,
  },
})
