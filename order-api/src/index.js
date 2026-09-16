// order-api — ported from prototype recognize.js. Two changes from the original:
//   1. localStorage-based corrections → Directus `corrections` table (fetched once per request)
//   2. exported as Directus endpoint routes instead of browser-side functions
//
// Auth note: this endpoint runs with FULL internal access (no accountability passed to
// ItemsService) so both the in-app frontend and n8n can call it regardless of their own
// Directus role. Because of that, every route is gated behind a shared secret header —
// see requireInternalAuth() below. Set ORDER_API_TOKEN in Directus's .env.

// ---------- constants (unchanged from recognize.js) ----------
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
function indexed(products) {
  return products.map((p) => ({ p, t: searchText(p) }))
}

function extractInstruction(raw) {
  const instr = []
  let rest = raw
  for (const re of INSTR_PATTERNS) rest = rest.replace(re, (m) => { instr.push(m.trim()); return ' ' })
  return { instruction: instr.join(' · ').replace(/\s+/g, ' ').trim(), rest: rest.replace(/\s+/g, ' ').trim() }
}

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
  const range = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|s\/d|s\.d\.?|sd|sampai|hingga)\s*(\d+(?:[.,]\d+)?)\s*(loaf|box|pack|pcs|pc|kg|gram|gr|tin|ekor|carton|whole|tray|pail)(\s*\/\s*[a-z]+)?\b/i)
  if (range) {
    const ru = (range[3] || '').toLowerCase()
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
      qty = hi
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
    const x = raw.match(/x\s*(\d+)/i) || raw.match(/^(\d+)(?!\s*[-–]\s*\d)\b/)
    if (x) qty = parseInt(x[1])
  }
  unit = UNIT_MAP[unit] || unit
  return { qty, unit, qtyRange, weightNote }
}

function tokensFor(rest) {
  return [...new Set(norm(rest).split(' ').map((w) => ALIAS[w] || w)
    .filter((w) => w.length >= 2 && !UNIT_WORDS.includes(w) && !/^\d+$/.test(w) && w !== 'x'))]
}
function corrKey(rawText) {
  return tokensFor(extractPrice(extractInstruction(String(rawText || '').trim()).rest).rest).slice().sort().join(' ')
}

function recognizeItem(raw, products, corrMap) {
  const original = raw.trim()
  const { instruction, rest: afterInstr } = extractInstruction(original)
  const { price, rest } = extractPrice(afterInstr)
  const { qty, unit, qtyRange, weightNote } = extractQty(rest)
  const tokens = tokensFor(rest)
  const packUnit = (p) => (p.fixedPack ? (/(gram|kg)/i.test(p.pack) ? 'pack' : 'box') : 'loaf')

  const learnedId = corrMap[tokens.slice().sort().join(' ')]
  if (learnedId) {
    const p = products.find((x) => x.id === learnedId)
    if (p) return { raw: original, qty, unit: unit || packUnit(p), instruction, product: p, confidence: 1, status: 'recognized', learned: true, qtyRange, weightNote, price }
  }

  let best = null, bestScore = 0, bestLen = Infinity, second = 0
  for (const { p, t } of indexed(products)) {
    let score = 0
    for (const tok of tokens) if (t.includes(tok)) score += tok.length >= 4 ? 1.4 : 1
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
const QTY_SIGNAL = /(?:^|\s)\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:loaf|loyang|box|pack|pck|pkt|pcs|pc|kg|gram|gr|ekor|tin|btl|botol|bottle|carton|tray|pail|whole|slab|sisir)\b|\bx\s*\d/i
const looksLikeItem = (l) => /^[-•*]/.test(l) || QTY_SIGNAL.test(l)
const cleanSub = (s) => s.replace(/\bpck\b/gi, 'pack').replace(/\s+/g, ' ').trim()

const LABELS = [
  ['name', /^(nama lengkap|nama|customer|pelanggan|atas nama|a\/n|an)\b\s*[:.\-]?\s*(.*)$/i],
  ['address', /^(alamat lengkap|alamat kirim|alamat|address|kirim ke|deliver to|ship to|lokasi)\b\s*[:.\-]?\s*(.*)$/i],
  ['phone', /^(no\.?\s*telp|no\.?\s*hp|telp|telepon|tlp|hp|wa|whatsapp|phone|kontak|contact)\b\s*[:.\-]?\s*(.*)$/i],
  ['items', /^(detail order|detail orderan|detail pesanan|orderan|pesanan|order|items?|list order|barang)\b\s*[:.\-]?\s*(.*)$/i],
]

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const tightKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const normPhone = (s) => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('62')) d = '0' + d.slice(2); return d }

function matchCustomer(name, phone, customers) {
  const nm = normName(name), tk = tightKey(name), ph = normPhone(phone)
  if (nm) { const e = (customers || []).find((c) => normName(c.name) === nm); if (e) return { type: 'exact', customer: e } }
  if (ph) { const p = (customers || []).find((c) => c.contact && normPhone(c.contact) === ph); if (p) return { type: 'phone', customer: p } }
  if (tk.length >= 3) { const f = (customers || []).find((c) => tightKey(c.name) === tk); if (f) return { type: 'fuzzy', customer: f } }
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

function parseOrder(text, { products, customers, corrMap }) {
  const rawLines = text.split('\n').map((l) => l.trim())
  let name = null, phone = null, mode = null, orderRef = null, company = null
  const address = [], itemLines = []
  let nameBlocks = 0

  for (const raw of rawLines) {
    if (!raw) { if (mode === 'address') mode = null; continue }
    const hadNum = /^\d{1,3}\s*[).]\s+\S/.test(raw)
    if (hadNum && orderRef === null) orderRef = raw.match(/^(\d{1,3})/)[1]
    const l = raw.replace(/^\d{1,3}\s*[).]\s+/, '').trim() || raw

    let lab = null, val = ''
    for (const [key, re] of LABELS) { const m = l.match(re); if (m) { lab = key; val = (m[2] || '').trim(); break } }
    if (lab) {
      mode = lab
      if (lab === 'name' && val) { if (++nameBlocks === 1) name = val; mode = null }
      else if (lab === 'name') nameBlocks++
      else if (lab === 'address' && val) address.push(val)
      else if (lab === 'phone') { const p = findPhone(val); if (p) { phone = p; mode = null } }
      else if (lab === 'items' && val) itemLines.push(val)
      continue
    }

    if (!company && /^(pt|cv|ud|pd)\.?\s+[a-z0-9]/i.test(l) && !looksLikeItem(l) && !findPhone(l)) { company = l.trim(); continue }
    if (hadNum && !name && !looksLikeItem(l) && !DATE_LINE.test(l) && !findPhone(l)) { nameBlocks++; name = l; continue }
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
    const item = recognizeItem(g.main, products, corrMap)
    const cuts = item.instruction ? [item.instruction] : []
    for (const sub of g.subs) cuts.push(cleanSub(sub))
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

// ---------- auth gate ----------
function requireInternalAuth(req, res) {
  const expected = process.env.ORDER_API_TOKEN
  if (!expected) {
    // fail closed — if the env var isn't set, refuse everything rather than run wide open
    res.status(500).json({ error: 'Server misconfigured: ORDER_API_TOKEN not set' })
    return false
  }
  if (req.headers['x-internal-token'] !== expected) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

// ---------- Directus endpoint routes ----------
export default (router, { services, getSchema }) => {
  const { ItemsService } = services

  // left open — harmless, no data exposed, useful for uptime checks
  router.get('/', (req, res) => {
    res.json({ success: true, message: 'Order API is running!' })
  })
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  router.post('/parse-order', async (req, res) => {
    if (!requireInternalAuth(req, res)) return
    try {
      const { text, lang } = req.body
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Missing "text" field' })
      }

      const schema = await getSchema()
      // NOTE: no `accountability` passed — runs with full internal access regardless
      // of caller (n8n has no Directus session at all). Access is instead gated by
      // requireInternalAuth() above.
      const productsService = new ItemsService('products', { schema })
      const customersService = new ItemsService('customers', { schema })
      const correctionsService = new ItemsService('corrections', { schema })

      const [products, customers, corrections] = await Promise.all([
        productsService.readByQuery({ limit: -1 }),
        customersService.readByQuery({ limit: -1 }),
        correctionsService.readByQuery({ limit: -1 }),
      ])

      const corrMap = Object.fromEntries(corrections.map((c) => [c.token_key, c.product_id]))

      const draft = parseOrder(text, { products, customers, corrMap })
      res.json(draft)
    } catch (err) {
      req.logger?.error(err)
      res.status(500).json({ error: 'Parse failed', detail: err.message })
    }
  })

  router.post('/corrections', async (req, res) => {
    if (!requireInternalAuth(req, res)) return
    try {
      const { rawText, productId } = req.body
      if (!rawText || !productId) {
        return res.status(400).json({ error: 'rawText and productId are required' })
      }
      const key = corrKey(rawText)
      if (!key || key.length < 2) {
        return res.status(400).json({ error: 'rawText produced no usable tokens' })
      }

      const schema = await getSchema()
      const correctionsService = new ItemsService('corrections', { schema })

      const existing = await correctionsService.readByQuery({
        filter: { token_key: { _eq: key } }, limit: 1,
      })

      if (existing.length) {
        await correctionsService.updateOne(existing[0].id, {
          product_id: productId,
          times_used: (existing[0].times_used || 0) + 1,
        })
      } else {
        await correctionsService.createOne({
          token_key: key,
          product_id: productId,
          times_used: 1,
          // created_by dropped — we no longer have req.accountability.user without a
          // real Directus session; add it back only if you pass a user id explicitly
          // from the frontend in the request body instead.
        })
      }

      res.json({ success: true, key })
    } catch (err) {
      req.logger?.error(err)
      res.status(500).json({ error: 'Correction save failed', detail: err.message })
    }
  })
}