// Full backup / restore. CSV export is a lossy report; this is the real safety net — the entire
// localStorage blob (orders, customers, settings) PLUS every IndexedDB proof photo as base64, in
// one downloadable JSON. Restore writes both back. One file = the whole order book, recoverable.
import { allPhotos, putPhoto, clearAllPhotos } from './photos.js'

const KEY = 'ipp-orderflow-v7'

export async function backupAll() {
  const data = JSON.parse(localStorage.getItem(KEY) || '{}')
  // Don't hand back an empty "valid" backup — restoring it would wipe a good device.
  if (!data || !Array.isArray(data.orders)) throw new Error('Nothing to back up yet — no order data on this device.')
  const photos = await allPhotos()
  const encoded = []
  for (const { id, blob } of photos) encoded.push({ id, dataUrl: await blobToDataUrl(blob) })
  // The learned intake corrections ("this shorthand → this product") live under their own key —
  // without them a restore/device move silently loses all the training.
  const corrections = localStorage.getItem('ipp-corrections-v1') || null
  return { app: 'ipp-orderflow', exportedAt: new Date().toISOString(), data, corrections, photos: encoded }
}

export async function restoreAll(backup) {
  if (!backup || backup.app !== 'ipp-orderflow' || !backup.data) throw new Error('Not a valid IPP OrderFlow backup file')
  // Replace the device's photos too — clear the current set first so old blobs aren't orphaned.
  await clearAllPhotos().catch(() => {})
  localStorage.setItem(KEY, JSON.stringify(backup.data))
  if (backup.corrections) { try { localStorage.setItem('ipp-corrections-v1', backup.corrections) } catch (e) { /* non-fatal */ } }
  for (const p of backup.photos || []) {
    try { await putPhoto(p.id, await dataUrlToBlob(p.dataUrl)) } catch (e) { /* skip a bad photo, keep restoring */ }
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob) })
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}
