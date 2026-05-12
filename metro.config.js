const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

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
