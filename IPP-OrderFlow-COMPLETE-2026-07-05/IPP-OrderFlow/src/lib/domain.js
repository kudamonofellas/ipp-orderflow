// Domain: roles, pipeline stages, pricing, value helpers.

export const ROLES = ['Admin', 'Warehouse', 'Production', 'Finance', 'Courier', 'Owner']

export const DEMO_USERS = [
  { name: 'Teza', role: 'Admin' },
  { name: 'Budi', role: 'Warehouse' },
  { name: 'Nando', role: 'Production' },
  { name: 'Sari', role: 'Finance' },
  { name: 'Anton', role: 'Courier' },
  { name: 'Winata', role: 'Owner' },
]

export const STAGES = ['intake', 'cold', 'finance', 'production', 'packing', 'finalise', 'dispatch', 'delivered']

export const STAGE_LABEL = {
  intake: 'New Orders', cold: 'Cold Storage Picking', finance: 'Finance Review',
  // finalise = the ADMIN prints the DO/SI (paperwork, not goods-readiness); dispatch = the courier's
  // whole step — orders waiting to be picked up AND on the road (the Home tile breaks the two apart).
  production: 'Processing', packing: 'Packing', finalise: 'Print DO/SI', dispatch: 'Dispatch', delivered: 'Delivered',
  outstanding: 'Outstanding', awaiting: 'Awaiting stock', cancelled: 'Cancelled', returned: 'Returned',
}
export const STAGE_COLOR = {
  intake: 'var(--c-intake)', cold: 'var(--c-cold)', finance: 'var(--c-finance)',
  production: 'var(--c-production)', packing: 'var(--c-cold)', finalise: 'var(--c-admin)', dispatch: 'var(--c-courier)', delivered: 'var(--c-done)',
  outstanding: 'var(--warning)', awaiting: 'var(--text-3)', cancelled: 'var(--text-3)', returned: 'var(--danger)',
}

// A line ordered by weight (kg) is fulfilled by the actual weight delivered — a 4.59 kg
// loaf satisfies a "5 kg" line, so weight never auto-creates a shortage. Only counted
// units (ekor, pcs, box, loaf) can be exactly short.
export const isWeightUnit = (u) => /^(kg|gram|gr|g)$/i.test(String(u || '').trim())
// Units we WEIGH at Cold Storage: kg/gram, or a loaf (a whole piece weighed catch-weight).
// Counted units (ekor, pcs, pack, box, …) are NOT weighed in kg — they're just counted.
export const isWeighed = (u) => isWeightUnit(u) || /^loa(f|ves)$/i.test(String(u || '').trim())
// Common order units (suggestions for the editable unit field). Weight units (kg/gram/loaf) are
// weighed at Cold Storage; the rest are counted — so switching e.g. kg→pack changes how it's handled.
export const UNITS = ['kg', 'gram', 'pack', 'pcs', 'box', 'ekor', 'loaf']
// How many of a counted line are still owed, given what's been delivered + what the customer
// refused (returned). Refused units are resolved (they come back to us), NOT a backorder — so they
// reduce what's owed, exactly like delivered units do.
export function lineLeft(l) {
  if (l.removed || isWeightUnit(l.unit)) return 0
  const left = (Number(l.qty) || 0) - (Number(l.delivered) || 0) - (Number(l.returned) || 0)
  return left > 0 ? left : 0
}

// An order can be EDITED until it physically leaves the warehouse — i.e. the courier takes it (or it's
// picked up / handed to a 3rd-party service), or it's already delivered. Up to that point (Cold Storage
// → … → Packing → Finalise → Dispatch-waiting) the goods are still in the building, so the order is
// editable. Cutting freezes the cut LINES (see lineFrozen), not the whole order.
export function hasLeftWarehouse(o) {
  if (!o) return false
  if (o.stage === 'delivered') return true
  if (o.stage === 'dispatch' && (o.takenBy || o.pickup || o.thirdParty)) return true
  return false
}
// A single line is frozen for edits once any of its cuts is already marked done (durable — the meat is
// physically cut), OR while production is actively cutting this order (cuttingStarted, only meaningful
// while the order sits at the 'production' stage — once it moves on, the cut.done flags carry the freeze,
// and a stale cuttingStarted left on an order sent back / re-prepped no longer freezes anything).
export function lineFrozen(l, o) {
  if (!l) return false
  if ((l.cuts || []).some((c) => c.done)) return true
  return !!(o && o.cuttingStarted) && o.stage === 'production' && (l.cuts || []).length > 0
}

// Which step of the RETURN sub-flow an order is stuck on (drives the dashboard "Returns" strip +
// the Orders ?ret= filter). A return isn't a forward pipeline stage — it's an off-pipeline loop with
// its own hand-offs: warehouse receives & weighs → admin settles the Accurate document → (revised
// DO/SI) a courier delivers it for signing → close; or (with replacement) it rejoins the main
// pipeline at Cold Storage, badged isReplacement, until re-delivered.
export const RETURN_BUCKETS = [
  { key: 'receive', label: 'Awaiting Return', roles: ['Warehouse', 'Owner'] },     // warehouse confirms the goods are back + verifies qty
  { key: 'settle', label: 'Admin Action Required', roles: ['Admin', 'Owner'] },           // admin picks the Accurate document
  { key: 'sign', label: 'Awaiting Signed DO/SI', roles: ['Admin', 'Courier', 'Owner'] },       // revised DO/SI is out with the customer to sign
  { key: 'replacement', label: 'Replacement in Transit', roles: ['Warehouse', 'Production', 'Courier', 'Admin', 'Owner'] }, // re-sending in the main pipeline
]
// A return can now sit in SEVERAL buckets at once — the warehouse receive and the admin's document/
// replacement decisions run IN PARALLEL (like Finance clearing while Cold Storage weighs). E.g. right
// after a refusal the order is in 'receive' (warehouse) AND 'settle' (admin) simultaneously; a
// replacement ordered before the goods arrive is 'replacement' AND 'receive' (returnInbound).
export function returnBuckets(o) {
  if (!o) return []
  const b = []
  if (o.stage === 'returned') {
    if (!o.returnReceived) b.push('receive')
    if (o.returnSettle === 'sign') b.push('sign')
    else if (!o.returnSettle && !o.returnDoc) b.push('settle')
  } else {
    if (o.returnInbound) b.push('receive')            // goods still coming back while the replacement runs
    if (o.isReplacement && !['delivered', 'cancelled'].includes(o.stage)) b.push('replacement')
  }
  return b
}
// When an order was ACTUALLY delivered (not its planned date): the deliveredAt stamp, else the last
// 'delivered' history entry, else fall back to the scheduled delivery date (older/seed orders). Used by
// the dashboard's Delivered-today/week/month/year tiles + the matching Orders filter.
export function deliveredOn(o) {
  if (o.deliveredAt) return new Date(o.deliveredAt)
  const h = (o.history || []).filter((e) => e.stage === 'delivered')
  return new Date(h.length ? h[h.length - 1].at : (o.deliver || o.createdAt))
}
// When an order was cancelled (the last 'cancelled' history entry, else its planned/created date).
export function cancelledOn(o) {
  const h = (o.history || []).filter((e) => e.stage === 'cancelled')
  return new Date(h.length ? h[h.length - 1].at : (o.deliver || o.createdAt))
}

// Every IndexedDB photo id an order references (weigh photos, line proof photos, per-weighing
// photos, delivery proof, PO). Used to GC photos when an order is deleted/replaced/reset.
export function orderPhotoIds(o) {
  const ids = []
  const proofIds = (p) => { if (p) ['cond', 'recv', 'signed'].forEach((k) => p[k] && ids.push(p[k])) }
  ;(o.lines || []).forEach((l) => {
    if (l.weighPhoto) ids.push(l.weighPhoto)
    ;(l.photos || []).forEach((p) => p && ids.push(p))
    ;(l.weighings || []).forEach((w) => w && w.photoId && ids.push(w.photoId))
    // return evidence lives per line too
    ;(l.returnPhotos || []).forEach((p) => p && ids.push(p))
    if (l.returnedWeighPhoto) ids.push(l.returnedWeighPhoto)
  })
  proofIds(o.proof)
  ;(o.proofLog || []).forEach(proofIds)             // archived earlier-run proofs
  if (o.returnNotePhoto) ids.push(o.returnNotePhoto)
  if (o.returnSignedDoc) ids.push(o.returnSignedDoc)
  if (o.returnSignedDraft) ids.push(o.returnSignedDraft)
  Object.values(o.draftCaps || {}).forEach((arr) => (arr || []).forEach((c) => c && c.photo && ids.push(c.photo)))
  if (o.po && o.po.photoId) ids.push(o.po.photoId)
  return ids
}
// which stage a floor/finance role works
export const ROLE_QUEUE = { Warehouse: 'cold', Production: 'production', Finance: 'finance', Courier: 'dispatch' }
// Which pipeline stages each role is RESPONSIBLE for — highlighted on their dashboard so they see
// their own modules at a glance. (The Returns strip highlights its own buckets via RETURN_BUCKETS.roles.)
export const ROLE_FOCUS = {
  Admin: ['intake', 'finalise', 'delivered'],
  Warehouse: ['cold', 'packing'],
  Production: ['production'],
  Finance: ['finance'],   // Finance owns ONLY the Finance Gate. Its tile already counts cold-stage unpaid orders (payment clears in parallel with Cold), so there's no need to also light up Cold Storage — that's the warehouse's module.
  Courier: ['dispatch'],
  Owner: [],   // the owner oversees everything — no single focus
}
// Stage → the role responsible for acting on it (single source of truth; OrderDetail imports this).
export const ACTOR = {
  intake: 'Admin', cold: 'Warehouse', finance: 'Finance', production: 'Production', packing: 'Warehouse',
  finalise: 'Admin', dispatch: 'Courier', outstanding: 'Admin', awaiting: 'Admin',
}

// ---- Owner-configurable per-role permissions matrix ----
// Each capability's defaults below encode CURRENT behaviour. Owner is ALWAYS allowed (omitted here).
// can(role, cap, settings) = a settings.permissions override if present, else the coded default.
export const CAPABILITIES = [
  { key: 'seePrices', label: 'See prices & order value', group: 'Visibility' },
  { key: 'seeCustomerContact', label: 'See customer contact & sales rep', group: 'Visibility' },
  { key: 'seeCustomerCredit', label: 'See credit limit & exposure', group: 'Visibility' },
  { key: 'browseCustomers', label: 'Browse the Customers directory', group: 'Visibility' },
  { key: 'browseProducts', label: 'Browse the Products directory', group: 'Visibility' },
  { key: 'accessReports', label: 'Access Reports', group: 'Visibility' },
  { key: 'trackCourier', label: 'See live courier location', group: 'Visibility' },
  { key: 'createOrders', label: 'Create orders', group: 'Orders' },
  { key: 'editOrders', label: 'Edit orders (own stage, pre-cut)', group: 'Orders' },
  { key: 'editAfterLock', label: 'Edit after cutting / dispatch (override)', group: 'Orders' },
  { key: 'helpOtherStages', label: 'Act on other stages (floor helper)', group: 'Pipeline' },
  { key: 'actFinanceGate', label: 'Clear payment at the Finance gate', group: 'Pipeline' },
  { key: 'holdResume', label: 'Put on hold / resume', group: 'Pipeline' },
  { key: 'cancelOrders', label: 'Cancel orders', group: 'Pipeline' },
  { key: 'sendBackStage', label: 'Send an order back a stage', group: 'Pipeline' },
  { key: 'reopenOrders', label: 'Reopen closed orders', group: 'Pipeline' },
  { key: 'confirmDocsReturned', label: 'Confirm signed DO & SI returned', group: 'Pipeline' },
  { key: 'overrideCreditLimit', label: 'Clear an order over the credit limit', group: 'Money' },
  { key: 'reconcileCOD', label: 'Reconcile COD cash', group: 'Money' },
  { key: 'exportCSV', label: 'Export data to CSV (orders / products)', group: 'Money' },
  { key: 'manageCustomers', label: 'Create / edit customers', group: 'Admin area' },
  { key: 'manageProducts', label: 'Create / edit products', group: 'Admin area' },
  { key: 'manageSettings', label: 'Edit operational settings', group: 'Admin area' },
  { key: 'backupRestore', label: 'Backup / restore data', group: 'Admin area' },
  { key: 'manageTeam', label: 'Manage team / users', group: 'Admin area' },
  { key: 'resetData', label: 'Reset demo data', group: 'Admin area' },
]
const PERM_ROLES = ['Admin', 'Warehouse', 'Production', 'Finance', 'Courier']
// Which non-owner roles are allowed by default, per capability (== today's behaviour).
const ALLOW = {
  seePrices: ['Admin', 'Warehouse', 'Production', 'Finance'],
  seeCustomerContact: ['Admin', 'Finance', 'Courier'],
  seeCustomerCredit: ['Admin', 'Finance'],
  // Floor roles work from their order queue — the full customer book (every phone + address) and the
  // business reports are OFFICE views. Courier still gets each delivery's address on their own jobs
  // (run-sheet + dispatch panel); the owner can re-grant these in Settings if they want.
  browseCustomers: ['Admin', 'Finance'],
  browseProducts: ['Admin', 'Warehouse', 'Production', 'Finance', 'Courier'],
  accessReports: ['Admin', 'Finance'],
  trackCourier: ['Admin', 'Finance'],
  createOrders: ['Admin'],
  // Editing what was ORDERED is office work (floor roles weigh/cut/deliver, they don't change the
  // order). Default = Admin(+Owner); the code no longer hardcodes the role, so granting this to
  // another role in Settings now actually works (the matrix cells used to be dead).
  editOrders: ['Admin'],
  editAfterLock: [],
  // Admin covers the floor when someone's away. Finance is NOT a floor helper — same lane-keeping as
  // the round-69 rule (only Finance clears payment; conversely Finance doesn't weigh/take deliveries).
  helpOtherStages: ['Admin'],
  actFinanceGate: ['Finance'],
  holdResume: ['Admin'],
  cancelOrders: ['Admin'],
  sendBackStage: ['Admin'],
  reopenOrders: ['Admin'],
  confirmDocsReturned: ['Admin'],
  overrideCreditLimit: ['Finance'],
  reconcileCOD: ['Admin', 'Finance'],
  exportCSV: ['Admin', 'Warehouse', 'Production', 'Finance', 'Courier'],
  manageCustomers: ['Admin'],
  manageProducts: ['Admin'],
  manageSettings: ['Admin'],
  backupRestore: ['Admin'],
  manageTeam: [],
  resetData: [],
}
export const DEFAULT_PERMISSIONS = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, Object.fromEntries(PERM_ROLES.map((r) => [r, ALLOW[c.key].includes(r)]))]),
)
// The one role-permission resolver. Owner is always allowed (can never lock themselves out).
export const can = (role, cap, settings) => {
  if (role === 'Owner') return true
  const o = settings && settings.permissions && settings.permissions[cap] && settings.permissions[cap][role]
  if (o !== undefined) return !!o
  return !!(DEFAULT_PERMISSIONS[cap] && DEFAULT_PERMISSIONS[cap][role])
}

// Prices are just the seePrices capability. (Kept as a named helper so existing call sites are stable.)
export const PRICE_VISIBLE = (role, settings) => can(role, 'seePrices', settings)

export function nextStage(s) {
  const i = STAGES.indexOf(s)
  return STAGES[Math.min(i + 1, STAGES.length - 1)]
}
export function prevStage(s) {
  const i = STAGES.indexOf(s)
  return i > 0 ? STAGES[i - 1] : s
}

// The app does NOT price orders — prices live in Accurate. We only surface a price
// when the customer's order/PO stated one, captured per line at intake/edit.
export function lineValue(line) {
  if (line.removed) return 0
  return (Number(line.price) || 0) * (Number(line.qty) || 1)
}
export function orderValue(o) {
  return (o.lines || []).reduce((s, l) => s + lineValue(l), 0)
}
export function orderPriced(o) {
  return (o.lines || []).some((l) => Number(l.price) > 0)
}
// Client-side credit exposure: the priced value of a customer's orders still in flight (not yet
// delivered/cancelled/returned) — what they currently owe-in-progress, to check against creditLimit.
// (Partial without a real Accurate receivables sync, but enough to flag an over-limit account.)
export function customerExposure(orders, customerId) {
  return (orders || [])
    .filter((o) => o.customerId === customerId && !['delivered', 'cancelled', 'returned'].includes(o.stage))
    .reduce((s, o) => s + orderValue(o), 0)
}
