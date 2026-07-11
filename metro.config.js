// getSentryExpoConfig wraps Expo's default Metro config so Sentry can
// upload source maps at build time. It is a drop-in for getDefaultConfig.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')
const path = require('path')

const config = getSentryExpoConfig(__dirname)

config.resolver.blockList = [
  new RegExp(`^${path.join(__dirname, 'supabase').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
  new RegExp(`^${path.join(__dirname, 'scripts').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
  /\.git\/.*/,
  /\.expo\/web-build\/.*/,
  /node_modules\/@types\/.*/,
  /node_modules\/typescript\/lib\/.*/,
  new RegExp(`^${path.join(__dirname, 'assets', 'seeds').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
  new RegExp(`^${path.join(__dirname, 'assets', 'fixtures').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
]

config.maxWorkers = 2

module.exports = config
