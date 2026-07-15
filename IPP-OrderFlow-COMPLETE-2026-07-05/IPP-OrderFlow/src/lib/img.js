// Prepare a captured/attached photo for storage. We keep it at EVIDENCE resolution
// (long edge up to 2560px, JPEG q0.92) so it stays clear and zoomable for disputes —
// not the tiny thumbnail-grade we'd need to fit localStorage. Always re-encodes to JPEG
// via canvas, which also converts iPhone HEIC so the photo reliably displays everywhere.
// Returns a Blob. Non-image files (e.g. a PDF) pass through unchanged.
export function processPhoto(file, max = 2560, quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no file'))
    if (!/^image\//.test(file.type)) { resolve(file); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality)
      }
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
