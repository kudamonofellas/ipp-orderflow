// Human-readable build stamp, shown in the sidebar footer. In a production build this is the
// `npm run build` time (changes every build, so a stale cache is instantly obvious); in dev it's
// prefixed "dev ·" because HMR keeps the running app fresh regardless of this timestamp.
export const BUILD_TIME =
  (import.meta.env.DEV ? 'dev · ' : '') +
  (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '')
