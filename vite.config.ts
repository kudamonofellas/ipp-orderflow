import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Bind to all interfaces (not just localhost) so the dev server is
    // reachable from other devices on the same Tailscale network — e.g. a
    // phone browsing to http://<tailscale-ip>:3000.
    host: true,
    proxy: {
      '/order-api': {
        target: 'https://dev-admin.kudafellas.cloud',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})