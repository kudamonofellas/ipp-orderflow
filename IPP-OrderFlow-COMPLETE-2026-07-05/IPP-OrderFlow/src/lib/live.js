// Live courier-location relay.
//
// NOW: same-origin pub/sub over BroadcastChannel — delivers across browser TABS/WINDOWS on the
// same machine instantly (good for the office screen + a courier sharing from the same browser,
// and for testing the live map end-to-end).
//
// CROSS-DEVICE (office PC ↔ the driver's phone over the internet): needs a cloud relay. Drop a
// Firebase Realtime Database (or Supabase) config in at the SEAM markers below and the same
// publish/subscribe calls also flow through it — the UI doesn't change. Driver GPS is sensitive,
// so the relay must be YOUR secured project (not a public broker).
const CH = 'ipp-live-loc'

// One long-lived channel for publishing — opening + closing a fresh channel per GPS ping (as before)
// can drop the message in some browsers (close races the postMessage delivery). Keep it open instead.
let pubCh
function publisher() {
  if (pubCh === undefined) { try { pubCh = new BroadcastChannel(CH) } catch { pubCh = null } }
  return pubCh
}

// `key` = the COURIER (their name), NOT the order — one courier carries several orders, so they all
// share the courier's single live position.
export function publishLocation(key, pos) {
  const msg = { key, pos, at: (pos && pos.at) || new Date().toISOString() }
  const c = publisher(); if (c) { try { c.postMessage(msg) } catch { /* channel gone */ } }
  // SEAM (cross-device): firebaseDb.ref('live/' + key).set(msg)
}

export function subscribeLocation(key, cb) {
  let c
  try { c = new BroadcastChannel(CH) } catch { return () => {} }
  const onMsg = (e) => { if (e.data && e.data.key === key && e.data.pos) cb(e.data.pos) }
  c.addEventListener('message', onMsg)
  // SEAM (cross-device): firebaseDb.ref('live/' + key).on('value', s => { const v = s.val(); if (v) cb(v.pos) })
  return () => { try { c.removeEventListener('message', onMsg); c.close() } catch { /* noop */ } }
}
