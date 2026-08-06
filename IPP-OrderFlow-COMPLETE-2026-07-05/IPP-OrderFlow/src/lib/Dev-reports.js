// Reports: pure functions that compute operational metrics from the orders array.
//
// The app does NOT price most orders (pricing lives in Accurate), so these reports favour
// VOLUME metrics — weighed kg and counts — and only surface money where a line carries a price.
//
// Key data shape (see store.jsx seed()):
//   order = { id, no, customerName, customerId, createdAt(ISO), deliver(ISO), stage,
//             closedShort, backorderOf, returnedReason,
//             lines:[{ name, qty, unit, weight, weighings:[{weight}], delivered, price, removed }],
//             history:[{ at(ISO), who, what }] }

import { STAGES, STAGE_LABEL, isWeighed, isWeightUnit } from './domain.js'

const DAY = 24 * 60 * 60 * 1000

// ---------- period filter ----------

// Period options for the segmented control. `days: null` means "all time".
export const PERIODS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All', days: null },
]

// Orders whose createdAt falls within the last `days` (or everything when days is null).
export function filterByPeriod(orders, days) {
  const list = orders || []
  if (!days) return list.slice()
  const cutoff = Date.now() - days * DAY
  return list.filter((o) => {
    const t = new Date(o.createdAt).getTime()
    return Number.isFinite(t) && t >= cutoff
  })
}

// Orders whose createdAt falls within [fromMs, toMs] inclusive. Either bound may be null (open-ended).
// Powers the custom date-range and month pickers.
export function filterByRange(orders, fromMs, toMs) {
  return (orders || []).filter((o) => {
    const t = new Date(o.createdAt).getTime()
    if (!Number.isFinite(t)) return false
    if (fromMs != null && t < fromMs) return false
    if (toMs != null && t > toMs) return false
    return true
  })
}

// ---------- small line helpers ----------

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)

// kg actually weighed for a line: prefer the sum of individual weighings, fall back to .weight.
function weighedKg(l) {
  if (Array.isArray(l.weighings) && l.weighings.length) {
    return l.weighings.reduce((s, w) => s + num(w && w.weight), 0)
  }
  return num(l.weight)
}

// kg ordered for a line — only meaningful when the unit is itself a weight unit (kg/gram).
function orderedKg(l) {
  return isWeightUnit(l.unit) ? num(l.qty) : 0
}

// ---------- header counts ----------

export function headerStats(orders) {
  let delivered = 0
  let returned = 0
  let cancelled = 0
  for (const o of orders) {
    if (o.stage === 'delivered') delivered++
    else if (o.stage === 'cancelled') cancelled++
    // Returned = had a return, whether still in-flight (stage 'returned') or already settled
    // (returnDoc recorded, order closed to delivered/cancelled). Counting only the in-flight stage
    // made every settled return vanish from this tile. Not exclusive with the two above.
    if (o.stage === 'returned' || o.returnDoc) returned++
  }
  return { total: orders.length, delivered, returned, cancelled }
}

// ---------- on-time delivery ----------

// When was the order actually delivered? Prefer the latest history entry whose `what`
// starts with "Delivered"; otherwise the timestamp of the last history entry.
export function deliveredAt(o) {
  const h = Array.isArray(o.history) ? o.history : []
  if (!h.length) return null
  for (let i = h.length - 1; i >= 0; i--) {
    const what = String(h[i] && h[i].what || '')
    if (what.toLowerCase().startsWith('delivered')) {
      const t = new Date(h[i].at).getTime()
      if (Number.isFinite(t)) return t
    }
  }
  const last = h[h.length - 1]
  const t = new Date(last && last.at).getTime()
  return Number.isFinite(t) ? t : null
}

// Among delivered orders, the share delivered on or before the end of their `deliver` date.
// We compare against the END of the deliver day (23:59:59) — a same-day delivery is on time.
export function onTimeDelivery(orders) {
  const delivered = orders.filter((o) => o.stage === 'delivered')
  let onTime = 0
  let measured = 0
  for (const o of delivered) {
    const got = deliveredAt(o)
    const due = new Date(o.deliver).getTime()
    if (got == null || !Number.isFinite(due)) continue
    measured++
    // End of the due day in LOCAL time — `due % DAY` is a UTC day boundary, which in Jakarta (UTC+7)
    // counted anything before 07:00 the NEXT morning as on time.
    const d = new Date(due)
    const endOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1
    if (got <= endOfDueDay) onTime++
  }
  return {
    n: measured,
    onTime,
    late: measured - onTime,
    pct: measured ? Math.round((onTime / measured) * 100) : null,
  }
}

// ---------- weight variance / shrinkage ----------

// Compares total weighed kg vs total ordered kg across weighed lines, and ranks products
// by how consistently they ship over/under their ordered weight.
export function weightVariance(orders) {
  let totalOrdered = 0
  let totalWeighed = 0
  const byProduct = new Map() // name -> { ordered, weighed, n }

  for (const o of orders) {
    for (const l of o.lines || []) {
      if (l.removed || !isWeighed(l.unit)) continue
      const ord = orderedKg(l)
      const wt = weighedKg(l)
      // Only count lines where we can actually compare ordered vs weighed kg.
      if (ord <= 0 || wt <= 0) continue
      totalOrdered += ord
      totalWeighed += wt
      const cur = byProduct.get(l.name) || { name: l.name, ordered: 0, weighed: 0, n: 0 }
      cur.ordered += ord
      cur.weighed += wt
      cur.n++
      byProduct.set(l.name, cur)
    }
  }

  const products = [...byProduct.values()]
    .map((p) => ({ ...p, variancePct: p.ordered ? ((p.weighed - p.ordered) / p.ordered) * 100 : 0 }))
    // Largest absolute drift first — these are the products worth watching.
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))

  return {
    totalOrdered,
    totalWeighed,
    measured: byProduct.size,
    variancePct: totalOrdered ? ((totalWeighed - totalOrdered) / totalOrdered) * 100 : null,
    products,
  }
}

// ---------- fulfilment (clean / short / backordered) ----------

// Classifies each order as backordered (it was spawned from, or spawned, a backorder),
// short (closedShort), or clean. An order is only counted once, backorder taking priority.
export function fulfilment(orders) {
  // Ids that some order points to via backorderOf — i.e. orders that spawned a backorder.
  const spawnedBackorder = new Set()
  for (const o of orders) {
    if (o.backorderOf) spawnedBackorder.add(o.backorderOf)
  }

  let clean = 0
  let short = 0
  let backordered = 0
  for (const o of orders) {
    // backorderOf stores the parent's order NUMBER (o.no) — matching o.id never hit, so parents that
    // spawned a backorder were miscounted as plain "closed short".
    if (o.backorderOf || spawnedBackorder.has(o.no)) backordered++
    else if (o.closedShort) short++
    else clean++
  }
  const total = orders.length
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
  return {
    total,
    clean,
    short,
    backordered,
    cleanPct: pct(clean),
    shortPct: pct(short),
    backorderedPct: pct(backordered),
  }
}

// ---------- volume by customer ----------

// Top customers by order count and by total weighed kg.
export function volumeByCustomer(orders, limit = 8) {
  const map = new Map() // customerName -> { name, orders, kg }
  for (const o of orders) {
    const name = o.customerName || 'Unknown'
    const cur = map.get(name) || { name, orders: 0, kg: 0 }
    cur.orders++
    for (const l of o.lines || []) {
      if (l.removed || !isWeighed(l.unit)) continue
      cur.kg += weighedKg(l)
    }
    map.set(name, cur)
  }
  const all = [...map.values()]
  const byOrders = [...all].sort((a, b) => b.orders - a.orders).slice(0, limit)
  const byKg = [...all].filter((c) => c.kg > 0).sort((a, b) => b.kg - a.kg).slice(0, limit)
  return { byOrders, byKg }
}

// ---------- demand by product ----------

// Top products by total ordered volume. Weight-unit lines aggregate kg; counted lines
// aggregate their count. We keep them separate so a "5 kg" line and a "3 box" line don't
// get summed into a meaningless number — each product reports the metric that fits its unit.
export function demandByProduct(orders, limit = 10) {
  const map = new Map() // name -> { name, kg, count, unit }
  for (const o of orders) {
    for (const l of o.lines || []) {
      if (l.removed) continue
      const cur = map.get(l.name) || { name: l.name, kg: 0, count: 0, unit: l.unit }
      if (isWeightUnit(l.unit)) cur.kg += num(l.qty)
      else cur.count += num(l.qty)
      map.set(l.name, cur)
    }
  }
  // Rank by a combined volume signal (kg + count) so both unit styles compete fairly.
  return [...map.values()]
    .map((p) => ({ ...p, total: p.kg + p.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

// ---------- cycle time / bottleneck ----------

// Average dwell time (hours) per pipeline stage, inferred from consecutive history
// timestamps. We map each history entry to the stage it advanced an order INTO, then the
// time until the next entry is how long the order sat in that stage.
//
// History `what` strings reference stage labels (e.g. "Moved to Production", "Delivered").
// We detect the stage by checking whether the entry text contains a known stage label.
function stageFromHistory(what) {
  const text = String(what || '').toLowerCase()
  // Check delivered first (its label is a plain word that can appear elsewhere).
  for (const s of STAGES) {
    const label = String(STAGE_LABEL[s] || '').toLowerCase()
    if (label && text.includes(label)) return s
  }
  return null
}

export function cycleTime(orders) {
  // stage -> { totalMs, n }
  const acc = new Map()
  STAGES.forEach((s) => acc.set(s, { totalMs: 0, n: 0 }))

  for (const o of orders) {
    const h = Array.isArray(o.history) ? o.history : []
    if (h.length < 2) continue
    // First history entry is "Order created" → the order enters at intake.
    let curStage = 'intake'
    let curAt = new Date(h[0].at).getTime()
    for (let i = 1; i < h.length; i++) {
      const at = new Date(h[i].at).getTime()
      if (Number.isFinite(curAt) && Number.isFinite(at) && at >= curAt && acc.has(curStage)) {
        const bucket = acc.get(curStage)
        bucket.totalMs += at - curAt
        bucket.n++
      }
      // Prefer the explicit destination stamped on the entry (advance()); fall back to the
      // legacy text-scan for older entries / stage changes made outside advance().
      const next = h[i].stage || stageFromHistory(h[i].what)
      if (next) curStage = next
      curAt = at
    }
  }

  const stages = STAGES.map((s) => {
    const b = acc.get(s)
    return {
      stage: s,
      label: STAGE_LABEL[s],
      n: b.n,
      avgHours: b.n ? b.totalMs / b.n / (60 * 60 * 1000) : 0,
    }
  })
  const measured = stages.filter((s) => s.n > 0)
  const slowest = measured.reduce(
    (max, s) => (s.avgHours > (max ? max.avgHours : -1) ? s : max),
    null,
  )
  return { stages, slowest, measured: measured.length }
}
