// Smart-fake intake recognizer. Turns messy order text into standardized draft lines
// matched against the real catalog. (Swap this for a real Claude API call later.)

const UNIT_WORDS = ['loaf', 'box', 'pack', 'pcs', 'pc', 'kg', 'gram', 'gr', 'tin', 'ekor', 'carton', 'whole', 'tray', 'pail']
const UNIT_MAP = { whole: 'loaf', gr: 'pack', gram: 'pack', pc: 'pcs' }

const ALIAS = {
  hotate: 'scallop', hokaido: 'hokkaido', shasimi: 'sashimi', sashimi: 'sashimi',
  str: 'striploin', tounge: 'tongue', bnls: 'boneless', gra: 'gras', tibs: 'ribs',
  shortrib: 'short rib', shortribs: 'short rib', shortplate: 'shortplate',
  ribey: 'ribeye', cuberoll: 'cube roll', tritip: 'tri tip', tritips: 'tri tip',
}
const ORIGIN_KW = {
  Australia: 'aus australia', Japan: 'jpn japan jepang a5', USA: 'us usa american',
  Brazil: 'brazil brazilian', 'New Zealand': 'nz new zealand', India: 'india',
  Lamb: 'lamb domba', Poultry: 'chicken ayam bebek broiler', Seafood: 'seafood ikan',
  'Seafood / sashimi': 'sashimi seafood', 'Meltique (engineered)': 'meltique',
}

const NOISE = /^(ok|oke|sip|noted|baik|thanks?|thank you|terima kasih|tq|pagi|siang|sore|malam|halo|hallo|hi|hai|ya|yg|mbak|mas|pak|bu|selamat)\b/i
const INSTR_PATTERNS = [
  /(?:steak\s+|stk\s+|potong\s+)?cut\s+[\d.,]+\s*cm/ig,
  /belah\s+tengah/ig, /vacuum(?:\s+per\s+\w+)?/ig,
  /lapor\s*gram|gram\s*info/ig, /\bsukiyaki\b/ig, /shabu(?:[-\s]?2)?/ig, /\bsabu(?:2)?\b/ig,
]

const norm = (s) => s.toLowerCase().replace(/[(),.]/g, ' ').replace(/\s+/g, ' ').trim()
const titleCase = (s) => s.trim().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ')

function searchText(p) {
  let t = norm([p.accurateName, p.grade, p.brand, p.form, ORIGIN_KW[p.origin] || ''].join(' '))
  if (/scallop/.test(t)) t += ' hotate'
  if (/striploin/.test(t)) t += ' str'
  return t
}
let CACHE = null
function indexed(products) {
  // Key on the ARRAY IDENTITY, not just length — the store replaces the products array on any add/edit/
  // import, so a new reference means the catalog changed (an edit that keeps the count must still rebuild).
  if (!CACHE || CACHE.ref !== products) CACHE = { ref: products, list: products.map((p) => ({ p, t: searchText(p) })) }
  return CACHE.list
}

function extractInstruction(raw) {
  const instr = []
  let rest = raw
  for (const re of INSTR_PATTERNS) rest = rest.replace(re, (m) => { instr.push(m.trim()); return ' ' })
  return { instruction: instr.join(' · ').replace(/\s+/g, ' ').trim(), rest: rest.replace(/\s+/g, ' ').trim() }
}

// Pull an inline price ("150rb", "150k", "@150.000", "rp 150000", "@rp150") out of an
// item line so it doesn't pollute product matching. rb/k = thousand, jt = million.
const PRICE_RE = /@?\s*rp\.?\s*\d[\d.,]*\s*(?:rb|ribu|k|jt|juta|m)?|@\s*\d[\d.,]*\s*(?:rb|ribu|k|jt|juta|m)?|\b\d[\d.,]*\s*(?:rb|ribu|jt|juta)\b|\b\d[\d.,]*k\b/i
function extractPrice(raw) {
  const m = raw.match(PRICE_RE)
  if (!m) return { price: null, rest: raw }
  const tok = m[0]
  const digits = tok.replace(/[^\d.,]/g, '').replace(/[.,]/g, '')
  let n = parseInt(digits, 10)
  if (!Number.isFinite(n) || n <= 0) return { price: null, rest: raw }
  if (/jt|juta|\bm\b/i.test(tok)) n *= 1000000
  else if (/rb|ribu|k/i.test(tok)) n *= 1000
  const rest = (raw.slice(0, m.index) + ' ' + raw.slice(m.index + tok.length)).replace(/\s+/g, ' ').trim()
  return { price: n, rest }
}

function extractQty(raw) {
  let qty = 1, unit = '', qtyRange = null, weightNote = null
  // A weight range anywhere, with an optional "/unit" suffix: "2-3 kg", "4 - 5 kg/loaf", "2 s/d 3 kg".
  // The UNIT is REQUIRED — a bare range is a marbling grade ("striploin 8-9"), not a quantity.
  const range = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|s\/d|s\.d\.?|sd|sampai|hingga)\s*(\d+(?:[.,]\d+)?)\s*(loaf|box|pack|pcs|pc|kg|gram|gr|tin|ekor|carton|whole|tray|pail)(\s*\/\s*[a-z]+)?\b/i)
  if (range) {
    const ru = (range[3] || '').toLowerCase()
    // If the line ALSO states a COUNTED quantity ("1 loaf", "2 pack") anywhere, THAT count is the order
    // amount and a kg/gram range is just the per-piece weight SPEC — e.g. "…1 loaf (4-5 kg/loaf)" → qty 1
    // loaf, weightNote "4-5 kg/loaf" (NOT qty 5 kg). Counted units never include kg/gram.
    const count = raw.match(/(\d+(?:[.,]\d+)?)\s*(loaf|loaves|box|pack|pcs|pc|ekor|carton|tray|pail|tin|whole)\b/i)
    const countOutside = count && (count.index < range.index || count.index > range.index + range[0].length)
    if (/^(kg|gram|gr)$/.test(ru) && countOutside) {
      qty = parseFloat(String(count[1]).replace(',', '.')) || 1
      unit = UNIT_MAP[count[2].toLowerCase()] || count[2].toLowerCase()
      weightNote = `${range[1]}-${range[2]} ${ru}${range[4] ? range[4].replace(/\s+/g, '') : ''}`
      return { qty, unit, qtyRange, weightNote }
    }
    const lo = parseFloat(String(range[1]).replace(',', '.'))
    const hi = parseFloat(String(range[2]).replace(',', '.'))
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
      qty = hi   // take the MAXIMUM of the range ("2-3 kg" → 3) so we don't under-order
      qtyRange = `${range[1]}-${range[2]}`
      unit = UNIT_MAP[ru] || ru
      return { qty, unit, qtyRange, weightNote }
    }
  }
  let m = raw.match(/(\d+(?:[.,]\d+)?)\s*(loaf|box|pack|pcs|pc|kg|gram|gr|tin|ekor|carton|whole|tray|pail)\b/i)
  if (!m) m = raw.match(/\b(loaf|box|pack|pcs|pc|kg|tin|ekor|carton|whole)\s*(\d+(?:[.,]\d+)?)/i)
  if (m) {
    const num = m[1] && /\d/.test(m[1]) ? m[1] : m[2]
    const u = (m[2] && !/\d/.test(m[2]) ? m[2] : m[1]) || ''
    qty = parseFloat(String(num).replace(',', '.')) || 1
    unit = (u || '').toLowerCase()
  } else {
    // a leading number is the qty — UNLESS it's the start of a range/grade ("8-9 striploin" → not qty 8)
    const x = raw.match(/x\s*(\d+)/i) || raw.match(/^(\d+)(?!\s*[-–]\s*\d)\b/)
    if (x) qty = parseInt(x[1])
  }
  unit = UNIT_MAP[unit] || unit
  return { qty, unit, qtyRange, weightNote }
}

// ---- learned corrections: the no-AI "training" — remember the admin's product fixes ----
const CORR_KEY = 'ipp-corrections-v1'
function loadCorr() { try { return JSON.parse(localStorage.getItem(CORR_KEY)) || {} } catch { return {} } }
function saveCorr(m) { try { localStorage.setItem(CORR_KEY, JSON.stringify(m)) } catch { /* ignore */ } }

function tokensFor(rest) {
  return [...new Set(norm(rest).split(' ').map((w) => ALIAS[w] || w)
    .filter((w) => w.length >= 2 && !UNIT_WORDS.includes(w) && !/^\d+$/.test(w) && w !== 'x'))]
}
// strip instruction AND inline price before keying, so learning matches recognizeItem's lookup
const corrKey = (rawText) => tokensFor(extractPrice(extractInstruction(String(rawText || '').trim()).rest).rest).slice().sort().join(' ')

// Teach the recognizer: "this shorthand means this product." It beats the rules next time.
export function learnCorrection(rawText, productId) {
  const key = corrKey(rawText)
  if (!key || key.length < 2 || !productId) return
  const m = loadCorr(); if (m[key] === productId) return
  m[key] = productId; saveCorr(m)
}
export const correctionCount = () => Object.keys(loadCorr()).length

export function recognizeItem(raw, products) {
  const original = raw.trim()
  const { instruction, rest: afterInstr } = extractInstruction(original)
  // strip an inline price before matching so digits/"rb"/"k" don't pollute product tokens
  const { price, rest } = extractPrice(afterInstr)
  const { qty, unit, qtyRange, weightNote } = extractQty(rest)
  const tokens = tokensFor(rest)
  const packUnit = (p) => (p.fixedPack ? (/(gram|kg)/i.test(p.pack) ? 'pack' : 'box') : 'loaf')

  // 1) a learned correction wins — this is how the app gets smarter the more you use it
  const learnedId = loadCorr()[tokens.slice().sort().join(' ')]
  if (learnedId) {
    const p = products.find((x) => x.id === learnedId)
    if (p) return { raw: original, qty, unit: unit || packUnit(p), instruction, product: p, confidence: 1, status: 'recognized', learned: true, qtyRange, weightNote, price }
  }

  // 2) rule-based matching
  let best = null, bestScore = 0, bestLen = Infinity, second = 0
  for (const { p, t } of indexed(products)) {
    let score = 0
    for (const tok of tokens) if (t.includes(tok)) score += tok.length >= 4 ? 1.4 : 1
    // higher score wins; on a tie, prefer the plainest product (shortest catalog text)
    if (score > bestScore || (score === bestScore && score > 0 && t.length < bestLen)) {
      second = score > bestScore ? bestScore : Math.max(second, bestScore)
      bestScore = score; bestLen = t.length; best = p
    } else if (score > second) second = score
  }
  const conf = tokens.length ? bestScore / (tokens.length * 1.1) : 0
  let status = 'unrecognized'
  if (bestScore >= 2) status = bestScore - second >= 1.2 && conf >= 0.55 ? 'recognized' : 'probable'
  else if (conf >= 0.3) status = 'probable'

  let finalUnit = unit
  if (!finalUnit && best) finalUnit = packUnit(best)

  return { raw: original, qty, unit: finalUnit || 'pcs', instruction, product: status === 'unrecognized' ? null : best, confidence: Math.min(1, conf), status, learned: false, qtyRange, weightNote, price }
}

// Returns { iso, guessed }: guessed=true when no date was found and we fall back to today+2.
function detectDeliver(text) {
  const days = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 }
  const lo = text.toLowerCase()
  const base = new Date()
  for (const [k, dow] of Object.entries(days)) {
    if (lo.includes(k)) { const d = new Date(base); let diff = (dow - d.getDay() + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() + diff); return { iso: d.toISOString(), guessed: false } }
  }
  const m = lo.match(/(\d{1,2})\s*(jan|feb|mar|apr|mei|jun|jul|agu|aug|sep|okt|nov|des|juni|juli)/)
  if (m) { const map = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, aug: 7, sep: 8, okt: 9, nov: 10, des: 11 }; const d = new Date(base); d.setMonth(map[m[2]] ?? d.getMonth(), parseInt(m[1])); return { iso: d.toISOString(), guessed: false } }
  const d = new Date(base); d.setDate(d.getDate() + 2); return { iso: d.toISOString(), guessed: true }
}

const DATE_LINE = /^\d{1,2}\s*(jan|feb|mar|apr|mei|jun|jul|agu|aug|sep|okt|nov|des|juni|juli|sabtu|minggu|senin|selasa|rabu|kamis|jumat)/i
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/
const findPhone = (s) => { const m = (s || '').match(PHONE_RE); return m ? m[1].replace(/[^\d+]/g, '') : null }
const PHONE_ONLY = /^\+?[\d\s().-]{8,}$/
// A QUANTITY signal: a digit+unit anywhere ("ribeye 2kg", "sashimi 1 box") or an "x N" multiplier
// ("black cod x 1"). Strong enough to tell an ITEM line apart from a name/address/phone.
const QTY_SIGNAL = /(?:^|\s)\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:loaf|loyang|box|pack|pck|pkt|pcs|pc|kg|gram|gr|ekor|tin|btl|botol|bottle|carton|tray|pail|whole|slab|sisir)\b|\bx\s*\d/i
// A line is an item if it's bulleted, qty-first, OR carries a quantity signal — this catches the very
// common product-first WhatsApp format ("black cod x 1") that was otherwise dropped, or in a numbered
// list ("1) ribeye 2kg") was wrongly stolen as the customer name.
const looksLikeItem = (l) => /^[-•*]/.test(l) || QTY_SIGNAL.test(l)
const cleanSub = (s) => s.replace(/\bpck\b/gi, 'pack').replace(/\s+/g, ' ').trim()

// field labels common in WhatsApp orders (English + Bahasa)
const LABELS = [
  ['name', /^(nama lengkap|nama|customer|pelanggan|atas nama|a\/n|an)\b\s*[:.\-]?\s*(.*)$/i],
  ['address', /^(alamat lengkap|alamat kirim|alamat|address|kirim ke|deliver to|ship to|lokasi)\b\s*[:.\-]?\s*(.*)$/i],
  ['phone', /^(no\.?\s*telp|no\.?\s*hp|telp|telepon|tlp|hp|wa|whatsapp|phone|kontak|contact)\b\s*[:.\-]?\s*(.*)$/i],
  ['items', /^(detail order|detail orderan|detail pesanan|orderan|pesanan|order|items?|list order|barang)\b\s*[:.\-]?\s*(.*)$/i],
]

export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
export const tightKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const normPhone = (s) => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('62')) d = '0' + d.slice(2); return d }

// Match a typed name / phone to an existing customer: exact name, same phone, or same
// letters ignoring spacing & punctuation (so "Ri Ri Xian" == "Riri Xian").
export function matchCustomer(name, phone, customers) {
  const nm = normName(name), tk = tightKey(name), ph = normPhone(phone)
  if (nm) { const e = (customers || []).find((c) => normName(c.name) === nm); if (e) return { type: 'exact', customer: e } }
  if (ph) { const p = (customers || []).find((c) => c.contact && normPhone(c.contact) === ph); if (p) return { type: 'phone', customer: p } }
  if (tk.length >= 3) { const f = (customers || []).find((c) => tightKey(c.name) === tk); if (f) return { type: 'fuzzy', customer: f } }
  // token-subset tier: every typed token is contained in one existing name's tokens (or vice
  // versa), e.g. "Ivy Resto" ⊂ "Ivy Restaurant". Only fires when exactly ONE customer matches.
  const tokset = nm ? [...new Set(nm.split(' ').filter(Boolean))] : []
  if (tokset.length) {
    const subset = (a, b) => a.every((w) => b.some((x) => x === w || x.startsWith(w) || w.startsWith(x)))
    const hits = (customers || []).filter((c) => {
      const ct = [...new Set(normName(c.name).split(' ').filter(Boolean))]
      if (!ct.length) return false
      return subset(tokset, ct) || subset(ct, tokset)
    })
    if (hits.length === 1) return { type: 'fuzzy', customer: hits[0] }
  }
  return { type: name && name.trim() ? 'new' : 'none', customer: null }
}

export function parseOrder(text, { products, customers }) {
  const rawLines = text.split('\n').map((l) => l.trim())
  let name = null, phone = null, mode = null, orderRef = null, company = null
  const address = [], itemLines = []
  let nameBlocks = 0   // how many distinct customer-name blocks appear → multi-customer warning

  for (const raw of rawLines) {
    if (!raw) { if (mode === 'address') mode = null; continue }   // blank line closes a multi-line field
    const hadNum = /^\d{1,3}\s*[).]\s+\S/.test(raw)
    if (hadNum && orderRef === null) orderRef = raw.match(/^(\d{1,3})/)[1]   // "14) ..." → order no. 14
    const l = raw.replace(/^\d{1,3}\s*[).]\s+/, '').trim() || raw

    let lab = null, val = ''
    for (const [key, re] of LABELS) { const m = l.match(re); if (m) { lab = key; val = (m[2] || '').trim(); break } }
    if (lab) {
      mode = lab
      if (lab === 'name' && val) { if (++nameBlocks === 1) name = val; mode = null }   // 2nd "Nama:" = another customer
      else if (lab === 'name') nameBlocks++   // a bare "Nama:" label (value on the next line) still counts as a block
      else if (lab === 'address' && val) address.push(val)
      else if (lab === 'phone') { const p = findPhone(val); if (p) { phone = p; mode = null } }
      else if (lab === 'items' && val) itemLines.push(val)
      continue
    }

    // Legal entity for the invoice / Faktur (billed in Accurate): "PT …", "CV …", "UD …", "PD …".
    // Captured separately from the restaurant/outlet name even inside an items block.
    if (!company && /^(pt|cv|ud|pd)\.?\s+[a-z0-9]/i.test(l) && !looksLikeItem(l) && !findPhone(l)) { company = l.trim(); continue }

    if (hadNum && !name && !looksLikeItem(l) && !DATE_LINE.test(l) && !findPhone(l)) { nameBlocks++; name = l; continue } // "8) Casa Alba"
    // a SECOND numbered header that reads like a NAME (letters, no digits, ≤5 words) → another
    // customer's block. Numbered ITEM lines carry a digit (qty), so this excludes them.
    if (hadNum && name && mode !== 'items' && !looksLikeItem(l) && !DATE_LINE.test(l) && !findPhone(l)
        && /[a-z]/i.test(l) && !/\d/.test(l) && l.split(/\s+/).length <= 5) { nameBlocks++; continue }
    if (DATE_LINE.test(l) && !looksLikeItem(l)) continue

    if (mode === 'name' && !name) { name = l; mode = null; continue }
    if (mode === 'phone' && !phone) { const p = findPhone(l); if (p) phone = p; mode = null; continue }
    if (mode === 'address') {
      if (PHONE_ONLY.test(l)) { phone = phone || findPhone(l); continue }
      if (looksLikeItem(l)) { mode = 'items'; itemLines.push(l); continue }
      address.push(l); continue
    }
    if (mode === 'items') { itemLines.push(l); continue }

    if (looksLikeItem(l)) itemLines.push(l)
    else if (PHONE_ONLY.test(l)) phone = phone || findPhone(l)
  }

  const cm = matchCustomer(name, phone, customers)
  const customer = cm.customer
    || (name ? { id: null, name: titleCase(name), payment: { timing: 'upfront', method: 'transfer' }, contact: phone || '', address: address.join(', '), sales: null, isNew: true } : null)

  // group each item with its "-"/"•" sub-lines, then emit ONE line per distinct cut
  // (one loaf cut several ways → a separate line each, easy for production to identify)
  const groups = []
  for (const il of itemLines) {
    const isSub = /^[-•*]\s*/.test(il)
    const txt = il.replace(/^[-•*]\s*/, '').trim()
    if (!txt || NOISE.test(txt)) continue
    if (isSub && groups.length) groups[groups.length - 1].subs.push(txt)
    else groups.push({ main: txt, subs: [] })
  }
  const built = []
  for (const g of groups) {
    const item = recognizeItem(g.main, products)
    const cuts = item.instruction ? [item.instruction] : []   // an inline cut on the main line
    for (const sub of g.subs) cuts.push(cleanSub(sub))         // each "-" sub-line is another cut of THE SAME piece
    built.push({ ...item, cuts })
  }

  const lo = text.toLowerCase()
  const method = lo.includes('cash') ? 'cash' : (lo.includes('transfer') || /\btf\b/.test(lo)) ? 'transfer' : null
  const dd = detectDeliver(text)

  return {
    customer,
    customerTyped: name || (cm.customer ? cm.customer.name : ''),
    customerMatch: cm.type,
    company: company || (cm.customer ? cm.customer.company : null) || null,
    deliver: dd.iso,
    dateGuessed: dd.guessed,
    multiCustomer: nameBlocks > 1,
    paymentMethod: method,
    address: address.join(', '),
    phone: phone || ((cm.type === 'exact' || cm.type === 'phone') && customer ? customer.contact : '') || '',
    ref: orderRef,
    lines: built.filter((li) => li.product || li.confidence > 0.03 || (li.raw && li.raw.length > 1)),
    sales: customer?.sales || null,
  }
}
