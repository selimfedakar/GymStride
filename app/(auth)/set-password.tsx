import { useState } from 'react'
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function SetPasswordScreen() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    if (password !== confirm)  { setError("Passwords don't match"); return }
    if (password.length < 8)   { setError('Password must be at least 8 characters'); return }
    setError(null)
    setLoading(true)
    const { error: e } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (e) { setError(e.message); return }
    router.replace('/')
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>New Password</Text>
        <Text style={styles.subtitle}>
          Choose a strong password for your GymStride account.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="New password (min 8 chars)"
          placeholderTextColor={Colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="next"
          autoFocus
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={Colors.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Save Password</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: {
    flex:           1,
    justifyContent: 'center',
    padding:        28,
  },
  title: {
    fontSize:    32,
    fontWeight:  '800',
    color:       Colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize:    15,
    color:       Colors.muted,
    lineHeight:  22,
    marginBottom: 32,
  },
  error: {
    color:        Colors.error,
    fontSize:     14,
    marginBottom: 12,
    backgroundColor: Colors.error + '15',
    padding:      12,
    borderRadius: 10,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    fontSize:        16,
    color:           Colors.text,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    12,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    marginTop:       8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
})
