import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.kudafellas.ipporderflow',
  appName: 'IPP-OrderFlow',
  webDir: 'dist',
  server: {
    // The WebView serves the bundle from https://<hostname>, and that origin is
    // what Directus's CORS check sees. Using the web app's own domain means prod
    // Directus already allows it (CORS_ORIGIN) — the default `localhost` is not.
    // Side effect: in-app navigation to this domain is served from the bundle.
    hostname: 'app.kudafellas.cloud',
    androidScheme: 'https',
  },
};

export default config;
