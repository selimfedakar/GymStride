// ============================================================
// Ambient module shims
// ------------------------------------------------------------
// These native packages are declared in package.json but may not
// be installed yet on every machine (they require `expo install`
// + a dev-client rebuild). Declaring them here lets `tsc --noEmit`
// pass in a fresh checkout. Once the real package is installed its
// bundled types take precedence over these loose fallbacks.
// Delete an entry after confirming the package + its types resolve.
// ============================================================

declare module '@sentry/react-native'
declare module 'posthog-react-native'
declare module 'react-native-purchases'
declare module 'react-native-maps'
declare module 'react-native-svg'
declare module '@kingstinct/react-native-healthkit'
declare module '@bacons/apple-targets'
