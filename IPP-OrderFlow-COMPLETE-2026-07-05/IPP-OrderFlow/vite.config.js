import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamp the moment this build was produced, pinned to Jakarta time (WIB) so it reads the same no
// matter where the build runs (a teammate's laptop, CI in UTC, a build container). Surfaced in the
// sidebar so anyone can confirm at a glance which build the browser actually loaded — the antidote
// to "my new feature is missing" when a stale cached version is really being served.
let BUILD_TIME
try {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (type) => (parts.find((x) => x.type === type) || {}).value
  BUILD_TIME = `${g('day')}/${g('month')} ${g('hour')}:${g('minute')} WIB`
} catch {
  // ICU unavailable — fall back to build-machine local time.
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  BUILD_TIME = `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [
    react(),
    // Installable + offline app shell. A cold load with no signal now serves the app, not a
    // browser error, and staff can add it to their home screen. (Fully effective once served
    // over HTTPS — the hosting step.)
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new build does NOT silently reload the tab — main.jsx shows
      // a "Reload" banner the user taps when ready, so an order being typed is never lost.
      registerType: 'prompt',
      includeAssets: ['logo.png', 'logo.svg'],
      manifest: {
        name: 'IPP OrderFlow',
        short_name: 'OrderFlow',
        description: 'IPP order pipeline — Horeca B2B',
        theme_color: '#181816',
        background_color: '#181816',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, open: true },
})
