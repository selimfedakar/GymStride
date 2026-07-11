/** @type {import('@bacons/apple-targets').Config} */
// Streak home-screen widget target. Built by @bacons/apple-targets during
// `expo prebuild`. Reads the shared app-group defaults written from JS
// (see lib/widget.ts) so the widget shows the current 🔥 streak.
module.exports = {
  type: 'widget',
  name: 'GymStride Streak',
  icon: '../../assets/icon.png',
  colors: {
    $accent: '#FF6B35',
  },
  entitlements: {
    'com.apple.security.application-groups': ['group.com.selimfedakar.gymstride'],
  },
}
