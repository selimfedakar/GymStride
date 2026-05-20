import { useState } from 'react'
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSend() {
    if (!email.trim()) { setError('Please enter your email'); return }
    setError(null)
    setLoading(true)
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'gymstride://auth/callback',
    })
    setLoading(false)
    if (e) { setError(e.message); return }
    setSent(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Sign In</Text>
        </Pressable>

        <Text style={styles.title}>Reset Password</Text>

        {sent ? (
          <>
            <Text style={styles.sentTitle}>Check your email 📬</Text>
            <Text style={styles.sentText}>
              We sent a reset link to{'\n'}{email}{'\n\n'}Tap the link to set a new password.
            </Text>
            <Pressable style={styles.btn} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.btnText}>Back to Sign In</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter your account email and we'll send you a password reset link.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              autoFocus
            />

            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSend}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Send Reset Link</Text>
              }
            </Pressable>
          </>
        )}
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
  back: { marginBottom: 32 },
  backText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
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
  sentTitle: {
    fontSize:    24,
    fontWeight:  '700',
    color:       Colors.text,
    marginBottom: 12,
  },
  sentText: {
    fontSize:    15,
    color:       Colors.muted,
    lineHeight:  24,
    marginBottom: 36,
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
    marginBottom:    16,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
})
