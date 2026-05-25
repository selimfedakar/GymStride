#!/usr/bin/env node
/**
 * dev-lt.js — Expo + localtunnel alternative to --tunnel/ngrok.
 *
 * Usage:  npm run dev:lt
 *
 * Flow:
 *   1. Opens a localtunnel forwarding to Metro on port 8081.
 *   2. Passes the lt hostname to Expo via REACT_NATIVE_PACKAGER_HOSTNAME so
 *      the generated QR code points to the tunnel URL, not the local LAN IP.
 *   3. Starts Metro with --clear to avoid a stale bundle cache.
 *      (Remove --clear after the first successful start to speed up restarts.)
 */

const { spawn } = require('child_process')
const localtunnel = require('localtunnel')

const PORT = 8081

async function main() {
  console.log(`\n[lt] Opening tunnel → localhost:${PORT} …`)

  let tunnel
  try {
    tunnel = await localtunnel({ port: PORT })
  } catch (err) {
    console.error('[lt] Could not open tunnel:', err.message)
    process.exit(1)
  }

  const ltUrl      = tunnel.url                        // https://abc123.loca.lt
  const ltHostname = ltUrl.replace(/^https?:\/\//, '') // abc123.loca.lt

  console.log(`[lt] Tunnel: ${ltUrl}`)
  console.log(`[lt] Scan the QR code in Expo Go — bundle will arrive through the tunnel.\n`)

  const expo = spawn(
    'npx',
    ['expo', 'start', '--port', String(PORT), '--clear'],
    {
      env:   { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ltHostname },
      stdio: 'inherit',
      shell: true,
    }
  )

  tunnel.on('close', () => {
    console.error('\n[lt] Tunnel closed unexpectedly. Run npm run dev:lt again.')
    expo.kill()
    process.exit(1)
  })

  tunnel.on('error', (err) => {
    console.error('[lt] Tunnel error:', err.message)
  })

  const cleanup = () => { tunnel.close(); expo.kill(); process.exit(0) }
  process.on('SIGINT',  cleanup)
  process.on('SIGTERM', cleanup)

  expo.on('exit', (code) => { tunnel.close(); process.exit(code ?? 0) })
}

main().catch((err) => { console.error('[lt] Fatal:', err.message); process.exit(1) })
