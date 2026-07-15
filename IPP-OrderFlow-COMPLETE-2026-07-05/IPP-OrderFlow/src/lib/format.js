const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export const rupiah = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
export const jt = (n) => 'Rp ' + ((n || 0) / 1e6).toFixed(2) + 'jt'

export function dateShort(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export function dateFull(iso) {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export function timeShort(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const pad = (x) => String(x).padStart(2, '0')
export function dateCode(date) {
  const d = new Date(date)
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
export function orderNo(date, seq) {
  return `${dateCode(date)}-${pad(seq)}`
}
// Capitalise the first letter of every word (customer / company names). Collapses runs of spaces to
// one, and only upper-cases word-starts — leaves the rest of each word alone so acronyms like PT/CV/UD
// and A5 aren't mangled. "en dining senci" → "En Dining Senci"; "PT abc jaya" → "PT Abc Jaya".
export const titleCase = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase())
