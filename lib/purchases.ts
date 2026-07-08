// ============================================================
// GymStride — In-app purchases (RevenueCat)
// ------------------------------------------------------------
// Thin wrapper over react-native-purchases. Everything is guarded by
// the platform API key: if EXPO_PUBLIC_REVENUECAT_*_KEY is unset the
// module is a no-op (isPro → false, offerings → []), so the app runs
// fine in dev / on the simulator without StoreKit configured.
// ============================================================
import { Platform } from 'react-native'
import Purchases from 'react-native-purchases'
import { captureError } from './analytics'

const IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? ''
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''

// The entitlement identifier configured in the RevenueCat dashboard.
export const PRO_ENTITLEMENT = 'pro'

let configured = false

function apiKey(): string {
  return Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY
}

/** Configure the SDK once, associating the RevenueCat user with our profile id. */
export function configurePurchases(userId?: string): void {
  if (configured || !apiKey()) return
  try {
    Purchases.configure({ apiKey: apiKey(), appUserID: userId })
    configured = true
  } catch (e) {
    captureError(e, { where: 'purchases.configure' })
  }
}

export function purchasesReady(): boolean {
  return configured
}

/** Whether the current user has an active Pro entitlement. */
export async function isProActive(): Promise<boolean> {
  if (!configured) return false
  try {
    const info = await Purchases.getCustomerInfo()
    return !!info?.entitlements?.active?.[PRO_ENTITLEMENT]
  } catch (e) {
    captureError(e, { where: 'purchases.isProActive' })
    return false
  }
}

export interface ProPackage {
  identifier:    string
  priceString:   string
  title:         string
  description:   string
  raw:           any   // the underlying RevenueCat package, passed back to purchase()
}

/** The packages in the current "pro" offering, normalised for the paywall UI. */
export async function getProPackages(): Promise<ProPackage[]> {
  if (!configured) return []
  try {
    const offerings = await Purchases.getOfferings()
    const current = offerings?.current
    if (!current) return []
    return (current.availablePackages ?? []).map((p: any) => ({
      identifier:  p.identifier,
      priceString: p.product?.priceString ?? '',
      title:       p.product?.title ?? 'GymStride Pro',
      description: p.product?.description ?? '',
      raw:         p,
    }))
  } catch (e) {
    captureError(e, { where: 'purchases.getProPackages' })
    return []
  }
}

/** Returns true if the purchase resulted in an active Pro entitlement. */
export async function purchasePro(pkg: ProPackage): Promise<boolean> {
  if (!configured) return false
  const { customerInfo } = await Purchases.purchasePackage(pkg.raw)
  return !!customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT]
}

/** Restore prior purchases (App Store requirement). Returns Pro status. */
export async function restorePro(): Promise<boolean> {
  if (!configured) return false
  try {
    const info = await Purchases.restorePurchases()
    return !!info?.entitlements?.active?.[PRO_ENTITLEMENT]
  } catch (e) {
    captureError(e, { where: 'purchases.restorePro' })
    return false
  }
}
