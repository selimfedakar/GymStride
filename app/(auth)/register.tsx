import { useState } from 'react'
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function RegisterScreen() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [sent,     setSent]     = useState(false)

  async function handleRegister() {
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    const { data, error: e } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (e) {
      setError(e.message)
      return
    }
    // Supabase may require email confirmation — session will be null until confirmed
    if (!data.session) setSent(true)
    // If session is returned, onAuthStateChange in _layout.tsx redirects to onboarding
  }

  if (sent) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 28 }]}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>📬</Text>
        <Text style={[styles.logo, { textAlign: 'center' }]}>Check your email</Text>
        <Text style={[styles.tagline, { textAlign: 'center' }]}>
          We sent a confirmation link to {email}. Open it to activate your account, then come back and sign in.
        </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable style={[styles.btn, { marginTop: 32 }]}>
            <Text style={styles.btnText}>Go to Sign In</Text>
          </Pressable>
        </Link>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>GymStride</Text>
        <Text style={styles.tagline}>Create your account</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          placeholderTextColor={Colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor={Colors.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Create Account</Text>
          }
        </Pressable>

        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Text style={[styles.linkText, styles.linkBold]}>Sign in</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flexGrow:       1,
    justifyContent: 'center',
    padding:        28,
  },
  logo: {
    fontSize:    36,
    fontWeight:  '800',
    color:       Colors.primary,
    marginBottom: 6,
  },
  tagline: {
    fontSize:    16,
    color:       Colors.muted,
    marginBottom: 40,
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
    marginBottom:    24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection:  'row',
    justifyContent: 'center',
  },
  linkText: {
    color:    Colors.muted,
    fontSize: 15,
  },
  linkBold: {
    color:      Colors.primary,
    fontWeight: '600',
  },
})
