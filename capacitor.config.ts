import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.kudafellas.ipporderflow',
  appName: 'IPP-OrderFlow',
  // Still required by `cap sync`, but unused at runtime while `server.url` is set.
  webDir: 'dist',
  server: {
    // The APK is a shell around the live web app: it loads this URL instead of
    // a bundled copy, so a web deploy (build + scp) updates phones too — no APK
    // reinstall for web-code changes. Rebuild the APK only for native changes
    // (permissions, icon, app name, plugins). The origin is the real site, which
    // prod Directus's CORS_ORIGIN already allows. Needs internet to open.
    url: 'https://app.kudafellas.cloud',
  },
};

export default config;
