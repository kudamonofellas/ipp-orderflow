// Bridge between the service-worker registration (main.jsx) and the React <UpdateBanner>.
// We deliberately DO NOT auto-reload when a new build is ready: a forced reload would wipe an
// order a staff member is mid-way through typing (the intake form lives in React state and is
// only persisted on submit). Instead we surface a banner and reload ONLY when the user clicks.
let applyFn = () => {}
let listener = null

// main.jsx hands us the "apply the update + reload" function from registerSW().
export function registerApply(fn) { applyFn = fn }
export function applyUpdate() { applyFn() }

// <UpdateBanner> subscribes; main.jsx fires when a new build has finished downloading.
export function setUpdateListener(fn) { listener = fn }
export function notifyUpdateReady() { if (listener) listener() }
