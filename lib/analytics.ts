// ============================================================
// GymStride — Monitoring (crash reporting + product analytics)
// ------------------------------------------------------------
// Single provider-agnostic surface for the rest of the app:
//   • captureError() / captureMessage()  → Sentry
//   • track() / identify() / reset()      → PostHog
//   • addBreadcrumb()                      → Sentry breadcrumbs
//
// Everything is guarded by env vars. If EXPO_PUBLIC_SENTRY_DSN /
// EXPO_PUBLIC_POSTHOG_KEY are unset (e.g. local dev without keys)
// the calls become no-ops — the app never crashes for lack of a key.
// ============================================================
import * as Sentry from '@sentry/react-native'
import PostHog from 'posthog-react-native'

const SENTRY_DSN    = process.env.EXPO_PUBLIC_SENTRY_DSN    ?? ''
const POSTHOG_KEY   = process.env.EXPO_PUBLIC_POSTHOG_KEY   ?? ''
const POSTHOG_HOST  = process.env.EXPO_PUBLIC_POSTHOG_HOST  ?? 'https://us.i.posthog.com'
const ENVIRONMENT   = __DEV__ ? 'development' : 'production'

// Typed as any: the concrete PostHog type comes from the native package
// once installed; the ambient shim declares the module loosely until then.
let posthog: any = null

// Analytics event names live in one place so screens can't typo them.
export type AnalyticsEvent =
  | 'app_opened'
  | 'signed_up'
  | 'onboarding_completed'
  | 'workout_logged'
  | 'badge_earned'
  | 'chat_request_sent'
  | 'chat_request_accepted'
  | 'message_sent'
  | 'user_blocked'
  | 'user_reported'
  | 'location_updated'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'discovery_viewed'
  | 'map_view_opened'
  | 'healthkit_imported'
  | 'event_created'
  | 'event_joined'

/**
 * Initialise Sentry + PostHog. Call once, as early as possible in
 * the app lifecycle (module scope of the root layout).
 */
export function initMonitoring(): void {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn:                SENTRY_DSN,
      environment:        ENVIRONMENT,
      // Performance tracing — keep low in prod to control quota
      tracesSampleRate:   __DEV__ ? 1.0 : 0.2,
      // Do not send events while developing unless a DSN is explicitly set
      enabled:            true,
      attachStacktrace:   true,
    })
  }

  if (POSTHOG_KEY) {
    posthog = new PostHog(POSTHOG_KEY, {
      host:                       POSTHOG_HOST,
      // Flush a little more eagerly on mobile so events aren't lost on cold kills
      flushAt:                    20,
      flushInterval:              10_000,
    })
  }
}

/** Product-analytics event. Silently ignored if PostHog isn't configured. */
export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  try {
    posthog?.capture(event, properties)
  } catch {
    // analytics must never break a user flow
  }
  // Mirror as a Sentry breadcrumb so crash reports carry the funnel context
  addBreadcrumb(event, properties)
}

/** Associate all future events + errors with a user id. */
export function identify(userId: string, traits?: Record<string, unknown>): void {
  try {
    posthog?.identify(userId, traits)
  } catch {}
  if (SENTRY_DSN) Sentry.setUser({ id: userId })
}

/** Clear user association (call on sign-out). */
export function resetUser(): void {
  try {
    posthog?.reset()
  } catch {}
  if (SENTRY_DSN) Sentry.setUser(null)
}

/** Record a non-fatal error with optional context. Use instead of silent catches. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) console.error('[monitoring]', error, context)
  if (!SENTRY_DSN) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

/** Record a message-level event (e.g. an unexpected-but-handled state). */
export function captureMessage(message: string, context?: Record<string, unknown>): void {
  if (__DEV__) console.warn('[monitoring]', message, context)
  if (!SENTRY_DSN) return
  Sentry.captureMessage(message, context ? { extra: context } : undefined)
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return
  Sentry.addBreadcrumb({ message, data, level: 'info' })
}

/**
 * Wrap the root component for automatic error-boundary + native crash
 * capture. No-op passthrough when Sentry isn't configured.
 */
export function wrapRoot<P extends React.ComponentType<any>>(Root: P): P {
  return SENTRY_DSN ? (Sentry.wrap(Root as any) as P) : Root
}
