// Evidence photos (delivery proof, scale weights, item condition) are kept at full
// resolution so they stay clear when zoomed for a customer dispute. They're far too big
// for localStorage (~5MB cap), so they live in IndexedDB (hundreds of MB+) as real blobs.
// The order only stores the returned photo id. (Production: move these to server/cloud.)
const DB = 'ipp-photos'
const STORE = 'photos'
let dbp = null

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

export async function savePhoto(blob) {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const d = await db()
  await new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  return id
}

export async function getPhotoBlob(id) {
  if (!id) return null
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly')
    const rq = tx.objectStore(STORE).get(id)
    rq.onsuccess = () => resolve(rq.result || null)
    rq.onerror = () => reject(rq.error)
  })
}

const urlCache = new Map()
export async function getPhotoURL(id) {
  if (!id) return null
  if (urlCache.has(id)) return urlCache.get(id)
  const blob = await getPhotoBlob(id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

export async function deletePhoto(id) {
  if (!id) return
  const d = await db()
  d.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id) }
}

// Wipe every photo (used by Reset demo data so photos don't outlive their orders).
export async function clearAllPhotos() {
  const d = await db()
  await new Promise((resolve, reject) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
  for (const u of urlCache.values()) { try { URL.revokeObjectURL(u) } catch (e) { /* noop */ } }
  urlCache.clear()
}

// Backup: list every stored photo as { id, blob }.
export async function allPhotos() {
  const d = await db()
  return new Promise((resolve, reject) => {
    const out = []
    const tx = d.transaction(STORE, 'readonly')
    const cur = tx.objectStore(STORE).openCursor()
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push({ id: c.key, blob: c.value }); c.continue() } else resolve(out) }
    cur.onerror = () => reject(cur.error)
  })
}

// Restore: write a photo back at a known id.
export async function putPhoto(id, blob) {
  if (!id || !blob) return
  const d = await db()
  await new Promise((resolve, reject) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
  return id
}
