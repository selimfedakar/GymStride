import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { getProPackages, purchasePro, restorePro, type ProPackage } from '@/lib/purchases'
import { useProStore } from '@/store/pro'
import { Colors } from '@/constants/colors'
import { track, captureError } from '@/lib/analytics'

const BENEFITS: { icon: string; title: string; body: string }[] = [
  { icon: '💬', title: 'Unlimited requests',    body: 'No 5-a-day cap — reach out to every buddy you find.' },
  { icon: '🎯', title: 'Advanced filters',      body: 'Filter by experience, pace, age and same-campus.' },
  { icon: '👀', title: 'See who viewed you',     body: 'Know who checked out your profile.' },
  { icon: '⚡', title: 'Priority discovery',    body: 'Your profile ranks higher in nearby results.' },
]

export default function PaywallScreen() {
  const router = useRouter()
  const setPro = useProStore((s) => s.setPro)

  const [packages, setPackages] = useState<ProPackage[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    track('paywall_viewed')
    getProPackages().then((p) => {
      setPackages(p)
      if (p.length > 0) setSelected(p[0].identifier)
      setLoading(false)
    })
  }, [])

  async function handlePurchase() {
    const pkg = packages.find((p) => p.identifier === selected)
    if (!pkg) return
    setBusy(true)
    track('purchase_started', { package: pkg.identifier })
    try {
      const ok = await purchasePro(pkg)
      if (ok) {
        setPro(true)
        track('purchase_completed', { package: pkg.identifier })
        Alert.alert('Welcome to Pro 🎉', 'All Pro features are now unlocked.')
        router.back()
      }
    } catch (e: any) {
      // RevenueCat surfaces user cancellation as userCancelled — don't alarm on that
      if (!e?.userCancelled) {
        captureError(e, { where: 'paywall.purchase' })
        Alert.alert('Purchase failed', 'Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const ok = await restorePro()
      setPro(ok)
      Alert.alert(ok ? 'Restored ✓' : 'Nothing to restore',
        ok ? 'Your Pro subscription is active again.' : 'No previous purchases were found.')
      if (ok) router.back()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title:           'GymStride Pro',
          headerShown:     true,
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle:{ fontWeight: '700' },
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.hero}>Train without limits</Text>
        <Text style={styles.heroSub}>Upgrade to GymStride Pro</Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{b.icon}</Text>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : packages.length === 0 ? (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>
              Subscriptions aren't available right now. Please check back soon.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.packages}>
              {packages.map((p) => (
                <Pressable
                  key={p.identifier}
                  style={[styles.package, selected === p.identifier && styles.packageActive]}
                  onPress={() => setSelected(p.identifier)}
                >
                  <View style={styles.pkgLeft}>
                    <Text style={styles.pkgTitle}>{p.title}</Text>
                    {!!p.description && <Text style={styles.pkgDesc}>{p.description}</Text>}
                  </View>
                  <Text style={styles.pkgPrice}>{p.priceString}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.cta, busy && styles.disabled]}
              onPress={handlePurchase}
              disabled={busy || !selected}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaText}>Start GymStride Pro</Text>
              }
            </Pressable>
          </>
        )}

        <Pressable style={styles.restore} onPress={handleRestore} disabled={busy}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.legal}>
          Payment is charged to your App Store account. Subscriptions auto-renew
          unless cancelled at least 24 hours before the end of the period. Manage
          or cancel anytime in your App Store settings.
        </Text>
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { padding: 24, paddingBottom: 48 },
  hero:      { fontSize: 28, fontWeight: '900', color: Colors.text, textAlign: 'center', marginTop: 8 },
  heroSub:   { fontSize: 15, color: Colors.primary, textAlign: 'center', marginTop: 4, marginBottom: 28, fontWeight: '600' },
  benefits:  { gap: 16 },
  benefitRow:  { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  benefitIcon: { fontSize: 26, width: 34, textAlign: 'center' },
  benefitText: { flex: 1 },
  benefitTitle:{ fontSize: 16, fontWeight: '700', color: Colors.text },
  benefitBody: { fontSize: 13, color: Colors.muted, marginTop: 2, lineHeight: 18 },
  packages:  { marginTop: 28, gap: 10 },
  package: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  packageActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  pkgLeft:  { flex: 1 },
  pkgTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pkgDesc:  { fontSize: 12, color: Colors.muted, marginTop: 2 },
  pkgPrice: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  cta: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 20,
  },
  ctaText:  { color: '#fff', fontSize: 17, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  unavailable: {
    marginTop: 24, padding: 18, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  unavailableText: { color: Colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  restore:     { alignItems: 'center', marginTop: 20 },
  restoreText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  legal:       { fontSize: 11, color: Colors.muted, textAlign: 'center', marginTop: 24, lineHeight: 16 },
})
