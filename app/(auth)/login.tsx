import { useState } from 'react'
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function LoginScreen() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (e) setError(e.message)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>GymStride</Text>
        <Text style={styles.tagline}>Find your workout partner</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign In</Text>
          }
        </Pressable>

        <Pressable
          style={styles.forgotRow}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>

        <Link href="/(auth)/register" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <Text style={[styles.linkText, styles.linkBold]}>Sign up</Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flex:           1,
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
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color:      Colors.text,
    fontSize:   17,
    fontWeight: '700',
  },
  forgotRow: {
    alignItems:   'center',
    marginBottom: 12,
  },
  forgotText: {
    color:    Colors.muted,
    fontSize: 14,
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
