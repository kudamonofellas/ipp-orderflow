// Geolocation helpers. STAMPING (getPosition) works today and is stored on the order.
// LIVE tracking (watchPosition) runs on the courier's device now; seeing it from the office
// in real time is cross-device and needs the realtime backend — this is the device-side half,
// already shaped to push to a server later. Geolocation needs a secure context (HTTPS/localhost)
// and user consent; callers should catch and degrade gracefully if denied/unavailable.
const shape = (p) => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  acc: p.coords.accuracy,
  heading: p.coords.heading,
  speed: p.coords.speed,
  at: new Date().toISOString(),
})

export function getPosition(opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation not supported'))
    navigator.geolocation.getCurrentPosition((p) => resolve(shape(p)), reject, opts)
  })
}

// Calls onUpdate on every position change; returns a stop() function. (Backend step: also
// push each update to the server so the office map can subscribe.)
export function watchPosition(onUpdate, onError, opts = { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }) {
  if (!('geolocation' in navigator)) { onError && onError(new Error('Geolocation not supported')); return () => {} }
  const id = navigator.geolocation.watchPosition((p) => onUpdate(shape(p)), (e) => onError && onError(e), opts)
  return () => navigator.geolocation.clearWatch(id)
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`
// Keyless Google Maps embed (basic place view) — no API key needed for the foundation.
export const mapEmbed = (lat, lng) => `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`
