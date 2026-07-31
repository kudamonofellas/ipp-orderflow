import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { getPosition, watchPosition, mapsLink, mapEmbed } from '../lib/geo.js'
import { publishLocation, subscribeLocation } from '../lib/live.js'
import { STAGE_LABEL, STAGE_COLOR, nextStage, prevStage, orderValue, orderPriced, PRICE_VISIBLE, isWeightUnit, isWeighed, lineLeft, orderPhotoIds, customerExposure, hasLeftWarehouse, lineFrozen, ACTOR, can } from '../lib/domain.js'
import { Stepper, Avatar, Line, PageHead, PhotoButton, DbImage, DbFileLink } from '../components/ui.jsx'
import { processPhoto } from '../lib/img.js'
import { savePhoto, deletePhoto } from '../lib/photos.js'
import { dateFull, dateShort, jt, rupiah, timeShort, dateCode } from '../lib/format.js'
import {
  ChevronLeft, Pencil, ArrowRight, Scale, Camera, Check, ShieldCheck,
  Scissors, Printer, Truck, Banknote, CircleCheck, FileText,
  PackagePlus, XCircle, Bell, Hourglass, PackageX, Navigation, MapPin, Plus, CircleX, Play, Pause, RotateCcw,
  Repeat, MessageCircle,
} from 'lucide-react'

// How a customer return is settled in Accurate. The choice drives whether we re-deliver a replacement
// (→ Cold Storage) or just close the order. Mirrors the warehouse/admin SOP (return note vs revised DO/SI,
// with or without replacement).
const RETURN_DOCS = [
  { key: 'return-note', label: 'Sales Return Note (no replacement)', replacement: false },
  { key: 'revise-return', label: 'Revise DO/SI — return only', replacement: false },
  { key: 'single-replace', label: 'Revised DO/SI — return + replacement', replacement: true },
  { key: 'separate-replace', label: 'Sales Return Note + replacement with new DO/SI', replacement: true },
]

// Silent background publisher: streams the COURIER's GPS to the relay while a delivery is open (no UI).
// Keyed by the COURIER (who), NOT the order — one courier carries several orders at once, so they all
// share the courier's single live position. (Cross-device once Firebase is connected.)
function DriverLive({ who }) {
  useEffect(() => { if (!who) return undefined; return watchPosition((p) => publishLocation(who, p), () => {}) }, [who])
  return null
}

// Office/owner view of a courier's CURRENT position — subscribes by the COURIER who took the order, so
// EVERY order that courier is holding shows the same marker. Updates across tabs now; across devices with Firebase.
function CourierLive({ who }) {
  const [pos, setPos] = useState(null)
  useEffect(() => { if (!who) return undefined; return subscribeLocation(who, setPos) }, [who])
  return (
    <div className="card card-pad mb" style={{ borderColor: 'var(--info)' }}>
      <div className="flex items gap mb"><Navigation size={15} style={{ color: 'var(--info)' }} /><b style={{ fontSize: 13 }}>{who || 'Courier'} — live location</b><span className="spacer" />{pos && <span className="tiny" style={{ color: 'var(--success-text)' }}>● live · {timeShort(pos.at)}</span>}</div>
      {pos
        ? <iframe title="courier-live" src={mapEmbed(pos.lat, pos.lng)} style={{ width: '100%', height: 210, border: 0, borderRadius: 8 }} loading="lazy" />
        : <div className="tiny muted">Waiting for the courier to start sharing… (they share automatically once they take a delivery)</div>}
    </div>
  )
}


export default function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { orders, products, customers, user, saveOrder, deleteOrder, createOrder, settings, t } = useStore()
  const order = orders.find((o) => o.id === id)
  // Freshest order for async callbacks (e.g. the GPS stamp that resolves seconds later). Saving with a
  // STALE `order` snapshot would clobber fields the courier added in the meantime — always merge into this.
  const orderRef = useRef(order); orderRef.current = order
  // Save AND advance orderRef synchronously, so a callback that fires before React re-renders (a GPS stamp
  // resolving right after "Mark delivered") still reads the just-written order instead of a stale snapshot.
  const commit = (o) => { orderRef.current = o; saveOrder(o) }
  const backorderOnce = useRef(false)   // one-shot guard — closeWithBackorder must never create two -B orders

  const [caps, setCaps] = useState(() => order?.draftCaps || {})  // { [lineId]: [{ w, photo }] } — weighings/photos, seeded from the order's saved draft so they survive leaving + reopening the order
  const [sendQty, setSendQty] = useState({})
  const [shortFlag, setShortFlag] = useState({})
  const [remindOn, setRemindOn] = useState(order?.deliver ? order.deliver.slice(0, 10) : '')
  const [verified, setVerified] = useState(false)
  const [fMethod, setFMethod] = useState(order?.payment.method || 'transfer')
  const [fTiming, setFTiming] = useState(order?.payment.timing || 'upfront')
  const [fPay, setFPay] = useState({ amount: '', bankRef: '', dueDate: '', codAmount: '' })
  const [cut, setCut] = useState({})
  const [took, setTook] = useState(false)
  // Delivery proof lives ON THE ORDER (not local state) so photos the courier takes PERSIST — they can
  // switch to another order and come back without losing them. Each change saves immediately.
  const PROOF_DEFAULT = { cond: null, recv: null, signed: null, cod: false, name: '' }
  const proof = order?.proof || PROOF_DEFAULT   // ?. — `order` may be undefined until the not-found guard below
  // Merge every proof change into the FRESHEST order (orderRef), not this render's snapshot: a photo's
  // onPick fires after processing (async), by which time the courier may have typed the name or added
  // another photo — spreading a stale `proof` would silently wipe those. This keeps each field additive.
  const setProofField = (patch) => { const o = orderRef.current; commit({ ...o, proof: { ...(o.proof || PROOF_DEFAULT), ...patch } }) }
  const [refusing, setRefusing] = useState(false)   // partial/whole refusal panel open
  const [refused, setRefused] = useState({})         // lineId → returned qty (counted) or 'all' (weight)
  const [refReasons, setRefReasons] = useState({})   // lineId → return reason (PER ITEM — items differ)
  const [refPhotos, setRefPhotos] = useState({})     // lineId → [IndexedDB photo ids] (MULTIPLE per item)
  const [busy, setBusy] = useState(false)            // async submit in flight (GPS + save) — disables the button
  const [uploading, setUploading] = useState(0)      // scale photos still processing — releasing now would drop them
  const [tp, setTp] = useState({ open: false, service: 'Gojek', ref: '' })  // 3rd-party courier handover form
  const [verifyQty, setVerifyQty] = useState({})  // warehouse-verified returned qty per line (returns flow)
  const [verifyWeight, setVerifyWeight] = useState({}) // warehouse-verified actual returned WEIGHT (kg) for loaf lines
  const [verifyPhoto, setVerifyPhoto] = useState({})   // scale photo of the returned weighing per line
  const [retDoc, setRetDoc] = useState('')         // admin's chosen Accurate return document
  const [retNotePhoto, setRetNotePhoto] = useState(null)   // optional photo of the printed Sales Return Note
  const [retPrinted, setRetPrinted] = useState(false)      // admin ticks "input in Accurate & printed"
  // Signed revised-DO/SI photo lives ON THE ORDER (not local state): with the parallel returns flow the
  // courier may capture it BEFORE the warehouse receives the goods — navigating away must not lose it.
  const retSignedPhoto = order?.returnSignedDraft || null
  const setRetSignedPhoto = (d) => { const o = orderRef.current; commit({ ...o, returnSignedDraft: d }) }
  const [docForm, setDocForm] = useState({ type: 'DO', number: '', note: '' })  // add-a-document form (the DO/SI/return-note log)
  const [relDoc, setRelDoc] = useState('')  // optional DO/SI number captured at the Finalise release
  const [noteText, setNoteText] = useState('')  // team-note composer (notes live on the order)
  // Keep in-progress weighings ON the order (draftCaps) so the warehouse can switch to another order and
  // come back without losing scale readings/photos — same fix as the courier's delivery proof. Only while
  // the order is still at Cold Storage; cleared on release. JSON-compare guards against a save loop.
  // NOTE: must sit ABOVE the not-found early return (hooks must run on every render).
  useEffect(() => {
    if (!order || order.stage !== 'cold') return
    if (JSON.stringify(order.draftCaps || {}) !== JSON.stringify(caps)) saveOrder({ ...order, draftCaps: caps })
  }, [caps, order?.stage])

  if (!order) return <div className="page"><div className="empty">Order not found.</div></div>

  const role = user.role
  const priceOk = PRICE_VISIBLE(role, settings)
  const hideCustInfo = !can(role, 'seeCustomerContact', settings)  // floor roles see name + items only
  const seeCredit = can(role, 'seeCustomerCredit', settings)
  const value = orderValue(order)
  const priced = orderPriced(order)
  // Act on a stage if it's your own queue (ACTOR), you're a permitted floor-helper (cold/production/
  // dispatch), or you may clear the Finance gate — all owner-configurable. Owner always can.
  const canAct = role === ACTOR[order.stage]
    || (['cold', 'production', 'packing', 'dispatch'].includes(order.stage) && can(role, 'helpOtherStages', settings))
    // Finance runs CONCURRENTLY with Cold Storage now — Finance can clear payment while the order is
    // still being weighed (the 'cold' stage IS the parallel prep phase), as well as at the 'finance' stage.
    || (['cold', 'finance'].includes(order.stage) && (role === 'Finance' || can(role, 'actFinanceGate', settings)))
    || role === 'Owner'
  // The ORDER is editable until it leaves the warehouse; individual CUT lines freeze earlier (lineFrozen,
  // enforced inside OrderEdit). So adding/adjusting items stays possible through Packing/Finalise/Dispatch
  // right up until the courier takes it.
  // 'outstanding' = a partial delivery already went out (truck left, customer signed for part) — lock it
  // too, even though its stage isn't 'dispatch' anymore (it still carries the handover flags).
  const editLocked = hasLeftWarehouse(order) || ['outstanding', 'cancelled', 'returned'].includes(order.stage)
  // Editing the order's LINES (qty / items / cuttings) is Admin/Owner only — the floor roles do their
  // stage action (weigh, cut, deliver) but must not change what was ordered.
  const canEdit = can(role, 'editOrders', settings) && (!editLocked || can(role, 'editAfterLock', settings))
  // A weighed item (kg/loaf) that's past Cold Storage with no weight was added/changed after weighing —
  // it needs to go back to be weighed before it can be invoiced (catch-weight). Flag it + offer the fix.
  const pastCold = ['finance', 'production', 'packing', 'finalise', 'dispatch'].includes(order.stage)
  // A weighed line with no weight = added/changed after Cold Storage. Skip a kg/gram line flagged SHORT
  // (it ran out — there's nothing to weigh). Only while the order is still in the building.
  const unweighedAdded = order.lines.filter((l) => !l.removed && isWeighed(l.unit) && !(Number(l.weight) > 0) && !((l.weighings || []).length) && !(isWeightUnit(l.unit) && l.short))
  const needsWeighing = pastCold && !hasLeftWarehouse(order) && unweighedAdded.length > 0
  // The banner only appears while the order is still in the warehouse (needsWeighing gates on
  // !hasLeftWarehouse), so the people who handle the goods can send it back to weigh the new item.
  const canWeighFix = role === 'Admin' || role === 'Owner' || role === 'Warehouse' || can(role, 'sendBackStage', settings)
  // Order-actions buttons, each gated by a capability AND the stage where it applies.
  const endState = ['delivered', 'cancelled', 'returned'].includes(order.stage)
  const act = {
    hold: can(role, 'holdResume', settings) && !order.hold && !endState,
    sendBack: can(role, 'sendBackStage', settings) && !['intake', 'delivered', 'cancelled', 'returned', 'outstanding', 'awaiting'].includes(order.stage),
    // Cancel absorbed "void": it works on ANY non-cancelled order (a mistake caught at any stage, even
    // after delivery). The order stays VISIBLE as Cancelled — never hidden — so no order number goes missing.
    cancel: can(role, 'cancelOrders', settings) && order.stage !== 'cancelled',
    // Reopen a genuinely-finished order (delivered / returned) — Owner-gated, restarts it fresh.
    reopen: can(role, 'reopenOrders', settings) && ['delivered', 'returned'].includes(order.stage),
    // Restore a cancelled order — whoever can cancel can undo it (resumes the exact stage it was cancelled from).
    restore: can(role, 'cancelOrders', settings) && order.stage === 'cancelled',
  }
  // Reorder = create a fresh order with the same items (weekly Horeca repeats) — office roles only.
  const canReorder = can(role, 'createOrders', settings)
  const anyOrderAction = act.hold || act.sendBack || act.cancel || act.reopen || act.restore || canReorder
  // Finance can UNDO an accidental payment clearance even after the order has moved past the gate — the
  // person who cleared it stays able to reverse it (they have no stage action at Production/Finalise).
  const canUndoClear = (role === 'Finance' || role === 'Owner' || can(role, 'actFinanceGate', settings)) &&
    order.payment && order.payment.confirmed && !order.hold && ['cold', 'finance', 'production', 'packing', 'finalise'].includes(order.stage)
  const isCatch = (l) => isWeighed(l.unit)  // weigh by the ORDER'S unit (kg/loaf), not the product flag
  // Weighing at Cold Storage is the warehouse's job (+ Admin / floor-helpers). NOT Finance — at Cold their
  // only job is clearing payment, so they see the Finance-gate card, never the weigh controls. canClearHere
  // (in the cold panel) is the matching gate for the payment side; the two never overlap for one role.
  const canWeighHere = role === 'Warehouse' || role === 'Owner' || (role !== 'Finance' && can(role, 'helpOtherStages', settings))
  const weighing = order.stage === 'cold' && canWeighHere
  const capNorm = (a) => (a && a.length ? a : [{ w: '', photo: null }])
  const getCaps = (lid) => capNorm(caps[lid])
  const setCap = (lid, i, patch) => setCaps((c) => ({ ...c, [lid]: capNorm(c[lid]).map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const addCap = (lid) => setCaps((c) => ({ ...c, [lid]: [...capNorm(c[lid]), { w: '', photo: null }] }))
  const removeCap = (lid, i) => setCaps((c) => { const a = capNorm(c[lid]).filter((_, j) => j !== i); return { ...c, [lid]: a.length ? a : [{ w: '', photo: null }] } })
  const numW = (s) => { const n = parseFloat(String(s).replace(',', '.')); return n > 0 ? n : 0 }  // id-ID comma decimals; reject negatives
  const capSum = (lid) => getCaps(lid).reduce((s, c) => s + numW(c.w), 0)
  // Track in-flight photo processing (uploading counter): tapping "Release" the instant after snapping
  // a photo used to silently drop it (the async save landed after the stage had already moved on).
  const onCapPhoto = (lid, i, e) => { const f = e.target.files && e.target.files[0]; if (!f) return; setUploading((u) => u + 1); processPhoto(f).then(savePhoto).then((id) => setCap(lid, i, { photo: id })).catch(() => {}).finally(() => setUploading((u) => u - 1)); e.target.value = '' }
  // Counted lines: each tap of "Add photo" captures ONE photo and appends it; remove by id.
  const addPhotoCap = (lid, e) => { const f = e.target.files && e.target.files[0]; if (!f) return; setUploading((u) => u + 1); processPhoto(f).then(savePhoto).then((id) => setCaps((c) => ({ ...c, [lid]: [...((c[lid] || []).filter((x) => x.photo)), { w: '', photo: id }] }))).catch(() => {}).finally(() => setUploading((u) => u - 1)); e.target.value = '' }
  const removeCapByPhoto = (lid, pid) => setCaps((c) => ({ ...c, [lid]: (c[lid] || []).filter((x) => x.photo !== pid) }))
  const linePhotos = (lid) => getCaps(lid).filter((c) => c.photo)
  const lineHasPhoto = (lid) => linePhotos(lid).length > 0
  const catchLines = order.lines.filter((l) => isWeighed(l.unit))
  const cutTasks = order.lines.flatMap((l) => (l.cuts || []).map((c) => ({ lname: l.name, c })))
  // Routing must look at cuts still TO DO — a re-entry run (nyusul / replacement / send-back) whose cuts
  // are already ticked must NOT detour through Production again just because cuts exist on the order.
  const cutsLeft = order.lines.some((l) => !l.removed && (l.cuts || []).some((c) => !c.done))

  const advance = (to, changes = {}, note, opts = {}) => {
    // Stamp the destination stage on the history entry so cycle-time reporting reads it directly,
    // instead of fuzzy-matching the free-text note against stage labels (which misses notes that
    // don't literally contain the label, e.g. "Packed — whole order ready").
    const now = new Date().toISOString()
    // Base on the freshest order (orderRef): the delivery/return handlers await GPS before calling this,
    // and a late condition-photo stamp may have merged in meanwhile — spreading a stale `order` would drop it.
    const o = orderRef.current
    // ONE-STEP SELF-UNDO: snapshot exactly the fields this move changes, pre-change. Whoever pressed
    // the button can step straight back ("pressed wrongly") as long as NOTHING else happened since —
    // no more being stranded because only Admin/Owner could reverse a mis-tap. opts.noUndo suppresses
    // it when the move had side effects outside this order (e.g. a backorder was created).
    const prev = { stage: o.stage }
    for (const k of Object.keys(changes)) prev[k] = o[k] === undefined ? null : o[k]
    if (to === 'delivered' && !('deliveredAt' in changes)) prev.deliveredAt = o.deliveredAt || null
    commit({ ...o, ...changes, stage: to,
      undo: opts.noUndo ? null : { by: user.name, at: now, prev },
      // Record WHEN it was actually delivered so the dashboard can count delivered today / this week /
      // month / year by real completion date (not the planned delivery date). Re-stamps on re-delivery —
      // unless the caller passes its own deliveredAt (restore of a cancelled-from-delivered order must
      // keep the ORIGINAL date, not pretend it was delivered today).
      ...(to === 'delivered' && !('deliveredAt' in changes) ? { deliveredAt: now } : {}),
      history: [...o.history, { at: now, who: user.name, role: user.role, what: note || `Moved to ${STAGE_LABEL[to]}`, stage: to }] })
  }

  const remaining = (l) => (Number(l.qty) || 0) - (Number(l.delivered) || 0) - (Number(l.returned) || 0)
  // How many of a counted line the warehouse is sending NOW (defaults to all that's left). Sending
  // fewer than `remaining` holds the rest back — it becomes outstanding after delivery → "Send the
  // rest now" (the "nyusul" / send-later flow).
  const sendingOf = (l) => { const v = sendQty[l.id]; return (v != null && v !== '') ? Math.max(0, Math.min(Number(v), remaining(l))) : remaining(l) }
  const owedLines = order.lines.filter((l) => lineLeft(l) > 0 || (isWeightUnit(l.unit) && l.short && !l.removed))

  // A NEW physical run is starting (nyusul rest / replacement): the previous run's proof is ARCHIVED to
  // proofLog (evidence is never deleted — it stays visible on the order) and the live proof + courier
  // assignment reset, so run 2 must capture its own photos and pick its courier. Without this, run 2
  // could be one-tap "delivered" carrying run 1's evidence.
  const archiveRun = (label) => ({
    ...HANDOVER_RESET,
    ...(order.proof && (order.proof.cond || order.proof.recv || order.proof.signed || order.proof.name)
      ? { proofLog: [...(order.proofLog || []), { at: new Date().toISOString(), label, ...order.proof }], proof: null }
      : {}),
  })

  // Outstanding decisions ----------------------------------------------------
  const sendRest = () => advance('cold', {
    ...archiveRun('Partial delivery'),
    lines: order.lines.map((l) => {
      if (isWeightUnit(l.unit)) return l.short ? { ...l, short: false, weight: null } : l
      return lineLeft(l) > 0 ? { ...l, sent: lineLeft(l) } : l
    }),
  }, 'Sending the rest — back to Cold Storage')

  const closeWithBackorder = () => {
    // Re-entrancy guard: a fast double-tap must not create TWO backorders (same class of bug as the
    // Intake double-confirm). The ref blocks the second call before React re-renders the panel away.
    if (backorderOnce.current) return
    backorderOnce.current = true
    const now = new Date().toISOString()
    const rem = owedLines.map((l) => ({
      // Fresh backorder line = exactly what's still owed. qty is the remaining amount, so delivered AND
      // returned must reset to 0 — otherwise the carried-over `returned` is subtracted a 2nd time
      // (qty=lineLeft already netted it out) and those units silently vanish from the backorder.
      // A kg line that PART-shipped (weighed some, then flagged short) only owes the difference —
      // re-ordering the full qty would double-ship the kg the customer already received.
      ...l, qty: isWeightUnit(l.unit) ? (Number(l.weight) > 0 ? Math.max(0, (Number(l.qty) || 0) - Number(l.weight)) || l.qty : l.qty) : lineLeft(l),
      delivered: 0, returned: 0, sent: undefined, short: false, weight: null, weighings: undefined, weighPhoto: null, photos: undefined,
      // return evidence + inbound-return tracking belong to the PARENT's story, never to the new shipment
      // (inheriting photo ids would also make deleting the -B garbage-collect photos the parent still shows)
      returnPhotos: undefined, returnReason: undefined, returnedWeight: undefined, returnedWeighPhoto: undefined, inboundReturn: undefined,
      cuts: (l.cuts || []).map((c) => ({ ...c, done: false })),
    }))
    createOrder({
      ...order, id: 'o' + Date.now().toString(36), no: order.no + '-B', backorderOf: order.no,
      stage: 'awaiting', remindOn: remindOn || null, lines: rem, closedShort: false, shortReason: null,
      // A fresh backorder — don't inherit the parent's cutting/handover, and explicitly NOT its delivery
      // evidence either (HANDOVER_RESET no longer touches proof/geo — those must survive on the PARENT,
      // but a new shipment starts with none). Same for the parent's RETURN artifacts + document log —
      // inheriting isReplacement/returnDoc would park the -B on the Returns strip while awaiting stock.
      ...CUT_RESET, ...HANDOVER_RESET, proof: null, proofLog: undefined, pickupGeo: null, deliverGeo: null,
      isReplacement: false, partialReturn: false, returnReceived: false, returnSettle: null, returnDoc: null,
      returnDocHandover: null, returnDispatch: null, returnedReason: null, docsReturned: false, documents: undefined,
      returnInbound: false, returnReceivedAt: null, returnSignedDoc: null, returnSignedDraft: null, returnNotePhoto: null,
      undo: null, deliveredAt: null, pickupAt: null, docsReturnedAt: null,
      // fresh shipment: no failed attempts / run position of its own yet. Team notes are KEPT on
      // purpose — gate codes & delivery instructions apply to the re-shipment too.
      failedAttempts: undefined, runSeq: undefined,
      // A backorder is a NEW shipment — re-gate Finance for it (don't inherit the parent's cleared payment,
      // else it skips Finance at Cold and never shows in the Finance queue).
      payment: { ...order.payment, confirmed: false, clearedAt: null, codReconciled: false },
      createdAt: now, history: [{ at: now, who: user.name, what: `Backorder of #${order.no}` }],
    })
    // noUndo: a -B order was just created — undoing only the parent would leave an orphan backorder.
    advance('delivered', { closedShort: true }, `Closed short — backorder #${order.no}-B created`, { noUndo: true })
  }

  const closeDrop = () => {
    const why = window.prompt(t('Why is the rest not going?'), '')
    if (why === null) return
    advance('delivered', { closedShort: true, shortReason: why || 'dropped' }, `Closed short — remainder dropped${why ? ` (${why})` : ''}`)
  }
  // Stock for a backorder never came — close the case as Cancelled (nothing delivered on it).
  const closeAwaiting = () => {
    const why = window.prompt(t('Why is the rest not going?'), 'stock never arrived')
    if (why === null) return
    advance('cancelled', { cancelled: true, shortReason: why || 'stock never arrived' }, `Closed — ${why || 'stock never arrived'}`)
  }

  // Production marks the moment cutting begins — this FREEZES the cut lines from edits and shows
  // "Cutting in progress" across the system, so the office knows the meat is being committed to spec.
  const startCutting = () => saveOrder({ ...order, cuttingStarted: true, cuttingStartedAt: new Date().toISOString(), cuttingStartedBy: user.name, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Started cutting' }] })
  // Moving an order BACKWARD (re-weigh, send-back, reopen) resets the "cutting started" status so it
  // isn't pre-frozen when it reaches Production again. Handover flags reset on reopen (a fresh delivery).
  const CUT_RESET = { cuttingStarted: false, cuttingStartedAt: null, cuttingStartedBy: null, reweighFrom: null, needsDocReprint: false }
  // Resets WHO carries the order (so the courier chooser re-appears and hasLeftWarehouse unlocks) but
  // NEVER the captured evidence — proof photos + GPS stamps SURVIVE undo/reopen/restore. Going back must
  // not delete data: the courier can replace/clear photos, but nothing is silently wiped.
  const HANDOVER_RESET = { takenBy: null, takenAt: null, pickup: false, thirdParty: false, courierService: null }
  // An added/changed weighed item past Cold Storage hasn't been weighed — send the WHOLE order back so it
  // is, remembering where it came from so it returns there (skipping Finance) once weighed. Don't
  // overwrite reweighFrom if it's already mid-loop (e.g. bounced again before returning).
  const sendToColdToWeigh = () => advance('cold', { ...CUT_RESET, reweighFrom: order.reweighFrom || order.stage }, 'Unweighed item — sent back to Cold Storage to weigh')
  const clearReprint = () => saveOrder({ ...order, needsDocReprint: false, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Updated DO/SI reprinted' }] })
  // The order's Accurate document log — DO / SI / return-note numbers. Optional + fill-in-anytime; one
  // order can carry SEVERAL (original delivery, return note, replacement DO), so they're kept as a running
  // list under the single order number for reconciliation against Accurate.
  const addDocument = (d) => saveOrder({ ...order, documents: [...(order.documents || []), { id: 'doc' + Date.now().toString(36), at: new Date().toISOString(), by: user.name, ...d }], history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: `Document logged — ${d.type} ${d.number}${d.note ? ' (' + d.note + ')' : ''}` }] })
  const removeDocument = (id) => saveOrder({ ...order, documents: (order.documents || []).filter((d) => d.id !== id) })
  const addFromDocForm = () => { const n = docForm.number.trim(); if (!n) return; addDocument({ type: docForm.type, number: n, note: docForm.note.trim() }); setDocForm({ type: 'DO', number: '', note: '' }) }
  // Undo an accidental Finance clearance: reset payment.confirmed and re-gate. If it already moved past the
  // gate (production/packing/finalise) it drops back to the Finance stage; if it's still at Cold (a parallel
  // clear, not yet weighed) it just un-clears in place so the Finance card re-appears.
  const undoClearance = () => {
    if (!window.confirm(t('Undo the payment clearance? The order goes back to the Finance gate to be re-checked.'))) return
    const repay = { payment: { ...order.payment, confirmed: false, clearedAt: null, codReconciled: false } }
    if (order.stage === 'cold') saveOrder({ ...order, ...repay, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Payment clearance undone (still at Cold Storage)' }] })
    else advance('finance', repay, 'Payment clearance undone — back to the Finance gate')
  }

  // Exception / exit-ramp actions (Admin/Owner) ------------------------------
  const toggleHold = () => saveOrder({ ...order, hold: !order.hold, history: [...order.history, { at: new Date().toISOString(), who: user.name, what: order.hold ? 'Resumed (off hold)' : 'Put on hold' }] })
  // Cancel = the single "this order is dead" action (absorbed the old Void). Remembers the stage it was
  // cancelled from so Restore can resume there. The order stays VISIBLE as Cancelled — never hidden.
  const cancelOrder = () => { const why = window.prompt(t('Cancel this order — reason? (stays on record + visible; you can restore it)'), ''); if (why === null) return; advance('cancelled', { cancelled: true, cancelledFrom: order.stage, shortReason: why || 'cancelled' }, `Cancelled${why ? ' — ' + why : ''}`) }
  // Undo a cancel — resume at the stage it was cancelled from, everything intact. A cancel with no
  // remembered stage (older auto-close from a return/backorder) restarts clean at Intake.
  const restoreCancelled = () => {
    if (!window.confirm(t('Restore this order and resume it where it left off?'))) return
    if (order.cancelledFrom) { advance(order.cancelledFrom, { cancelled: false, cancelledFrom: null, closedShort: false, ...(order.cancelledFrom === 'delivered' ? { deliveredAt: order.deliveredAt || null } : {}) }, 'Order restored'); return }
    const lines = order.lines.map((l) => ({ ...l, delivered: 0, returned: 0, sent: undefined, short: false }))
    advance('intake', { cancelled: false, closedShort: false, ...CUT_RESET, ...HANDOVER_RESET, lines, payment: { ...order.payment, confirmed: false, clearedAt: null, codReconciled: false } }, 'Order restored (reopened)')
  }
  // "Pressed wrongly" — undo YOUR last stage move. Restores the exact pre-move snapshot (stage +
  // every field the move changed; evidence photos are on the order, so nothing is lost). Only offered
  // while it's still the LAST thing that happened to the order (anyone acting after you closes the
  // window — then it's the office's send-back/reopen tools). Owner can always take it too.
  const lastH = order.history[order.history.length - 1]
  const canSelfUndo = !!(order.undo && order.undo.prev && (order.undo.by === user.name || role === 'Owner')
    && lastH && lastH.at === order.undo.at && order.stage !== 'cancelled')
  const undoMyStep = () => {
    const u = order.undo
    if (!u || !window.confirm(t('Undo your last step? The order goes back to where it was.'))) return
    commit({ ...order, ...u.prev, undo: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: `Undid — back to ${STAGE_LABEL[u.prev.stage] || u.prev.stage}`, stage: u.prev.stage }] })
  }

  // Pulling an order BACK from dispatch un-assigns the courier too (they no longer hold it) — the
  // chooser re-appears on the next release. In-progress proof photos stay (evidence is never deleted).
  const sendBackStage = () => { const to = prevStage(order.stage); const why = window.prompt(`${t('Send back to')} ${STAGE_LABEL[to]} — ${t('why?')}`, ''); if (why === null) return; advance(to, { ...CUT_RESET, ...(order.stage === 'dispatch' ? HANDOVER_RESET : {}) }, `Sent back to ${STAGE_LABEL[to]}${why ? ' — ' + why : ''}`) }
  const reopenOrder = () => {
    if (!window.confirm(t('Reopen this order? It returns to an active stage.'))) return
    // Reopen only exists on delivered/returned orders (a cancelled one uses Restore) → back to dispatch.
    // Reset each line's fulfilment so it can actually be re-delivered — a returned/closed order has
    // delivered/returned/sent set, which would otherwise leave 0 remaining and re-close instantly.
    const lines = order.lines.map((l) => ({ ...l, delivered: 0, returned: 0, sent: undefined, short: false }))
    // Also leave the RETURN sub-flow + the handover/cutting flags cleanly — otherwise stale flags make
    // the reopened order re-appear on the Returns strip, stay wrongly LOCKED (stale takenBy), or skip
    // the courier chooser. The re-delivery produces NEW paperwork + cash: docsReturned and the COD
    // reconciliation reset so the office chases them again.
    advance('dispatch', { closedShort: false, cancelled: false, partialReturn: false, returnedReason: null, isReplacement: false, returnReceived: false, returnSettle: null, returnDoc: null, returnDocHandover: null, returnDispatch: null, docsReturned: false, payment: { ...order.payment, codReconciled: false }, ...CUT_RESET, ...HANDOVER_RESET, lines }, 'Reopened')
  }

  // Customer-return workflow (the 'returned' stage):
  //  STEP 1 — Warehouse RECEIVES + VERIFIES the actual returned quantity (weigh/count), writing the
  //  verified figure back onto each line. STEP 2 — Admin picks how it's settled in Accurate; the chosen
  //  document decides whether a replacement is re-delivered (→ Cold Storage) or the order just closes.
  const receiveReturn = () => {
    const lines = order.lines.map((l) => {
      if (!(Number(l.returned) > 0)) return l
      const patch = { ...l }
      const lineW = Number(l.weight) || (isWeightUnit(l.unit) ? (Number(l.qty) || 0) : 0)   // total kg that left for this line
      // The courier's COUNT stands (the warehouse weighs, doesn't re-count) — so we only capture the
      // actual returned WEIGHT. Parse with numW (id-ID comma decimals), and hard-clamp to the line's
      // sent kg — you can't return more than left the warehouse.
      if (isWeightUnit(l.unit)) {
        const q = (verifyQty[l.id] == null || verifyQty[l.id] === '') ? null : numW(verifyQty[l.id])
        if (q != null && q > 0) patch.returned = lineW > 0 ? Math.min(q, lineW) : q   // kg/gram: the input IS the weight
        patch.returnedWeight = patch.returned
      } else if (isWeighed(l.unit)) {
        const w = numW(verifyWeight[l.id])
        if (w > 0) patch.returnedWeight = lineW > 0 ? Math.min(w, lineW) : w           // loaf: actual returned kg
      }
      if (verifyPhoto[l.id]) patch.returnedWeighPhoto = verifyPhoto[l.id]
      return patch
    })
    saveOrder({ ...order, lines, returnReceived: true, returnReceivedAt: new Date().toISOString(), history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Returned goods received & weighed at the warehouse' }] })
  }
  // Admin commits the chosen Accurate document. WITH replacement → the returned items re-enter the
  // main pipeline at Cold Storage (badged isReplacement) to be re-prepped + re-delivered. Sales Return
  // Note → confirm-print then close. Revised DO/SI → it goes OUT to the customer to be signed (a courier
  // run) before the order can close, so we hold it in the 'sign' sub-step.
  const processReturn = () => {
    const doc = RETURN_DOCS.find((d) => d.key === retDoc)
    if (!doc) return
    if (doc.replacement) {
      // The admin may order the replacement BEFORE the goods are physically back (the courier already
      // counted them) — then the inbound return is tracked in parallel: each line snapshots what's
      // coming back (inboundReturn) and the order carries returnInbound until the warehouse receives it.
      const pending = !order.returnReceived
      // Only the returned items re-fulfil (returned→0 re-opens lineLeft); kept lines (remaining 0)
      // auto-skip at Cold Storage. isReplacement keeps it visible on the Returns strip until delivered.
      const lines = order.lines.map((l) => Number(l.returned) > 0 ? { ...l, ...(pending ? { inboundReturn: Number(l.returned) } : {}), returned: 0, sent: undefined, short: false, weight: null, weighings: undefined, weighPhoto: null } : l)
      // archiveRun: the replacement is a NEW delivery run — first run's proof moves to proofLog, courier re-chosen.
      advance('cold', { returnReceived: false, returnInbound: pending, partialReturn: false, returnedReason: null, returnDoc: doc.label, returnSettle: null, isReplacement: true, ...CUT_RESET, ...archiveRun('First delivery (returned)'), lines }, `Return + replacement (${doc.label}) — back to Cold Storage${pending ? ' (return still coming back)' : ''}`)
    } else if (doc.key === 'revise-return') {
      // Revised DO/SI: issue it → it drops into the COURIER's queue to be delivered for signing (the courier
      // takes it with the tracked dispatch flow, not an admin-typed name). Stays 'returned'/'sign' until the
      // signed copy comes back as a photo.
      saveOrder({ ...order, returnDoc: doc.label, returnSettle: 'sign', returnDispatch: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Revised DO/SI issued — sent to the courier to deliver for signing' }] })
    } else {
      // Sales Return Note: nothing physical goes out — confirm it's printed, optional photo, then close.
      closeReturnNoReplacement({ returnDoc: doc.label, returnNotePhoto: retNotePhoto || null }, `Return closed — ${doc.label} (input in Accurate & printed)`)
    }
  }
  // Shared no-replacement close: write the returned units off (so the closed order isn't double-counted),
  // then settle to delivered (customer kept some) or cancelled (kept nothing). `extra` carries the proof.
  // Based on orderRef (closeSignedReturn awaits GPS before calling this — the closure `order` could be stale).
  const closeReturnNoReplacement = (extra, what) => {
    const o = orderRef.current
    // "Kept something" must NOT be read from l.delivered alone — weight (kg/gram) lines never carry a
    // delivered count (they're tracked by weight), so a kg order where the customer keeps part would
    // wrongly look like nothing was kept. partialReturn was set true at refusal whenever any line was
    // accepted, so it's the authoritative signal; the delivered check covers counted-unit lines.
    const keptSomething = !!o.partialReturn || o.lines.some((l) => Number(l.delivered) > 0)
    const lines = o.lines.map((l) => Number(l.returned) > 0 ? { ...l, returned: 0, short: false } : l)
    // A pre-return PARTIAL SEND may still owe units (never sent, courier never had them). Writing the
    // return off must NOT swallow that debt — route to Outstanding so the office decides (send/backorder/
    // drop). And this close is NOT "closed short" (no backorder exists) — that note was a fabrication.
    const owes = lines.some((l) => !l.removed && (lineLeft(l) > 0 || (isWeightUnit(l.unit) && l.short)))
    const to = owes ? 'outstanding' : (keptSomething ? 'delivered' : 'cancelled')
    advance(to, { lines, closedShort: false, cancelled: to === 'cancelled', partialReturn: false, returnSettle: 'done', returnReceived: false, ...extra }, what + (owes ? ' — rest still owed' : ''))
  }
  // The revised-DO/SI delivery is taken by the COURIER through the SAME tracked handover as the pipeline
  // dispatch (who + when, GPS + live location) — not an admin-typed name. Stored in order.returnDispatch.
  const takeReturnDispatch = (rd, note) => saveOrder({ ...order, returnDispatch: rd, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: note }] })
  const resetReturnDispatch = () => {
    if (!window.confirm(t('Change how the revised DO/SI is sent? Clears the current courier / pickup / service choice.'))) return
    saveOrder({ ...order, returnDispatch: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Return handover reset' }] })
    setTp({ open: false, service: 'Gojek', ref: '' })
  }
  // Signed copy came back → stamp the drop GPS (own courier) + close.
  const closeSignedReturn = async () => {
    setBusy(true)
    try {
      const rd = order.returnDispatch || {}
      let geo = null; if (rd.mode === 'delivery') { try { geo = await getPosition() } catch { /* denied */ } }
      // read the draft from the FRESHEST order (it persists across navigation now); promote → final field
      closeReturnNoReplacement({ returnSignedDoc: orderRef.current.returnSignedDraft || retSignedPhoto, returnSignedDraft: null, returnDispatch: { ...rd, deliverGeo: geo || rd.deliverGeo || null } }, 'Revised DO/SI signed & returned — order closed')
    } finally { setBusy(false) }
  }
  // INBOUND return (replacement ordered before the goods arrived): the warehouse receives + weighs
  // the returned goods while the replacement is already moving through the pipeline. Writes the same
  // evidence fields (returnedWeight / scale photo) as the normal receive.
  const receiveInbound = () => {
    const lines = order.lines.map((l) => {
      if (!(Number(l.inboundReturn) > 0)) return l
      const patch = { ...l }
      if (isWeighed(l.unit)) {
        const w = numW(verifyWeight[l.id]); if (w > 0) patch.returnedWeight = w
        if (verifyPhoto[l.id]) patch.returnedWeighPhoto = verifyPhoto[l.id]
      }
      return patch
    })
    saveOrder({ ...order, lines, returnInbound: false, returnReceived: true, returnReceivedAt: new Date().toISOString(), history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Returned goods received & weighed at the warehouse (replacement already in progress)' }] })
  }
  const undoInbound = () => {
    if (!window.confirm(t('Re-open the return for re-weighing? The warehouse will confirm it again.'))) return
    const seedW = {}, seedP = {}
    order.lines.forEach((l) => { if (Number(l.inboundReturn) > 0) {
      if (isWeighed(l.unit) && Number(l.returnedWeight) > 0) seedW[l.id] = String(l.returnedWeight)
      if (l.returnedWeighPhoto) seedP[l.id] = l.returnedWeighPhoto
    } })
    setVerifyWeight(seedW); setVerifyPhoto(seedP)
    saveOrder({ ...order, returnInbound: true, returnReceived: false, returnReceivedAt: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Return receive re-opened for re-weighing' }] })
  }

  // DELIVERY FAILED (outlet closed, nobody to receive) — NOT a return: no credit, no Accurate paperwork.
  // The goods come back, the order re-queues at Dispatch for another attempt; the attempt is logged and
  // the in-progress proof (e.g. the condition photo) is archived to proofLog as evidence of the try.
  const failDelivery = () => {
    const why = window.prompt(t('Why did the delivery fail? (e.g. outlet closed, nobody to receive)'), '')
    if (why === null) return
    const reason = why.trim() || t('could not deliver')
    saveOrder({ ...order, ...archiveRun('Failed delivery attempt'), failedAttempts: [...(order.failedAttempts || []), { at: new Date().toISOString(), by: user.name, reason }], history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: `Delivery failed — brought back (${reason})` }] })
    setTook(false); setTp({ open: false, service: 'Gojek', ref: '' })
  }

  // REORDER — Horeca customers repeat weekly; one tap builds a FRESH order (never spread the old one —
  // that's how fields leak) with the same items at intake, delivering tomorrow, next free number.
  const reorderOrder = () => {
    if (!window.confirm(t('Create a NEW order for this customer with the same items?'))) return
    const created = new Date()
    const deliver = new Date(created); deliver.setDate(deliver.getDate() + 1); deliver.setHours(9, 0, 0, 0)
    const dc = dateCode(deliver)
    const used = new Set(orders.filter((o) => o.no && o.no.startsWith(dc + '-')).map((o) => parseInt(o.no.split('-')[1]) || 0))
    let nn = 1; while (used.has(nn)) nn++
    let lid = 0
    const id = 'o' + Date.now().toString(36)
    createOrder({
      id, no: `${dc}-${String(nn).padStart(2, '0')}`,
      customerId: order.customerId, customerName: order.customerName, company: order.company || '', channel: order.channel || 'horeca',
      createdAt: created.toISOString(), deliver: deliver.toISOString(), sales: order.sales || '',
      payment: { method: (order.payment && order.payment.method) || 'transfer', timing: (order.payment && order.payment.timing) || 'upfront', confirmed: false },
      contact: order.contact || '', address: order.address || '', note: '', po: null, stage: 'intake',
      lines: order.lines.filter((l) => !l.removed).map((l) => ({ id: 'l' + Date.now() + ++lid, productId: l.productId || null, name: l.name, qty: l.qty, unit: l.unit, weight: null, status: l.productId ? 'recognized' : 'unrecognized', price: l.price || null, cuts: (l.cuts || []).filter((c) => (c.text || '').trim()).map((c, ci) => ({ id: 'c' + Date.now() + lid + '-' + ci, text: c.text, done: false })) })),
      history: [{ at: created.toISOString(), who: user.name, role: user.role, what: `Order created — reorder of #${order.no}` }],
    })
    nav('/orders/' + id)
  }

  // WhatsApp confirmation — orders ARRIVE via WA, so confirm back the same way. Customer-facing text
  // is Bahasa on purpose (not tied to the app language).
  const copyWA = async () => {
    const items = order.lines.filter((l) => !l.removed).map((l) => `• ${l.qty} ${l.unit} ${l.name}${(l.cuts || []).filter((c) => (c.text || '').trim()).length ? ' (' + l.cuts.map((c) => c.text).join(', ') + ')' : ''}`)
    // Indonesian date for the customer (dateFull is English-labelled — wrong language for this message)
    const d = new Date(order.deliver)
    const hariID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()]
    const bulanID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()]
    const txt = [
      `*Konfirmasi Pesanan #${order.no}*`,
      order.customerName + (order.company ? ` — ${order.company}` : ''),
      `Kirim: ${hariID}, ${d.getDate()} ${bulanID} ${d.getFullYear()}`,
      '', ...items,
      order.note ? `\nCatatan: ${order.note}` : null,
      '', 'Terima kasih 🙏', 'PT Inti Pangan Perkasa',
    ].filter((x) => x !== null).join('\n')
    try { await navigator.clipboard.writeText(txt) } catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    window.alert(t('Order confirmation copied — paste it into WhatsApp.'))
  }

  const addTeamNote = () => {
    const text = noteText.trim(); if (!text) return
    saveOrder({ ...order, notes: [...(order.notes || []), { at: new Date().toISOString(), who: user.name, role: user.role, text }] })
    setNoteText('')
  }

  // Mis-picked the document → step back to the document chooser.
  const undoSettle = () => saveOrder({ ...order, returnSettle: null, returnDoc: null })
  // OWNER override — step the whole return back to the weighing step to correct a mistake at any point.
  const reopenReceive = () => {
    if (!window.confirm(t('Re-open the return for re-weighing? The warehouse will confirm it again.'))) return
    // KEEP the verified weights + scale photos on the lines (going back never deletes data) and PRE-FILL
    // the verify inputs from them — the warehouse corrects what's wrong and re-confirms, instead of
    // re-entering everything from scratch. (kg lines already pre-fill from l.returned.)
    const seedW = {}, seedP = {}
    order.lines.forEach((l) => { if (Number(l.returned) > 0) {
      if (isWeighed(l.unit) && !isWeightUnit(l.unit) && Number(l.returnedWeight) > 0) seedW[l.id] = String(l.returnedWeight)
      if (l.returnedWeighPhoto) seedP[l.id] = l.returnedWeighPhoto
    } })
    setVerifyQty({}); setVerifyWeight(seedW); setVerifyPhoto(seedP)
    saveOrder({ ...order, returnReceived: false, returnReceivedAt: null, returnSettle: null, returnDoc: null, returnDocHandover: null, returnDispatch: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Return re-opened for re-weighing (owner override)' }] })
  }
  // Reset the handover choice (courier / pickup / 3rd-party) so it can be re-picked — e.g. the customer
  // who was going to collect now wants it delivered, or a different courier/service takes it.
  const changeHandover = () => {
    if (!window.confirm(t('Change how this order is handed over? Clears the courier / pickup / service choice — photos already taken are kept.'))) return
    // Only the ASSIGNMENT resets — the in-progress proof (photos/name/cash) is KEPT: the item-condition
    // shot is valid whoever ends up carrying it, and any field that no longer fits can be re-picked/cleared.
    saveOrder({ ...order, ...HANDOVER_RESET, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Handover method reset' }] })
    setTook(false); setTp({ open: false, service: 'Gojek', ref: '' })
  }

  // The Finance gate — rendered both at the 'finance' stage AND alongside Cold Storage (concurrent prep),
  // so Finance can clear payment without waiting for the warehouse. onClear(payment, note) decides what
  // happens after clearing (advance to Production at the finance stage, or just save while at cold).
  function renderFinanceGate(onClear) {
    const cust = customers.find((c) => c.id === order.customerId)
    const exposure = customerExposure(orders, order.customerId)
    const limit = cust ? Number(cust.creditLimit) || 0 : 0
    const overLimit = limit > 0 && fTiming === 'terms' && exposure > limit
    const canOverride = can(role, 'overrideCreditLimit', settings)
    const num = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0
    return (
      <div className="card card-pad">
        <div className="sec-label" style={{ marginTop: 0 }}>{t('Finance gate')}</div>
        <div className="flex between mb"><span className="muted tiny">Amount</span>{priced ? <b className="tnum">{jt(value)}</b> : <span className="tiny muted">priced in Accurate</span>}</div>
        {seeCredit && (fTiming === 'terms' || limit > 0) && (
          <div className="card card-pad mb" style={{ background: 'var(--surface-2)', borderColor: overLimit ? 'var(--danger)' : 'var(--border)' }}>
            <div className="flex between tiny"><span className="muted">{t('Account exposure (in flight)')}</span><b className="tnum">{jt(exposure)}</b></div>
            <div className="flex between tiny" style={{ marginTop: 4 }}><span className="muted">{t('Credit limit')}</span><b className="tnum">{limit ? jt(limit) : '—'}</b></div>
            {overLimit && <div className="tiny" style={{ marginTop: 6, color: 'var(--danger-text)' }}>⚠ {canOverride ? t('Over credit limit — confirm with the owner before clearing.') : t('Over credit limit — only Finance or the owner can clear this.')}</div>}
          </div>
        )}
        <div className="grid2 mb">
          <div className="field" style={{ margin: 0 }}><label>{t('Method')}</label>
            <select className="input" value={fMethod} onChange={(e) => { setFMethod(e.target.value); setVerified(false) }}><option value="transfer">Transfer</option><option value="cash">Cash</option></select>
          </div>
          <div className="field" style={{ margin: 0 }}><label>{t('Timing')}</label>
            <select className="input" value={fTiming} onChange={(e) => { setFTiming(e.target.value); setVerified(false) }}><option value="upfront">Upfront (pay first)</option><option value="cod">COD</option><option value="terms">Terms</option></select>
          </div>
        </div>
        {fTiming !== 'cod' && <div className="field" style={{ margin: '0 0 10px' }}><label>{t('Amount received (Rp, optional)')}</label><input className="input" inputMode="numeric" value={fPay.amount} placeholder={priced ? String(value) : ''} onChange={(e) => setFPay({ ...fPay, amount: e.target.value })} /></div>}
        {fMethod === 'transfer' && fTiming !== 'cod' && <div className="field" style={{ margin: '0 0 10px' }}><label>{t('Bank reference (optional)')}</label><input className="input" value={fPay.bankRef} onChange={(e) => setFPay({ ...fPay, bankRef: e.target.value })} /></div>}
        {fTiming === 'cod' && <div className="field" style={{ margin: '0 0 10px' }}><label>{t('COD amount to collect (Rp)')}</label><input className="input" inputMode="numeric" value={fPay.codAmount} placeholder={priced ? String(value) : ''} onChange={(e) => setFPay({ ...fPay, codAmount: e.target.value })} /></div>}
        {fTiming === 'upfront' && fMethod === 'transfer' && !verified && (
          <button className="btn btn-secondary btn-block mb" onClick={() => setVerified(true)}><Check size={15} /> I verified it in our bank</button>
        )}
        {fTiming === 'upfront' && fMethod === 'cash' && !verified && (
          <button className="btn btn-secondary btn-block mb" onClick={() => setVerified(true)}><Banknote size={15} /> Cash received</button>
        )}
        {fTiming === 'upfront' && verified && <div className="chip chip-success mb">Payment confirmed</div>}
        <button className="btn btn-primary btn-block" disabled={(fTiming === 'upfront' && !verified) || (overLimit && !canOverride)}
          onClick={() => {
            const payment = {
              method: fMethod, timing: fTiming, confirmed: true,
              amount: num(fPay.amount) || (priced ? value : null),
              bankRef: fPay.bankRef || null,
              codAmount: fTiming === 'cod' ? (num(fPay.codAmount) || (priced ? value : null)) : null,
              dueDate: (fTiming === 'terms' && cust && Number(cust.termDays) > 0 && order.deliver) ? new Date(new Date(order.deliver).getTime() + Number(cust.termDays) * 86400000).toISOString().slice(0, 10) : null,
              codReconciled: false,
              clearedAt: new Date().toISOString(),
            }
            const note = fTiming === 'cod' ? `COD ${payment.codAmount ? jt(payment.codAmount) : ''} — cleared`
              : fTiming === 'terms' ? `Terms${overLimit ? ' (over limit, owner-approved)' : ''} — cleared`
              : `Paid ${payment.amount ? jt(payment.amount) : ''}${payment.bankRef ? ' · ' + payment.bankRef : ''} — cleared`
            onClear(payment, note)
          }}>
          <ShieldCheck size={16} /> Clear — OK to proceed
        </button>
      </div>
    )
  }

  // Plain render function — NOT a nested component. Rendering it as <Panel /> made React treat it as
  // a brand-new component type every render (the function identity changes each render), so it would
  // unmount + remount the whole action panel on every state change — visible flicker + lost input focus.
  // Calling renderPanel() inlines its JSX into OrderDetail's tree, so it's stable. (It has no hooks.)
  function renderPanel() {
    // ON HOLD genuinely freezes the pipeline: the stage action panel is replaced by a hold notice, so
    // NO stage can advance until resumed. Checked BEFORE the canAct gate so the SINGLE Resume control
    // (Admin/Owner) always shows here — the Order-actions section no longer duplicates it.
    if (order.hold && !['delivered', 'cancelled', 'returned'].includes(order.stage)) {
      const canResume = can(role, 'holdResume', settings)
      return (
        <div className="card card-pad" style={{ borderColor: 'var(--warning)' }}>
          <div className="flex items gap mb"><Pause size={16} style={{ color: 'var(--warning-text)' }} /><b style={{ color: 'var(--warning-text)' }}>{t('On hold')}</b></div>
          <div className="tiny muted mb">{t('This order is paused — the process cannot continue until it is resumed.')}</div>
          {canResume
            ? <button className="btn btn-primary btn-block" onClick={toggleHold}><Play size={16} /> {t('Resume order')}</button>
            : <div className="tiny muted">{t('An admin or owner must resume it to continue.')}</div>}
        </div>
      )
    }

    if (!canAct && !['delivered', 'cancelled', 'returned'].includes(order.stage)) return <div className="card card-pad muted tiny">This order is with {ACTOR[order.stage]} now. You can view it, but the action is theirs.</div>

    switch (order.stage) {
      case 'intake':
        return <button className="btn btn-primary btn-block" onClick={() => advance('cold', {}, 'Sent to Cold Storage')}><ArrowRight size={16} /> {t('Send to Cold Storage')}</button>

      case 'cold': {
        const otherLines = order.lines.filter((l) => !isCatch(l))
        // A counted item being held back entirely (sending 0 now) needs no weight or photo — there's
        // nothing leaving the warehouse for it today; it just stays owed for a later run.
        // "Held back, nothing leaving today" — needs no weight/photo: a counted line being sent at 0,
        // OR a kg/gram line flagged short (ran out → there's nothing to weigh or photograph).
        // Short: the tap this visit wins; otherwise the flag PERSISTED on the line (a re-visit must not
        // demand re-tapping Short on a line already marked short last time).
        const isShort = (l) => (shortFlag[l.id] != null ? !!shortFlag[l.id] : !!l.short)
        const held = (l) => (!isWeightUnit(l.unit) && sendingOf(l) === 0) || (isWeightUnit(l.unit) && isShort(l))
        // Photos already SAVED on the line (a previous visit / reopen) count — only genuinely
        // photo-less lines block when the owner requires scale photos.
        const photosOk = !settings.requirePhoto || order.lines.every((l) => lineHasPhoto(l.id) || (l.photos || []).length > 0 || l.weighPhoto || held(l))
        // Already-weighed lines (e.g. on a re-visit to Cold — added item, reopen, replacement) pass
        // without forcing a re-weigh of everything; only the genuinely-unweighed line needs a weight.
        const ready = catchLines.every((l) => capSum(l.id) > 0 || Number(l.weight) > 0 || held(l)) && photosOk
        // Cold Storage + Finance run CONCURRENTLY. The order sits at 'cold' while the warehouse weighs AND
        // Finance clears payment, independently. Whoever's role can weigh / can clear sees their own card.
        const cleared = !!(order.payment && order.payment.confirmed)
        // canWeighHere is defined once up top (gates both the weigh controls and this card). Clearing the
        // Finance gate is Finance's authority alone (Owner always; or anyone the owner grants 'actFinanceGate').
        // Admin can no longer clear it.
        const canClearHere = role === 'Finance' || role === 'Owner' || can(role, 'actFinanceGate', settings)
        return (
          <>
            {canWeighHere && (
              <div className="card card-pad mb">
                <div className="sec-label">{t('Pull & weigh')}</div>
                <div className="tiny" style={{ marginBottom: 8, color: cleared ? 'var(--success-text)' : 'var(--text-2)' }}>{cleared ? '✓ ' + t('Payment already cleared by Finance') : '⏳ ' + t('Finance is clearing payment in parallel')}</div>
                <div className="tiny muted mb">{t('Weigh each item above and snap the scale — tap "+ Add weighing" to log several scale loads that total up (e.g. 80 kg as 4 × 20 kg). Short on an item? In the "Sending" box set how many you\'re sending now — the rest is kept as a later delivery. A kg item that ran out gets a "short" flag.')}</div>
                {catchLines.length === 0 && otherLines.every((l) => l.qty <= 1) && <div className="tiny muted mb">Nothing to weigh — add a proof photo on each item above if you want.</div>}
                <button className="btn btn-primary btn-block" disabled={!ready || uploading > 0}
                  onClick={() => {
                    const newLines = order.lines.map((l) => {
                      let nl = { ...l }
                      const cs = getCaps(l.id).filter((c) => numW(c.w) > 0 || c.photo)
                      const photoIds = cs.map((c) => c.photo).filter(Boolean)
                      // Only overwrite the weighing when this line was actually (re-)weighed this visit; an
                      // untouched line keeps its existing weight/weighings/photos from {...l} (no wipe).
                      if (isWeighed(l.unit) && cs.length) {
                        const total = cs.reduce((s, c) => s + (numW(c.w) || 0), 0)
                        if (total > 0) nl.weight = total
                        nl.weighings = cs.filter((c) => numW(c.w) > 0).map((c) => ({ weight: numW(c.w), photoId: c.photo || null }))
                      }
                      if (isWeightUnit(l.unit)) nl.short = (shortFlag[l.id] != null) ? !!shortFlag[l.id] : !!l.short
                      if (!isWeightUnit(l.unit)) nl.sent = sendingOf(l)
                      if (photoIds.length) { nl.photos = photoIds; nl.weighPhoto = photoIds[0] }
                      return nl
                    })
                    const needsCut = newLines.some((l) => !l.removed && (l.cuts || []).some((c) => !c.done))
                    const originPastProd = ['packing', 'finalise', 'dispatch'].includes(order.reweighFrom)
                    // If Finance already cleared, skip the Finance stage → Production/Finalise. If not, the
                    // order waits at 'finance' for them. (A re-weigh returns to its origin, as before.)
                    const normalTarget = cleared ? (cutsLeft ? 'production' : 'finalise') : 'finance'
                    const target = order.reweighFrom ? ((needsCut && originPastProd) ? 'production' : order.reweighFrom) : normalTarget
                    const reached = !!order.reweighFrom && target === order.reweighFrom
                    advance(target, { lines: newLines, draftCaps: null, ...(reached ? { reweighFrom: null, needsDocReprint: true } : {}) },
                      reached ? `Re-weighed — back to ${STAGE_LABEL[target]} (reprint DO/SI)` : (order.reweighFrom ? 'Weighed — to Production for the new cut' : (cleared ? 'Weighed — payment already cleared, moving on' : 'Weighed & released to Finance')))
                  }}>
                  <ArrowRight size={16} /> {uploading > 0 ? t('Saving photo…') : (cleared ? t('Weighed — release') : t('Release to Finance'))}
                </button>
              </div>
            )}
            {canClearHere && !cleared && renderFinanceGate((payment, note) => saveOrder({ ...order, payment, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: note + ' — in parallel with Cold Storage' }] }))}
            {canClearHere && cleared && <div className="card card-pad"><div className="flex items gap"><CircleCheck size={15} style={{ color: 'var(--success-text)' }} /><span className="tiny">{t('Payment cleared — waiting on weighing')}</span></div></div>}
          </>
        )
      }

      case 'finance': {
        // Reached only when the warehouse weighed BEFORE finance cleared. If payment is somehow already
        // confirmed (e.g. an order sent back from production), DON'T re-clear it (that would wipe the real
        // payment record) — just continue forward.
        if (order.payment && order.payment.confirmed) return (
          <div className="card card-pad">
            <div className="flex items gap mb"><CircleCheck size={15} style={{ color: 'var(--success-text)' }} /><b className="tiny">{t('Payment already cleared')}</b></div>
            <button className="btn btn-primary btn-block" onClick={() => advance(cutsLeft ? 'production' : 'finalise', {}, 'Continued — payment already cleared')}><ArrowRight size={16} /> {t('Continue')}</button>
          </div>
        )
        return renderFinanceGate((payment, note) => advance(cutsLeft ? 'production' : 'finalise', { payment }, note))
      }

      case 'production': {
        const done = cutTasks.every((t) => cut[t.c.id])
        return (
          <div className="card card-pad">
            {cutTasks.length > 0 && (order.cuttingStarted
              ? <div className="tiny mb" style={{ color: 'var(--success-text)', fontWeight: 600 }}><Scissors size={12} style={{ verticalAlign: '-2px' }} /> {t('Cutting in progress')}{order.cuttingStartedAt ? ` · ${timeShort(order.cuttingStartedAt)}` : ''}{order.cuttingStartedBy ? ` · ${order.cuttingStartedBy}` : ''}</div>
              : <><button className="btn btn-secondary btn-block mb" onClick={startCutting}><Scissors size={15} /> {t('Start cutting')}</button><div className="tiny muted mb" style={{ marginTop: -4 }}>{t('Marks the order as being cut — locks these items from edits.')}</div></>)}
            <div className="sec-label">{t('Cut · tick each cutting')}</div>
            {cutTasks.length === 0 && <div className="tiny muted mb">No cutting needed.</div>}
            {cutTasks.map((t) => (
              <button key={t.c.id} className={'btn btn-secondary btn-block mb' + (cut[t.c.id] ? ' on' : '')} style={cut[t.c.id] ? { borderColor: 'var(--success)', color: 'var(--success-text)' } : { justifyContent: 'flex-start' }} onClick={() => setCut({ ...cut, [t.c.id]: !cut[t.c.id] })}>
                {cut[t.c.id] ? <CircleCheck size={15} /> : <Scissors size={15} />} {t.lname} — {t.c.text}
              </button>
            ))}
            <button className="btn btn-primary btn-block" disabled={!done} onClick={() => {
              const lines = order.lines.map((l) => ({ ...l, cuts: (l.cuts || []).map((c) => ({ ...c, done: cut[c.id] || c.done })) }))
              // Normal flow → packing. A re-weigh detour (reweighFrom set) returns straight to where it
              // came from with a reprint flag, skipping packing/finalise it already passed.
              const back = order.reweighFrom
              advance(back || 'packing', { lines, ...(back ? { reweighFrom: null, needsDocReprint: true } : {}) }, back ? `Cut done — back to ${STAGE_LABEL[back]} (reprint DO/SI)` : 'Cutting done — back to warehouse to pack')
            }}><ArrowRight size={16} /> {t('Cutting done → to packing')}</button>
          </div>
        )
      }

      case 'packing': {
        // After production cuts, the warehouse collects the cut pieces and packs them with the rest.
        const cutItems = order.lines.filter((l) => (l.cuts || []).length && !l.removed)
        const otherItems = order.lines.filter((l) => !(l.cuts || []).length && !l.removed)
        return (
          <div className="card card-pad">
            <div className="sec-label">{t('Pack the order')}</div>
            <div className="tiny muted mb">{t('Cutting is done. Collect the cut pieces from production and pack them together with the rest of the order, then mark it packed.')}</div>
            {cutItems.length > 0 && <div className="tiny" style={{ marginBottom: 4 }}><b>{cutItems.length}</b> {t('cut item(s)')}: {cutItems.map((l) => l.name).join(', ')}</div>}
            {otherItems.length > 0 && <div className="tiny muted mb"><b>{otherItems.length}</b> {t('other item(s)')}: {otherItems.map((l) => l.name).join(', ')}</div>}
            <button className="btn btn-primary btn-block" onClick={() => advance('finalise', {}, 'Packed — whole order ready')}><CircleCheck size={16} /> {t('Packed & ready')}</button>
          </div>
        )
      }

      case 'finalise':
        // One button: printing the DO or SI means it's keyed into Accurate, so this both confirms and releases.
        return (
          <div className="card card-pad">
            <input className="input mb" placeholder={t('DO / SI number (optional)')} value={relDoc} onChange={(e) => setRelDoc(e.target.value)} />
            <button className="btn btn-primary btn-block" onClick={() => {
              const n = relDoc.trim()
              // Optionally log the printed DO/SI number against the order (auto-tagged original vs replacement).
              const docs = n ? [...(order.documents || []), { id: 'doc' + Date.now().toString(36), type: 'DO/SI', number: n, note: order.isReplacement ? 'replacement delivery' : 'original delivery', at: new Date().toISOString(), by: user.name }] : null
              // Printing here IS the reprint — clear the "reprint DO/SI" reminder from a re-weigh loop.
              advance('dispatch', { needsDocReprint: false, ...(docs ? { documents: docs } : {}) }, n ? `DO/SI printed (${n}) — released to dispatch` : 'Document printed — released to dispatch')
              setRelDoc('')
            }}><Printer size={16} /> {t('Delivery Order (Surat Jalan) or Sales Invoice (Faktur Penjualan) Printed')}</button>
          </div>
        )

      case 'dispatch': {
        // Taking the job = "courier assigned" (no GPS yet). The PICKUP is stamped later, when the
        // courier takes the item-condition photo (the goods actually leaving the warehouse).
        // The order leaves either by COURIER DELIVERY or CUSTOMER SELF-PICKUP — both still capture proof.
        // Choose how the order leaves: our own courier, customer self-pickup, or an online courier service.
        if (!took && !order.takenBy && !order.pickup && !order.thirdParty) return (
          <div className="card card-pad">
            {(order.failedAttempts || []).length > 0 && (() => { const fa = order.failedAttempts[order.failedAttempts.length - 1]; return (
              <div className="tiny mb" style={{ color: 'var(--warning-text)' }}><PackageX size={12} style={{ verticalAlign: -2 }} /> {t('Attempt')} {order.failedAttempts.length + 1} — {t('last attempt failed')}: {fa.reason} · {dateShort(fa.at)} {timeShort(fa.at)}</div>
            ) })()}
            {!tp.open ? (<>
              <button className="btn btn-primary btn-block mb" onClick={() => { saveOrder({ ...order, takenBy: user.name, takenAt: new Date().toISOString() }); setTook(true) }}><Truck size={16} /> {t('Take this delivery')}</button>
              <button className="btn btn-secondary btn-block mb" onClick={() => { saveOrder({ ...order, pickup: true }); setTook(true) }}><PackagePlus size={15} /> {t('Customer is picking up')}</button>
              <button className="btn btn-secondary btn-block" onClick={() => setTp({ ...tp, open: true })}><Navigation size={15} /> {t('Send by online courier (Gojek / Grab …)')}</button>
            </>) : (<>
              {/* once the online-courier form is open, it's the only choice shown — one method at a time */}
              <div className="tiny muted mb">{t('Send by online courier (Gojek / Grab …)')}</div>
              <select className="input mb" value={tp.service} onChange={(e) => setTp({ ...tp, service: e.target.value })}>
                {['Gojek', 'Grab', 'Paxel', 'Lalamove', 'Other'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="input mb" placeholder={t('Tracking / order ref (optional)')} value={tp.ref} onChange={(e) => setTp({ ...tp, ref: e.target.value })} />
              <div className="flex gap">
                <button className="btn btn-secondary" onClick={() => setTp({ ...tp, open: false })}>{t('Cancel')}</button>
                <button className="btn btn-success grow" onClick={() => { saveOrder({ ...order, thirdParty: true, courierService: { name: tp.service, ref: tp.ref.trim() } }); setTook(true) }}>{t('Hand to')} {tp.service}</button>
              </div>
            </>)}
          </div>
        )
        const mode = order.thirdParty ? 'third' : (order.pickup ? 'pickup' : 'delivery')
        const svc = order.courierService || {}
        const cod = order.payment.timing === 'cod'
        const proofReq = settings.dispatchProofRequired !== false   // owner can make the proof photos optional (Settings)
        // SOP: photograph the item's condition FIRST, before recording who received it or processing a
        // return — so the state of the goods on arrival is always documented. Gate the rest on it.
        const condFirst = proofReq && !proof.cond
        // delivery/pickup need the received-by name + the 3 photos; a 3rd-party handover needs the condition
        // (handover) photo. COD always needs the cash-collected toggle.
        // The SIGNED INVOICE (Surat Jalan / Faktur) is the delivery confirmation — always required to
        // mark delivered. The condition + received-by photos are governed by the proof-photos setting.
        const proofDone = !!(proof.name.trim() && proof.signed && (!proofReq || (proof.cond && proof.recv)))
        const ready = mode === 'third'
          ? (!proofReq || proof.cond)   // 3rd-party: just the handover photo; the service collects any COD + remits later
          : (proofDone && (!cod || proof.cod))
        const recvLabel = mode === 'third' ? t('Photo of the package / courier') : (mode === 'pickup' ? t('Photo of who collected') : t('Photo of who received'))
        const nameLabel = mode === 'third' ? t('Driver name (optional)') : ((mode === 'pickup' ? t('Collected by') : t('Received by')) + ' — name')
        // A PARTIAL return means the customer kept some goods. Those accepted items follow the normal
        // delivery SOP — so the same proof (received-by name, condition + who-received photos, and the
        // signed/amended "coret" invoice) is REQUIRED before we can confirm the return. A full return
        // (nothing kept) needs none of that — just the returned-goods photo.
        const refSentOf = (l) => (l.sent != null) ? Number(l.sent) : remaining(l)
        // numW — the refusal amount is typed by the courier with an id-ID comma ("2,5" kg). Number()
        // would read that as NaN (and a digits-only strip turned it into 25!). And a weight line's real
        // ceiling is the WEIGHED kg that actually went out (l.weight), not the nominal ordered qty —
        // "5 kg" weighed at 4.8 and fully refused must close as a FULL return, not "kept 0.2 kg".
        const refNum = (l) => numW(refused[l.id])
        const sentKgOf = (l) => (Number(l.weight) > 0 ? Number(l.weight) : (Number(l.qty) || 0))
        const someRefused = order.lines.some((l) => !l.removed && refNum(l) > 0)
        const refKept = order.lines.some((l) => !l.removed && (isWeightUnit(l.unit)
          ? refNum(l) < sentKgOf(l)
          : Math.min(refNum(l), refSentOf(l)) < refSentOf(l)))
        const refuseReady = someRefused && (mode === 'third' || !refKept || proofDone)
        const markLabel = mode === 'third' ? t('Mark handed over') : (mode === 'pickup' ? t('Mark picked up') : t('Mark delivered'))
        return (
          <>
          {/* Publish GPS ONLY from the courier who actually holds the order — an office viewer opening
              this panel must not overwrite the courier's live position with their own device's location. */}
          {mode === 'delivery' && order.takenBy === user.name && <DriverLive who={order.takenBy} />}
          {/* The ADDRESS is not "customer contact" for the person doing the run — without it the courier
              can't deliver. hideCustInfo still hides phone/sales elsewhere; the destination always shows
              to whoever is acting on the dispatch. */}
          {mode !== 'pickup' && (!hideCustInfo || canAct) && order.address ? (
            <div className="card card-pad mb">
              <div className="flex items between gap">
                <div className="grow"><div className="tiny muted">{t('Deliver to')}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.address}</div></div>
                <a className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(order.address)} target="_blank" rel="noreferrer"><Navigation size={14} /> {t('Navigate')}</a>
              </div>
              {order.payment && order.payment.timing === 'cod' && order.payment.codAmount ? <div className="chip chip-warning" style={{ marginTop: 8 }}>{t('Collect COD')} {jt(order.payment.codAmount)}</div> : null}
            </div>
          ) : null}
          <div className="card card-pad">
            <div className="flex items between">
              <div className="sec-label" style={{ margin: 0 }}>{mode === 'third' ? t('Handover proof') : (mode === 'pickup' ? t('Proof of pickup') : t('Proof of delivery'))}</div>
              {/* whoever is acting on this dispatch (canAct, guaranteed here) can switch courier/pickup/service */}
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)', flexShrink: 0 }} onClick={changeHandover}><RotateCcw size={13} /> {t('Change method')}</button>
            </div>
            {mode === 'third' ? <div className="tiny muted mb">{t('Handed to')} {svc.name}{svc.ref ? ` · ${svc.ref}` : ''}</div> : (mode === 'pickup' ? <div className="tiny muted mb">{t('Customer pickup — collected at the warehouse')}</div> : (order.takenBy ? <div className="tiny muted mb">{t('Taken by')} {order.takenBy}{order.takenAt ? ` · ${timeShort(order.takenAt)}` : ''}</div> : null))}
            {/* Save the condition photo immediately; the GPS stamp resolves LATER, so it must merge into the
                freshest order (orderRef) and NOT re-write proof — otherwise a late fix would wipe fields the
                courier added after tapping (received-by, name, signed) or even revert a delivered order. */}
            <PhotoButton block value={proof.cond} onPick={(d) => { setProofField({ cond: d }); if (mode === 'delivery' && !order.pickupGeo) getPosition().then((g) => { const o = orderRef.current; if (o) commit({ ...o, pickupGeo: g, pickupAt: new Date().toISOString() }) }).catch(() => {}) }} label={t('Item condition photo (pickup)')} />
            {condFirst ? (
              <div className="tiny" style={{ color: 'var(--info-text)', margin: '2px 2px 0' }}>{t('Photograph the item condition first — then record who received it, or process a return.')}</div>
            ) : (<>
            <PhotoButton block value={proof.recv} onPick={(d) => setProofField({ recv: d })} label={recvLabel} />
            <input className="input mb" placeholder={nameLabel} value={proof.name} onChange={(e) => setProofField({ name: e.target.value })} />
            <PhotoButton block value={proof.signed} onPick={(d) => setProofField({ signed: d })} label={t('Signed invoice') + (mode !== 'third' ? ' · ' + t('required') : '')} />
            {mode !== 'third' && !proof.signed && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '-4px 2px 9px' }}>{t('Add the signed-invoice photo to mark delivered.')}</div>}
            {cod && mode !== 'third' && (
              <button className={'btn btn-secondary btn-block mb' + (proof.cod ? ' on' : '')} style={{ justifyContent: 'flex-start', ...(proof.cod ? { borderColor: 'var(--success)', color: 'var(--success-text)' } : {}) }} onClick={() => setProofField({ cod: !proof.cod })}>
                {proof.cod ? <CircleCheck size={15} /> : <Banknote size={15} />} Cash collected{priced ? ` — ${jt(value)}` : ''}
              </button>
            )}
            <button className="btn btn-success btn-block" disabled={!ready || busy} onClick={async () => {
              setBusy(true)
              try {
                let geo = null; if (mode === 'delivery') { try { geo = await getPosition() } catch { /* denied/unavailable — deliver anyway */ } }
                // Read the FRESHEST order after the up-to-10s GPS wait — proof photos or edits saved
                // meanwhile must ride along, not get reverted by this render's stale snapshot.
                const cur = orderRef.current
                const curProof = cur.proof || PROOF_DEFAULT
                const lines = cur.lines.map((l) => {
                  if (isWeightUnit(l.unit)) return l
                  const sent = (l.sent != null) ? Number(l.sent) : remaining(l)
                  return { ...l, delivered: (Number(l.delivered) || 0) + sent, sent: undefined }
                })
                const owes = lines.some((l) => lineLeft(l) > 0 || (isWeightUnit(l.unit) && l.short))
                const pf = { name: curProof.name, cond: curProof.cond, recv: curProof.recv, signed: curProof.signed, cod: !!curProof.cod }
                const who = mode === 'third' ? `handed to ${svc.name}${svc.ref ? ' (' + svc.ref + ')' : ''}` : (mode === 'pickup' ? `picked up by ${proof.name} (customer pickup)` : `received by ${proof.name}`)
                advance(owes ? 'outstanding' : 'delivered', { lines, proof: pf, deliverGeo: mode === 'delivery' ? (geo || order.deliverGeo || null) : null }, owes ? `Delivered part — ${who}, rest outstanding` : `Delivered — ${who}`)
              } finally { setBusy(false) }
            }}><CircleCheck size={16} /> {busy ? t('Saving…') : markLabel}</button>
            {refusing ? (
              <div className="card card-pad mt" style={{ borderColor: 'var(--danger)' }}>
                <div className="sec-label">{t('What did the customer refuse?')}</div>
                <div className="tiny muted mb">{t('Each item can have its own reason + photos — different items may come back for different reasons.')}</div>
                {order.lines.filter((l) => !l.removed).map((l) => {
                  const weight = isWeightUnit(l.unit)  // kg/gram: allow a decimal amount; counted units: whole numbers
                  const isRef = refNum(l) > 0
                  const pics = refPhotos[l.id] || []
                  return (
                    <div key={l.id} className="mb" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 9 }}>
                      <div className="flex items between" style={{ gap: 8 }}>
                        <span className="grow tiny">{l.name} <span className="muted">· {l.qty} {l.unit}</span></span>
                        <span className="flex items" style={{ gap: 8, flexShrink: 0 }}>
                          <input className="input" style={{ width: 64, textAlign: 'right' }} inputMode={weight ? 'decimal' : 'numeric'} placeholder="0"
                            value={refused[l.id] ?? ''}
                            onChange={(e) => {
                              let s = e.target.value
                              s = weight ? s.replace(/[^\d.,]/g, '') : s.replace(/[^\d]/g, '')   // keep the id-ID comma — numW parses it
                              setRefused((p) => ({ ...p, [l.id]: s }))  // functional form — never drop another line's value
                            }} />
                          <span className="tiny muted" style={{ width: 70, flexShrink: 0 }}>{t('of')} {l.qty} {l.unit}</span>
                        </span>
                      </div>
                      {isRef && (
                        <div style={{ marginTop: 7 }}>
                          <input className="input mb" placeholder={t('Reason (optional)')} value={refReasons[l.id] || ''} onChange={(e) => setRefReasons((p) => ({ ...p, [l.id]: e.target.value }))} />
                          <div className="flex items gap" style={{ flexWrap: 'wrap' }}>
                            {pics.map((pid) => (
                              <span key={pid} style={{ position: 'relative', display: 'inline-block' }}>
                                <DbImage id={pid} style={{ height: 42, borderRadius: 4, display: 'block' }} />
                                <CircleX size={16} onClick={() => setRefPhotos((p) => ({ ...p, [l.id]: (p[l.id] || []).filter((x) => x !== pid) }))} style={{ position: 'absolute', top: -7, right: -7, cursor: 'pointer', color: 'var(--danger-text)', background: 'var(--surface)', borderRadius: '50%' }} />
                              </span>
                            ))}
                            <PhotoButton value={null} onPick={(pid) => setRefPhotos((p) => ({ ...p, [l.id]: [...(p[l.id] || []), pid] }))} label={t('Add photo')} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button className="btn btn-ghost btn-sm mb" onClick={() => { const all = {}; order.lines.filter((l) => !l.removed).forEach((l) => { all[l.id] = String(isWeightUnit(l.unit) ? sentKgOf(l) : (Number(l.qty) || 0)) }); setRefused(all) }}>{t('Refuse the whole order')}</button>
                {someRefused && refKept && mode !== 'third' && !proofDone && (
                  <div className="tiny" style={{ color: 'var(--warning-text)', margin: '0 2px 9px' }}>{t('The customer kept some items — add the delivery proof above (received-by name, photos, and the signed/amended invoice) for those.')}</div>
                )}
                <div className="flex gap">
                  <button className="btn btn-secondary" disabled={busy} onClick={() => { setRefusing(false); setRefused({}); setRefReasons({}); setRefPhotos({}) }}>{t('Cancel')}</button>
                  <button className="btn btn-danger grow" disabled={!refuseReady || busy} onClick={async () => {
                    setBusy(true)
                    try {
                      let geo = null; if (mode === 'delivery') { try { geo = await getPosition() } catch { /* denied/unavailable */ } }
                      // Read the FRESHEST order after the GPS wait — anything saved meanwhile must not be reverted.
                      const cur = orderRef.current
                      const active = cur.lines.filter((l) => !l.removed)
                      // How much of each line the customer refused — a kg amount for weight lines (numW: id-ID
                      // comma; ceiling = the WEIGHED kg that actually shipped), a count otherwise.
                      const refOf = (l) => Math.max(0, Math.min(refNum(l), isWeightUnit(l.unit) ? sentKgOf(l) : (Number(l.qty) || 0)))
                      // Counted lines: only what was actually SENT from Cold Storage reached the customer, so the
                      // refusal (and the delivered credit) is measured against `sent`, not the ordered qty — any
                      // never-sent remainder stays owed and routes to Outstanding. Mirrors the Mark-delivered handler.
                      const sentOf = (l) => (l.sent != null) ? Number(l.sent) : remaining(l)
                      const lines = cur.lines.map((l) => {
                        if (l.removed) return l
                        const reason = (refReasons[l.id] || '').trim(); const photos = refPhotos[l.id] || []
                        // A refusal is NOT a shortage — it doesn't make the order "owe" the item, so clear short.
                        // Each returned item carries ITS OWN reason + photos (CR: item-level return details).
                        if (isWeightUnit(l.unit)) { const ret = refOf(l); return ret > 0 ? { ...l, returned: (Number(l.returned) || 0) + ret, short: false, returnReason: reason, returnPhotos: photos } : l }
                        const sent = sentOf(l)
                        const ret = Math.min(refOf(l), sent)
                        const base = { ...l, returned: (Number(l.returned) || 0) + ret, delivered: (Number(l.delivered) || 0) + (sent - ret), sent: undefined }
                        return ret > 0 ? { ...base, returnReason: reason, returnPhotos: photos } : base
                      })
                      const owes = lines.some((l) => lineLeft(l) > 0 || (isWeightUnit(l.unit) && l.short))
                      // "accepted" = something actually received and kept (so it isn't a whole-order return)
                      const anyAccepted = active.some((l) => isWeightUnit(l.unit) ? refOf(l) < sentKgOf(l) : Math.min(refOf(l), sentOf(l)) < sentOf(l))
                      const summary = active.filter((l) => refOf(l) > 0).map((l) => `${refOf(l)} ${l.unit} ${l.name}`).join(', ') || '—'
                      // Order-level reason = a de-duplicated summary of the per-item reasons, for the history line.
                      const why = [...new Set(active.filter((l) => refOf(l) > 0).map((l) => (refReasons[l.id] || '').trim()).filter(Boolean))].join('; ') || 'refused'
                      const pf = { name: proof.name, cond: proof.cond, recv: proof.recv, signed: proof.signed }
                      const who = mode === 'third' ? `handed to ${svc.name}${svc.ref ? ' (' + svc.ref + ')' : ''}` : (mode === 'pickup' ? `picked up by ${proof.name} (customer pickup)` : (proof.name ? `received by ${proof.name}` : ''))
                      // A return starts the return workflow: goods come back to the warehouse, the warehouse
                      // confirms receipt, then an admin settles. (partialReturn flags that the customer kept some.)
                      advance('returned', { lines, proof: pf, returnedReason: why, partialReturn: anyAccepted, returnReceived: false, deliverGeo: mode === 'delivery' ? (geo || order.deliverGeo || null) : null }, `Return — ${summary} coming back to warehouse${who ? `, ${who}` : ''} (${why})`)
                    } finally { setBusy(false) }
                  }}><XCircle size={15} /> {busy ? t('Saving…') : t('Confirm return')}</button>
                </div>
              </div>
            ) : (
              <>
                <button className="btn btn-ghost btn-block mt" style={{ color: 'var(--danger-text)', justifyContent: 'center' }} onClick={() => setRefusing(true)}><XCircle size={15} /> {t('Customer refused / returned')}</button>
                {mode !== 'third' && <button className="btn btn-ghost btn-block" style={{ color: 'var(--warning-text)', justifyContent: 'center' }} onClick={failDelivery}><PackageX size={15} /> {t('Delivery failed — bring back & retry')}</button>}
              </>
            )}
            </>)}
          </div>
          </>
        )
      }

      case 'outstanding': {
        return (
          <div className="card card-pad">
            <div className="flex items gap mb"><PackageX size={16} style={{ color: 'var(--warning-text)' }} /><b>{t('Part delivered — the rest is still owed')}</b></div>
            <div className="tiny muted mb">{t('You sent part of this order today. Below is what is still owed — choose what to do with it:')}</div>
            <div className="mb" style={{ padding: '8px 10px', background: 'var(--warning-bg, var(--surface-2))', borderRadius: 8 }}>
              {owedLines.map((l) => (
                <div key={l.id} className="tiny" style={{ color: 'var(--warning-text)', padding: '2px 0', fontWeight: 600 }}>
                  • {isWeightUnit(l.unit) ? `${l.name} — ${t('Short — ran out of stock')}` : `${lineLeft(l)} ${l.unit} ${l.name} ${t('still owed')}`}
                </div>
              ))}
            </div>
            <div className="sec-label">{t('What do you want to do?')}</div>

            {/* 1 — do the nyusul now (a second delivery run for what is left) */}
            <button className="btn btn-primary btn-block" onClick={sendRest}><PackagePlus size={16} /> {t('Send the rest now')}</button>
            <div className="tiny muted" style={{ margin: '4px 2px 14px' }}>{t('Stock is ready — run a second delivery for what is left.')}</div>

            {/* 2 — nyusul later: keep the remainder as a backorder with a reminder date */}
            <div className="card card-pad mb" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items gap" style={{ fontWeight: 600, fontSize: 13 }}><Bell size={14} /> {t('Send later — remind me')}</div>
              <div className="tiny muted" style={{ margin: '4px 0 9px' }}>{t('Close today\'s delivery; keep the rest as a backorder that reappears on a date.')}</div>
              <div className="flex items gap mb"><span className="tiny muted">{t('Reminder date')}</span>
                <input type="date" className="input" style={{ maxWidth: 168 }} value={remindOn} onChange={(e) => setRemindOn(e.target.value)} /></div>
              <button className="btn btn-secondary btn-block" onClick={closeWithBackorder}>{t('Create backorder')} #{order.no}-B →</button>
            </div>

            {/* 3 — change of mind: finish the order as-is, do NOT send the rest */}
            <button className="btn btn-danger-outline btn-block" onClick={closeDrop}><CircleCheck size={15} /> {t('Finish — don\'t send the rest')}</button>
            <div className="tiny muted" style={{ margin: '4px 2px 0' }}>{t('Mark the order done as delivered. The remainder is dropped (no longer needed / written off) — nothing follows later.')}</div>
          </div>
        )
      }

      case 'awaiting': {
        const due = order.remindOn && new Date(order.remindOn) <= new Date()
        return (
          <div className="card card-pad">
            <div className="flex items gap mb"><Hourglass size={16} style={{ color: 'var(--text-2)' }} /><b>{t('Awaiting stock — backorder')}</b></div>
            {order.backorderOf && <div className="tiny muted" style={{ marginBottom: 4 }}>{t('Backorder of')} #{order.backorderOf}</div>}
            {order.remindOn && <div className="tiny" style={{ marginBottom: 9, color: due ? 'var(--warning-text)' : 'var(--text-2)' }}><Bell size={12} style={{ verticalAlign: '-2px' }} /> {t('Reminder date')}: {dateShort(order.remindOn)}</div>}
            <div className="tiny muted mb">{t('Waiting for stock to come in.')}</div>
            <button className="btn btn-primary btn-block mb" onClick={() => advance('cold', {}, 'Stock arrived — activated')}><ArrowRight size={16} /> {t('Activate — stock arrived')}</button>
            <button className="btn btn-ghost btn-block" style={{ color: 'var(--text-2)', justifyContent: 'flex-start' }} onClick={closeAwaiting}><XCircle size={15} /> {t('Close — stock did not arrive')}</button>
          </div>
        )
      }

      case 'delivered':
        return (
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <CircleCheck size={30} style={{ color: order.closedShort ? 'var(--warning)' : 'var(--c-done)' }} />
            <div className="h2 mt">{order.closedShort ? 'Closed — delivered short' : 'Delivered & closed'}</div>
            {order.closedShort && order.shortReason ? <div className="tiny muted mt">Remainder dropped · {order.shortReason}</div> : null}
            {order.closedShort && !order.shortReason ? <div className="tiny muted mt">Remainder carried to backorder #{order.no}-B</div> : null}
            {order.partialReturn ? <div className="tiny mt" style={{ color: 'var(--danger-text)' }}>{t('Partial return')}: {order.lines.filter((l) => Number(l.returned) > 0).map((l) => `${l.returned} ${l.unit} ${l.name}`).join(', ')}{order.returnedReason ? ` · ${order.returnedReason}` : ''}</div> : null}
          </div>
        )

      case 'cancelled':
        return (
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <XCircle size={30} style={{ color: 'var(--text-3)' }} />
            <div className="h2 mt">{t('Cancelled')}</div>
            {order.shortReason ? <div className="tiny muted mt">{order.shortReason}</div> : null}
            {order.backorderOf ? <div className="tiny muted mt">{t('Backorder of')} #{order.backorderOf}</div> : null}
          </div>
        )

      case 'returned': {
        const returnedLines = order.lines.filter((l) => Number(l.returned) > 0 && !l.removed)
        // What the customer KEPT — for weight lines it's (ordered − returned) since they carry no
        // delivered count; for counted lines it's the delivered tally.
        const keptOf = (l) => isWeightUnit(l.unit) ? ((Number(l.qty) || 0) - (Number(l.returned) || 0)) : Number(l.delivered) || 0
        const keptLines = order.lines.filter((l) => !l.removed && keptOf(l) > 0)
        const canReceive = ['Warehouse', 'Owner'].includes(user.role)   // the WAREHOUSE receives — not the courier
        const canDecide = ['Admin', 'Owner'].includes(user.role)        // the ADMIN settles the Accurate document
        const canSign = ['Admin', 'Courier', 'Owner'].includes(user.role) // the courier who carries the revised DO/SI can capture the signed copy
        // The courier already COUNTED the returned units; the warehouse WEIGHS them (catch-weight) — it
        // doesn't re-count — so the count here is read-only and only the actual kg is captured (numW
        // handles id-ID comma decimals). vQty = the kg input for a kg/gram line; vWt = the loaf weight.
        const vQty = (l) => { const v = verifyQty[l.id]; return (v == null || v === '') ? (Number(l.returned) || 0) : numW(v) }
        const vWt = (l) => numW(verifyWeight[l.id])
        // You can never return MORE kg than was sent. lineWeight = the whole line's weighed kg (Cold
        // Storage's l.weight, or the ordered kg for an unweighed kg line) — the HARD ceiling. propWeight
        // = the returned loaves' share of it; exceeding that is a SOFT flag (individual loaves vary), not
        // a block, so a heavier-than-average returned loaf isn't wrongly rejected.
        const sentCount = (l) => (Number(l.delivered) || 0) + (Number(l.returned) || 0)
        const lineWeight = (l) => Number(l.weight) || (isWeightUnit(l.unit) ? (Number(l.qty) || 0) : 0)
        const propWeight = (l) => { const sc = sentCount(l); return sc > 0 ? lineWeight(l) * ((Number(l.returned) || 0) / sc) : lineWeight(l) }
        const wtOf = (l) => isWeightUnit(l.unit) ? vQty(l) : (isWeighed(l.unit) ? vWt(l) : 0)
        const overHard = (l) => { const lw = lineWeight(l); return lw > 0 && wtOf(l) > lw + 1e-9 }
        const overSoft = (l) => isWeighed(l.unit) && !isWeightUnit(l.unit) && propWeight(l) > 0 && vWt(l) > propWeight(l) + 1e-9 && !overHard(l)
        const overLine = returnedLines.find((l) => overHard(l))
        const weighReady = !overLine && returnedLines.every((l) => isWeightUnit(l.unit) ? vQty(l) > 0 : (isWeighed(l.unit) ? vWt(l) > 0 : true))
        const doc = RETURN_DOCS.find((d) => d.key === retDoc)
        return (
          <div className="card card-pad" style={{ borderColor: 'var(--danger)' }}>
            <div className="flex items gap mb"><RotateCcw size={16} style={{ color: 'var(--danger-text)' }} /><b>{t('Customer return')}</b></div>
            <div className="mb" style={{ padding: '8px 10px', background: 'var(--danger-bg)', borderRadius: 8 }}>
              {returnedLines.map((l) => (
                <div key={l.id} style={{ padding: '3px 0' }}>
                  <div className="tiny" style={{ color: 'var(--danger-text)', fontWeight: 600 }}>• {l.returned} {l.unit} {l.name} {t('returned')}{!isWeightUnit(l.unit) && Number(l.returnedWeight) > 0 ? ` · ${Number(l.returnedWeight).toFixed(2)} kg` : ''}</div>
                  {l.returnReason ? <div className="tiny" style={{ color: 'var(--danger-text)', opacity: 0.85, marginLeft: 10 }}>— {l.returnReason}</div> : null}
                  {(l.returnPhotos || []).length > 0 && <div className="flex items gap" style={{ flexWrap: 'wrap', marginLeft: 10, marginTop: 3 }}>{l.returnPhotos.map((pid) => <DbImage key={pid} id={pid} open style={{ height: 40, borderRadius: 4 }} />)}</div>}
                </div>
              ))}
              {keptLines.map((l) => <div key={'k' + l.id} className="tiny muted" style={{ padding: '2px 0' }}>✓ {keptOf(l)} {l.unit} {l.name} {t('kept by customer')}</div>)}
            </div>
            {order.returnedReason ? <div className="tiny muted mb">{t('Reason')}: {order.returnedReason}</div> : null}

            {!order.returnReceived ? (
              /* STEP 1 — WAREHOUSE receives the goods + verifies the actual quantity (weigh / count) */
              canReceive ? (<>
                <div className="sec-label">{t('Warehouse — receive & verify')}</div>
                <div className="tiny muted mb">{t('Weigh or count what actually came back, then confirm.')}</div>
                {returnedLines.map((l) => {
                  // A loaf is COUNTED but invoiced by WEIGHT (catch-weight) — like at Cold Storage, weigh
                  // the returned loaf so the credit / revised DO/SI is based on actual kg, not a loaf count.
                  const loafLike = isWeighed(l.unit) && !isWeightUnit(l.unit)
                  const lw = lineWeight(l)
                  return (
                    <div key={l.id} className="mb" style={{ paddingBottom: 6, borderBottom: returnedLines.length > 1 ? '0.5px solid var(--border)' : 'none' }}>
                      <div className="flex items between" style={{ gap: 8 }}>
                        <span className="grow tiny">{l.name}</span>
                        <span className="flex items" style={{ gap: 8, flexShrink: 0 }}>
                          {isWeightUnit(l.unit) ? (
                            <input className="input" style={{ width: 70, textAlign: 'right', ...(overHard(l) ? { borderColor: 'var(--danger)' } : {}) }} inputMode="decimal"
                              value={verifyQty[l.id] ?? String(l.returned)}
                              onChange={(e) => setVerifyQty((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                          ) : (
                            /* the courier already counted the units — the warehouse confirms + weighs, it doesn't re-count */
                            <span className="tiny tnum" style={{ fontWeight: 600 }}>{l.returned}</span>
                          )}
                          <span className="tiny muted" style={{ width: 40 }}>{l.unit}</span>
                        </span>
                      </div>
                      {loafLike && (
                        <div className="flex items between" style={{ gap: 8, marginTop: 6 }}>
                          <span className="grow tiny muted">{t('Actual returned weight')}{lw > 0 ? ` · ${t('sent')} ${propWeight(l).toFixed(2)} kg` : ''}</span>
                          <span className="flex items" style={{ gap: 8, flexShrink: 0 }}>
                            <input className="input" style={{ width: 70, textAlign: 'right', ...(overHard(l) ? { borderColor: 'var(--danger)' } : (overSoft(l) ? { borderColor: 'var(--warning)' } : {})) }} inputMode="decimal" placeholder="0.00"
                              value={verifyWeight[l.id] ?? ''}
                              onChange={(e) => setVerifyWeight((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                            <span className="tiny muted" style={{ width: 40 }}>kg</span>
                          </span>
                        </div>
                      )}
                      {overHard(l) && <div className="tiny" style={{ color: 'var(--danger-text)', marginTop: 4 }}>{t("Can't return more than was sent")} — {lw.toFixed(2)} kg.</div>}
                      {overSoft(l) && <div className="tiny" style={{ color: 'var(--warning-text)', marginTop: 4 }}>{t('More than the usual weight for')} {l.returned} {l.unit} (~{propWeight(l).toFixed(2)} kg) — {t('double-check')}.</div>}
                      {isWeighed(l.unit) && (
                        <div style={{ marginTop: 6 }}>
                          <PhotoButton block value={verifyPhoto[l.id]} onPick={(d) => setVerifyPhoto((p) => ({ ...p, [l.id]: d }))} label={t('Scale photo') + ' · ' + t('optional')} />
                        </div>
                      )}
                    </div>
                  )
                })}
                {!weighReady && !overLine && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '0 2px 9px' }}>{t('Weigh each returned loaf — the credit is based on actual kg.')}</div>}
                <button className="btn btn-primary btn-block" disabled={!weighReady} onClick={receiveReturn}><CircleCheck size={16} /> {t('Confirm received & weighed')}</button>
              </>) : <div className="tiny muted">{t('Coming back to the warehouse — waiting for the warehouse to receive & verify the goods.')}</div>
            ) : (
              <div className="flex items between" style={{ marginBottom: 10, gap: 8 }}>
                <span className="tiny" style={{ color: 'var(--success-text)' }}><CircleCheck size={12} style={{ verticalAlign: '-2px' }} /> {t('Received & verified at the warehouse')}{order.returnReceivedAt ? ` · ${timeShort(order.returnReceivedAt)}` : ''}</span>
                {['Warehouse', 'Owner'].includes(user.role) && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, color: 'var(--text-2)' }} onClick={reopenReceive}><RotateCcw size={13} /> {t('Re-open & re-weigh')}</button>}
              </div>
            )}
            {/* ADMIN side — runs IN PARALLEL with the physical receive (like Finance ∥ Cold Storage):
                the courier already COUNTED what's coming back, so the replacement and the revised
                document can be prepared before the goods arrive. Only the kg credit needs the scale. */}
            <div style={!order.returnReceived ? { borderTop: '0.5px solid var(--border)', paddingTop: 11, marginTop: 10 } : undefined}>
              {order.returnSettle === 'sign' ? (
                  /* STEP 3 — the revised DO/SI is OUT with the customer to sign; the courier who carries it
                     (or an admin) captures the signed copy to close. Only an admin can switch documents. */
                  canSign ? (() => {
                    const rd = order.returnDispatch
                    // NOT taken yet → the COURIER takes the revised DO/SI for signing — the SAME tracked
                    // handover as a normal dispatch (take + GPS, or self-collect, or an online courier).
                    if (!rd || !rd.takenBy) return (<>
                      <div className="sec-label">{t('Take the revised DO/SI for signing')}</div>
                      <div className="tiny muted mb">{t('Carry the revised DO/SI to the customer, get it signed, and bring the signed copy back.')}</div>
                      {!tp.open ? (<>
                        <button className="btn btn-primary btn-block mb" onClick={() => takeReturnDispatch({ mode: 'delivery', takenBy: user.name, takenAt: new Date().toISOString() }, 'Courier took the revised DO/SI to deliver for signing')}><Truck size={16} /> {t('Take this delivery')}</button>
                        <button className="btn btn-secondary btn-block mb" onClick={() => takeReturnDispatch({ mode: 'pickup', takenBy: user.name, takenAt: new Date().toISOString() }, 'Customer collects the revised DO/SI to sign')}><PackagePlus size={15} /> {t('Customer collects & signs')}</button>
                        <button className="btn btn-secondary btn-block" onClick={() => setTp({ ...tp, open: true })}><Navigation size={15} /> {t('Send by online courier (Gojek / Grab …)')}</button>
                      </>) : (<>
                        <div className="tiny muted mb">{t('Send by online courier (Gojek / Grab …)')}</div>
                        <select className="input mb" value={tp.service} onChange={(e) => setTp({ ...tp, service: e.target.value })}>
                          {['Gojek', 'Grab', 'Paxel', 'Lalamove', 'Other'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input className="input mb" placeholder={t('Tracking / order ref (optional)')} value={tp.ref} onChange={(e) => setTp({ ...tp, ref: e.target.value })} />
                        <div className="flex gap">
                          <button className="btn btn-secondary" onClick={() => setTp({ ...tp, open: false })}>{t('Cancel')}</button>
                          <button className="btn btn-success grow" onClick={() => takeReturnDispatch({ mode: 'third', service: tp.service, ref: tp.ref.trim(), takenBy: user.name, takenAt: new Date().toISOString() }, `Revised DO/SI handed to ${tp.service}`)}>{t('Hand to')} {tp.service}</button>
                        </div>
                      </>)}
                      {canDecide && <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={undoSettle}>{t('Change document')}</button>}
                    </>)
                    // TAKEN → deliver, capture the signed copy → close (own courier also streams live GPS)
                    return (<>
                      {rd.mode === 'delivery' && rd.takenBy === user.name && <DriverLive who={rd.takenBy} />}
                      <div className="sec-label">{t('Revised DO/SI — out for signing')}</div>
                      <div className="tiny muted mb">{t('Taken by')} {rd.takenBy}{rd.takenAt ? ` · ${timeShort(rd.takenAt)}` : ''}{rd.mode === 'third' && rd.service ? ` · ${rd.service}${rd.ref ? ' (' + rd.ref + ')' : ''}` : ''}{rd.mode === 'pickup' ? ` · ${t('customer collects')}` : ''} · <span onClick={resetReturnDispatch} style={{ color: 'var(--info)', cursor: 'pointer' }}>{t('change')}</span></div>
                      <PhotoButton block value={retSignedPhoto} onPick={setRetSignedPhoto} label={t('Photo of the signed DO/SI') + ' · ' + t('required')} />
                      {!retSignedPhoto && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '-4px 2px 9px' }}>{t('Add the signed-DO/SI photo to close the order.')}</div>}
                      {retSignedPhoto && !order.returnReceived && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '-4px 2px 9px' }}>{t('The order closes only after the warehouse receives the goods.')}</div>}
                      <button className="btn btn-primary btn-block" disabled={!retSignedPhoto || busy || !order.returnReceived} onClick={closeSignedReturn}><CircleCheck size={16} /> {busy ? t('Saving…') : t('Mark signed & close')}</button>
                      {canDecide && <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={undoSettle}>{t('Change document')}</button>}
                    </>)
                  })() : <div className="tiny muted">{t('Revised DO/SI is out with the customer to sign — waiting for the signed copy.')}</div>
                ) : (
                  /* STEP 2 — ADMIN picks the Accurate document; the choice closes the order, sends it to sign, or re-sends */
                  canDecide ? (<>
                    <div className="sec-label">{t('Admin — update Accurate, then process')}</div>
                    {!order.returnReceived && (
                      <div className="tiny mb" style={{ color: 'var(--info-text)' }}>
                        {order.lines.some((l) => Number(l.returned) > 0 && isWeighed(l.unit))
                          ? t('Goods not back yet — counted quantities are exact; the kg/loaf credit is provisional until the warehouse weighs the return.')
                          : t('Goods not back yet — quantities are exact (counted). You can prepare everything now.')}
                      </div>
                    )}
                    <select className="input mb" value={retDoc} onChange={(e) => setRetDoc(e.target.value)}>
                      <option value="">{t('— how is this settled in Accurate? —')}</option>
                      {RETURN_DOCS.map((d) => <option key={d.key} value={d.key}>{t(d.label)}</option>)}
                    </select>
                    {doc && doc.key === 'return-note' && (<>
                      <label className="flex items gap mb" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={retPrinted} onChange={(e) => setRetPrinted(e.target.checked)} />
                        <span className="tiny">{t('Input in Accurate & printed')}</span>
                      </label>
                      <PhotoButton block value={retNotePhoto} onPick={setRetNotePhoto} label={t('Photo of the return note') + ' · ' + t('optional')} />
                    </>)}
                    {/* A CLOSE (no replacement, no sign-run) writes the return off — that final step still
                        waits for the physical receive; replacements + the sign-run may start early. */}
                    <button className="btn btn-primary btn-block" disabled={!doc || (doc.key === 'return-note' && !retPrinted) || (doc && !doc.replacement && doc.key !== 'revise-return' && !order.returnReceived)} onClick={processReturn}>
                      {doc && doc.replacement ? <><ArrowRight size={16} /> {t('Send replacement — back to Cold Storage')}</>
                        : doc && doc.key === 'revise-return' ? <><ArrowRight size={16} /> {t('Send revised DO/SI for signing')}</>
                          : <><CircleCheck size={16} /> {t('Confirm & close')}</>}
                    </button>
                    {doc && !doc.replacement && doc.key !== 'revise-return' && !order.returnReceived ? <div className="tiny" style={{ margin: '4px 2px 0', color: 'var(--warning-text)' }}>{t('The order closes only after the warehouse receives the goods.')}</div> : null}
                    {doc ? <div className="tiny muted" style={{ margin: '4px 2px 0' }}>{
                      doc.key === 'single-replace' ? t('ONE document: the original DO/SI is revised to show what the customer finally keeps incl. the replacement. Best for a like-for-like swap.')
                        : doc.key === 'separate-replace' ? t('TWO documents: a Sales Return Note credits what came back + a NEW DO/SI for the replacement shipment. Best when the replacement differs (item / kg / price) or ships another day.')
                          : doc.key === 'revise-return' ? t('The revised DO/SI goes to the customer to sign before the order closes.')
                            : t('Returned goods credited — the order closes.')
                    }</div> : null}
                  </>) : <div className="tiny muted">{order.returnReceived ? t('Received — waiting for an admin to update the Accurate documents and decide.') : t('Waiting for an admin to update Accurate & decide — this can run before the goods arrive.')}</div>
                )}
            </div>
          </div>
        )
      }
      default: return null
    }
  }

  return (
    <>
      <PageHead title={`#${order.no}`} sub={order.customerName} back={() => nav(-1)}>
        {can(role, 'createOrders', settings) && <button className="btn btn-secondary btn-sm noprint" title={t('Copy the order confirmation for WhatsApp')} onClick={copyWA}><MessageCircle size={14} /> WA</button>}
        <button className="btn btn-secondary btn-sm noprint" onClick={() => window.print()}><Printer size={14} /> {t('Print')}</button>
        {canEdit && <button className="btn btn-secondary btn-sm noprint" onClick={() => nav('/orders/' + order.id + '/edit')}><Pencil size={14} /> {t('Edit')}</button>}
      </PageHead>
      <div className="page">

      <div className="card card-pad mb">
        <div className="flex items gap"><Avatar name={order.customerName} />
          <div><div style={{ fontWeight: 600, fontSize: 16 }}>{order.customerName}</div>
            {(() => { const co = order.company || (customers.find((c) => c.id === order.customerId) || {}).company; return co ? <div className="tiny muted">{co}</div> : null })()}
            <div className="tiny muted">Horeca · B2B</div></div>
        </div>
        <div className="grid2 mt" style={{ paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
          <div><div className="label">{t('Deliver')}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{dateFull(order.deliver)}</div></div>
          <div><div className="label">{t('Order no.')}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.no}</div></div>
          {!hideCustInfo && <div><div className="label">{t('Sales')}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.sales || '—'}</div></div>}
          {!hideCustInfo && <div><div className="label">{t('Contact')}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{order.contact || '—'}</div></div>}
        </div>
      </div>


      {['outstanding', 'awaiting', 'cancelled', 'returned'].includes(order.stage) ? (
        <div className="card card-pad mb" style={{ borderColor: STAGE_COLOR[order.stage] }}>
          <div className="flex items gap">
            <span className="dot" style={{ background: STAGE_COLOR[order.stage], width: 9, height: 9 }} />
            <b style={{ fontSize: 14 }}>{t(STAGE_LABEL[order.stage])}</b>
            {order.stage === 'awaiting' && order.backorderOf ? <span className="tiny muted">· {t('Backorder of')} #{order.backorderOf}</span> : null}
          </div>
        </div>
      ) : (
        <>
          <Stepper stage={order.stage} />
          <div className="tiny muted" style={{ margin: '8px 2px 14px' }}><b style={{ color: 'var(--text)' }}>{t(STAGE_LABEL[order.stage])}</b>{order.stage !== 'delivered' && ` — ${t('next:')} ${t(STAGE_LABEL[nextStage(order.stage)])}`}</div>
        </>
      )}

      {needsWeighing && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}>
          <div className="flex items gap"><Scale size={16} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
            <div className="grow tiny" style={{ color: 'var(--warning-text)' }}><b>{unweighedAdded.map((l) => l.name).join(', ')}</b> — {t("isn't weighed yet (added after Cold Storage).")}</div>
          </div>
          {canWeighFix && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={sendToColdToWeigh}><ArrowRight size={14} /> {t('Send to Cold Storage to weigh')}</button>}
        </div>
      )}

      {order.needsDocReprint && !['cancelled', 'returned'].includes(order.stage) && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--info)', background: 'var(--surface-2)' }}>
          <div className="flex items gap"><Printer size={16} style={{ color: 'var(--info)', flexShrink: 0 }} />
            <div className="grow tiny" style={{ color: 'var(--info)' }}>{t('Order changed — reprint the updated DO/SI for the courier.')}</div>
          </div>
          {(role === 'Admin' || role === 'Owner') && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={clearReprint}><Check size={14} /> {t('Reprinted — done')}</button>}
        </div>
      )}

      {canUndoClear && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--c-finance)' }}>
          <div className="flex items gap"><ShieldCheck size={16} style={{ color: 'var(--c-finance)', flexShrink: 0 }} />
            <div className="grow tiny"><b>{t('Payment cleared by Finance')}</b> — {order.stage === 'cold' ? t('cleared while still at Cold Storage.') : t('the order has moved on past the gate.')} {t('Cleared by mistake?')}</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={undoClearance}><RotateCcw size={14} /> {t('Undo payment clearance')}</button>
        </div>
      )}

      <div className="sec-label">{t('Items')} · {order.lines.length}{order.cuttingStarted && order.stage === 'production' ? <span style={{ color: 'var(--success-text)', marginLeft: 8, textTransform: 'none', fontWeight: 600, letterSpacing: 0 }}>· {t('Cutting in progress')}</span> : null}</div>
      <div className="card card-pad mb">
        {order.lines.map((l, i) => {
          const counted = !isWeightUnit(l.unit)
          const weighed = isWeighed(l.unit)
          const ordered = Number(l.qty) || 0
          const wsum = weighing && weighed ? capSum(l.id) : 0
          // The over/under-order kg hint only makes sense when the order is BY WEIGHT (kg/gram). A "loaf"
          // is a whole piece weighed catch-weight — its qty is a piece count, never a kg target.
          const belowHint = isWeightUnit(l.unit) && wsum > 0 && ordered > 0 && wsum < ordered * (1 - (settings.tolBelowPct || 0) / 100)
          const aboveHint = isWeightUnit(l.unit) && wsum > 0 && ordered > 0 && wsum > ordered * (1 + (settings.tolAbovePct || 0) / 100)
          const needPhoto = weighing && settings.requirePhoto && !lineHasPhoto(l.id) && !(counted && sendingOf(l) === 0) && !(isWeightUnit(l.unit) && shortFlag[l.id])
          // From Finalise onward the goods are prepared/weighed, so show the ACTUAL weight as the primary
          // quantity (e.g. "3 kg") and keep the ordered qty as a reference ("Ordered: 1 loaf"). Weighed
          // units only (kg/gram/loaf); counted items (box/pack/ekor) keep their ordered count.
          const prepared = ['finalise', 'dispatch', 'delivered', 'outstanding'].includes(order.stage) && isWeighed(l.unit) && Number(l.weight) > 0
          const primQty = prepared ? +Number(l.weight).toFixed(2) : l.qty
          const primUnit = prepared ? 'kg' : l.unit
          const orderedRef = prepared ? `${t('Ordered')}: ${l.qty} ${l.unit}` : null
          return (
          <div key={l.id} style={{ padding: '10px 0', borderBottom: i < order.lines.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div className="flex items gap">
              <div className="grow" style={{ minWidth: 0 }}><Line qty={primQty} unit={primUnit} name={l.name} ordered={orderedRef} />{l.isExtra ? <span className="chip chip-info" style={{ marginLeft: 6 }}>{t('added')}</span> : null}{lineFrozen(l, order) && !['delivered', 'cancelled', 'returned'].includes(order.stage) ? <span className="tiny" style={{ color: 'var(--info)', marginLeft: 6, whiteSpace: 'nowrap' }}><Scissors size={11} style={{ verticalAlign: '-1px' }} /> {t('being cut')}</span> : null}</div>
              {weighing && counted && remaining(l) >= 1 && (
                <div className="flex items gap" style={{ flexShrink: 0 }}>
                  <span className="tiny muted">{t('Sending')}</span>
                  <input className="input" style={{ width: 56, textAlign: 'right' }} inputMode="numeric" placeholder={String(remaining(l))} value={sendQty[l.id] ?? String(remaining(l))}
                    onChange={(e) => { const n = e.target.value.replace(/[^\d]/g, ''); setSendQty((p) => ({ ...p, [l.id]: n === '' ? '' : String(Math.min(Number(n), remaining(l))) })) }} />
                  <span className="tiny muted">{t('of')} {remaining(l)}</span>
                  {sendingOf(l) < remaining(l) && <span className="tiny" style={{ color: 'var(--warning-text)', whiteSpace: 'nowrap' }}>· {remaining(l) - sendingOf(l)} {t('to follow')}</span>}
                </div>
              )}
            </div>

            {weighing && weighed && !(counted && sendingOf(l) === 0) && (
              <div style={{ margin: '8px 0 0 69px' }}>
                {getCaps(l.id).map((cap, ci) => (
                  <div key={ci} className="flex items gap" style={{ marginBottom: 6 }}>
                    <input className="input" style={{ width: 92, textAlign: 'right' }} placeholder="0.00" inputMode="decimal" value={cap.w} onChange={(e) => setCap(l.id, ci, { w: e.target.value })} />
                    <span className="tiny muted">kg</span>
                    <label title="Scale photo for this weighing" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                      {cap.photo ? <DbImage id={cap.photo} style={{ height: 26, borderRadius: 4, display: 'block' }} /> : <Camera size={18} style={{ color: 'var(--text-2)' }} />}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onCapPhoto(l.id, ci, e)} />
                    </label>
                    <span className="spacer" />
                    {getCaps(l.id).length > 1 && <CircleX size={16} style={{ color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }} onClick={() => removeCap(l.id, ci)} />}
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => addCap(l.id)}><Plus size={13} /> {t('Add weighing')}</button>
                {capSum(l.id) > 0 && (
                  <div className="flex items gap" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 7 }}>
                    <b className="tnum" style={{ width: 92, textAlign: 'right', paddingRight: 11, boxSizing: 'border-box', fontSize: 15, color: belowHint || aboveHint ? 'var(--warning-text)' : 'var(--success-text)' }}>{capSum(l.id).toFixed(2)}</b>
                    <span className="tiny muted">kg</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t('Total')}</span>
                    {belowHint && <span className="tiny" style={{ color: 'var(--warning-text)' }}>· {t('below order')} {ordered} kg?</span>}
                    {aboveHint && <span className="tiny" style={{ color: 'var(--warning-text)' }}>· {t('over order')} {ordered} kg?</span>}
                  </div>
                )}
              </div>
            )}

            {weighing && !weighed && (
              <div className="flex items gap" style={{ margin: '8px 0 0 69px', flexWrap: 'wrap', alignItems: 'center' }}>
                {linePhotos(l.id).map((cap) => (
                  <span key={cap.photo} style={{ position: 'relative', display: 'inline-block' }}>
                    <DbImage id={cap.photo} open style={{ height: 38, borderRadius: 4, display: 'block' }} />
                    <span onClick={() => removeCapByPhoto(l.id, cap.photo)} title="Remove photo" style={{ position: 'absolute', top: -7, right: -7, cursor: 'pointer', background: 'var(--surface)', borderRadius: '50%', display: 'inline-flex', lineHeight: 0 }}><CircleX size={16} style={{ color: 'var(--text-2)' }} /></span>
                  </span>
                ))}
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  <Camera size={15} /> {t('Add photo')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => addPhotoCap(l.id, e)} />
                </label>
              </div>
            )}

            {needPhoto && <div className="tiny" style={{ color: 'var(--warning-text)', margin: '4px 0 0 69px' }}>{t('Add a proof photo to release')}</div>}

            {weighing && isWeightUnit(l.unit) && (
              <button className="btn btn-ghost btn-sm" style={{ margin: '4px 0 0 69px', justifyContent: 'flex-start', color: shortFlag[l.id] ? 'var(--warning-text)' : 'var(--text-3)' }} onClick={() => setShortFlag({ ...shortFlag, [l.id]: !shortFlag[l.id] })}>
                {shortFlag[l.id] ? <PackageX size={13} /> : <span style={{ width: 13 }} />} {t('Short — ran out of stock')}
              </button>
            )}

            {(l.weight || (priceOk && l.price) || l.delivered > 0 || l.short || (l.photos && l.photos.length) || l.weighPhoto) ? (
              <div className="flex items gap" style={{ margin: '6px 0 0 69px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* once `prepared` (finalise onward), the actual kg IS the primary qty on the left —
                    repeating it here as a chip was pure noise. The multi-weighing breakdown stays
                    (individual scale loads / loaf weights add real info). */}
                {l.weight && !prepared ? <span className="chip chip-success">{Number(l.weight).toFixed(2)} kg{l.weighings && l.weighings.length > 1 ? ` · ${l.weighings.length}×` : ''}</span> : null}
                {l.weighings && l.weighings.length > 1 ? <span className="tiny muted tnum">{l.weighings.map((w) => w.weight).join(' + ')}{prepared ? ' kg' : ''}</span> : null}
                {(l.photos && l.photos.length ? l.photos : (l.weighPhoto ? [l.weighPhoto] : [])).map((id, pi) => <DbImage key={pi} id={id} open alt="proof" style={{ height: 24, borderRadius: 4, display: 'block' }} />)}
                {l.delivered > 0 && lineLeft(l) > 0 ? <span className="chip chip-warning">{l.delivered} {t('of')} {l.qty} {t('delivered')} · {lineLeft(l)} {t('left')}</span> : null}
                {l.delivered > 0 && lineLeft(l) === 0 ? <span className="chip chip-success">{l.delivered}/{l.qty} {t('delivered')}</span> : null}
                {isWeightUnit(l.unit) && l.short ? <span className="chip chip-warning">{t('Short — ran out of stock')}</span> : null}
                {priceOk && l.price ? <span className="chip">{rupiah(l.price)}{l.qty > 1 ? ` ×${l.qty}` : ''}</span> : null}
              </div>
            ) : null}

            {l.weightNote ? (
              <div className="tiny" style={{ margin: '5px 0 0 69px', color: 'var(--text-2)' }}>{t('Expected weight')}: {l.weightNote}</div>
            ) : null}
            {(l.cuts || []).map((c) => (
              <div key={c.id} className="tiny" style={{ margin: '5px 0 0 69px', color: 'var(--info)', display: 'flex', gap: 5, alignItems: 'center' }}>
                {c.done ? <CircleCheck size={12} style={{ color: 'var(--success)' }} /> : <Scissors size={12} />} {c.text}
              </div>
            ))}
          </div>
          )
        })}
        {priceOk && (priced
          ? <div className="flex between mt" style={{ paddingTop: 11, borderTop: '0.5px solid var(--border)' }}>
              <span className="muted tiny">Order value · from PO</span><b className="tnum">{jt(value)}</b>
            </div>
          : <div className="tiny muted mt" style={{ paddingTop: 11, borderTop: '0.5px solid var(--border)' }}>No price on the order — invoiced in Accurate.</div>)}
      </div>

      {order.note ? <div className="card card-pad mb"><div className="label" style={{ marginBottom: 4 }}>{t('Note')}</div><div style={{ fontSize: 13 }}>{order.note}</div></div> : null}

      {!hideCustInfo && order.po ? <div className="card card-pad mb"><div className="label" style={{ marginBottom: 6 }}>{t('PO')}</div>
        {order.po.type === 'image'
          ? (order.po.photoId ? <DbImage id={order.po.photoId} open style={{ maxWidth: '100%', borderRadius: 8 }} /> : <a href={order.po.dataUrl} target="_blank" rel="noreferrer"><img src={order.po.dataUrl} alt={order.po.name} style={{ maxWidth: '100%', borderRadius: 8 }} /></a>)
          : <DbFileLink id={order.po.photoId} dataUrl={order.po.dataUrl} className="flex items gap" style={{ color: 'var(--info)' }}><FileText size={20} /> {order.po.name}</DbFileLink>}
      </div> : null}

      {(order.proof || (order.proofLog || []).length > 0) ? (
        <div className="card card-pad mb">
          <div className="label" style={{ marginBottom: 8 }}>{t('Proof of delivery')}</div>
          {order.proof ? (<>
            {order.proof.name ? <div className="tiny mb">{t('Received by')} · <b>{order.proof.name}</b></div> : null}
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              {['cond', 'recv', 'signed'].map((k) => order.proof[k]
                ? <DbImage key={k} id={order.proof[k]} open alt={k} style={{ height: 76, borderRadius: 6 }} />
                : null)}
            </div>
          </>) : null}
          {/* Earlier runs' evidence (a partial delivery before nyusul, the first delivery before a
              replacement) — archived, never deleted. */}
          {(order.proofLog || []).map((p, i) => (
            <div key={i} style={{ marginTop: order.proof || i > 0 ? 10 : 0 }}>
              <div className="tiny muted" style={{ marginBottom: 4 }}>{t(p.label || 'Earlier run')} · {dateShort(p.at)} {timeShort(p.at)}{p.name ? <> · {t('Received by')} <b>{p.name}</b></> : null}</div>
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                {['cond', 'recv', 'signed'].map((k) => p[k]
                  ? <DbImage key={k} id={p[k]} open alt={k} style={{ height: 56, borderRadius: 6 }} />
                  : null)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Record of how a return was settled in Accurate — kept on the order for disputes. */}
      {order.returnDoc ? (
        <div className="card card-pad mb">
          <div className="label" style={{ marginBottom: 6 }}>{t('Return settlement')}</div>
          <div className="tiny mb">{t('Document')} · <b>{t(order.returnDoc)}</b></div>
          {order.lines.filter((l) => Number(l.returnedWeight) > 0).map((l) => (
            <div key={l.id} className="tiny muted" style={{ padding: '1px 0' }}>{l.name} · {t('returned')} <b>{Number(l.returnedWeight).toFixed(2)} kg</b></div>
          ))}
          {(order.returnNotePhoto || order.returnSignedDoc || order.lines.some((l) => l.returnedWeighPhoto)) ? (
            <div className="flex gap mt" style={{ flexWrap: 'wrap' }}>
              {order.lines.filter((l) => l.returnedWeighPhoto).map((l) => <DbImage key={'w' + l.id} id={l.returnedWeighPhoto} open alt="scale" style={{ height: 76, borderRadius: 6 }} />)}
              {order.returnNotePhoto ? <DbImage id={order.returnNotePhoto} open alt="return note" style={{ height: 76, borderRadius: 6 }} /> : null}
              {order.returnSignedDoc ? <DbImage id={order.returnSignedDoc} open alt="signed DO/SI" style={{ height: 76, borderRadius: 6 }} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Live location only makes sense once OUR courier has actually taken the delivery and is en
          route — not on the choose screen, after a handover reset, or for a pickup / online-courier
          (3rd-party) handover where there's no courier of ours to track. */}
      {order.stage === 'dispatch' && order.takenBy && !order.pickup && !order.thirdParty && can(role, 'trackCourier', settings) ? <CourierLive who={order.takenBy} /> : null}
      {/* Same live map while a courier carries the revised DO/SI out for signing (return flow). */}
      {order.stage === 'returned' && order.returnSettle === 'sign' && order.returnDispatch && order.returnDispatch.mode === 'delivery' && can(role, 'trackCourier', settings) ? <CourierLive who={order.returnDispatch.takenBy} /> : null}

      {(order.pickupGeo || order.deliverGeo) ? (
        <div className="card card-pad mb">
          <div className="label" style={{ marginBottom: 8 }}><MapPin size={13} style={{ verticalAlign: '-2px' }} /> Driver location</div>
          {order.pickupGeo ? <div className="tiny mb">Picked up · <a href={mapsLink(order.pickupGeo.lat, order.pickupGeo.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>{order.pickupGeo.lat.toFixed(5)}, {order.pickupGeo.lng.toFixed(5)}</a> · {timeShort(order.pickupGeo.at)}</div> : null}
          {order.deliverGeo ? <div className="tiny mb">Delivered · <a href={mapsLink(order.deliverGeo.lat, order.deliverGeo.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>{order.deliverGeo.lat.toFixed(5)}, {order.deliverGeo.lng.toFixed(5)}</a> · {timeShort(order.deliverGeo.at)}</div> : null}
          {order.deliverGeo ? <iframe title="deliver-loc" src={mapEmbed(order.deliverGeo.lat, order.deliverGeo.lng)} style={{ width: '100%', height: 180, border: 0, borderRadius: 8, marginTop: 4 }} loading="lazy" /> : null}
        </div>
      ) : null}

      {renderPanel()}

      {canSelfUndo && (
        <div className="flex items between mb" style={{ gap: 8, padding: '2px 2px 0' }}>
          <span className="tiny muted">{t('Pressed wrongly?')}</span>
          <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={undoMyStep}><RotateCcw size={13} /> {t('Undo — back to')} {t(STAGE_LABEL[order.undo.prev.stage] || order.undo.prev.stage)}</button>
        </div>
      )}

      {/* INBOUND RETURN — the replacement was ordered before the goods came back; the warehouse
          receives + weighs them here, in parallel, whatever stage the replacement is at. */}
      {order.returnInbound && ['Warehouse', 'Owner'].includes(role) && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--danger)' }}>
          <div className="sec-label">{t('Incoming return — receive & verify')}</div>
          <div className="tiny muted mb">{t('The replacement is already in the pipeline — weigh/verify the returned goods when they arrive.')}</div>
          {order.lines.filter((l) => Number(l.inboundReturn) > 0).map((l) => (
            <div key={'ib' + l.id} className="mb" style={{ paddingBottom: 4 }}>
              <div className="flex items between" style={{ gap: 8 }}>
                <span className="grow tiny">{l.name}</span>
                <span className="tiny tnum" style={{ fontWeight: 600, flexShrink: 0 }}>{l.inboundReturn} {l.unit}</span>
              </div>
              {isWeighed(l.unit) && (<>
                <div className="flex items between" style={{ gap: 8, marginTop: 6 }}>
                  <span className="grow tiny muted">{t('Actual returned weight')}</span>
                  <span className="flex items" style={{ gap: 8, flexShrink: 0 }}>
                    <input className="input" style={{ width: 70, textAlign: 'right' }} inputMode="decimal" placeholder="0.00" value={verifyWeight[l.id] ?? ''} onChange={(e) => setVerifyWeight((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                    <span className="tiny muted" style={{ width: 40 }}>kg</span>
                  </span>
                </div>
                <div style={{ marginTop: 6 }}><PhotoButton block value={verifyPhoto[l.id]} onPick={(d) => setVerifyPhoto((p) => ({ ...p, [l.id]: d }))} label={t('Scale photo') + ' · ' + t('optional')} /></div>
              </>)}
            </div>
          ))}
          <button className="btn btn-primary btn-block" disabled={!order.lines.filter((l) => Number(l.inboundReturn) > 0).every((l) => !isWeighed(l.unit) || numW(verifyWeight[l.id]) > 0)} onClick={receiveInbound}><CircleCheck size={16} /> {t('Confirm received & weighed')}</button>
        </div>
      )}
      {!order.returnInbound && order.returnReceivedAt && order.lines.some((l) => Number(l.inboundReturn) > 0) && !['delivered', 'cancelled'].includes(order.stage) && (
        <div className="flex items between mb" style={{ gap: 8 }}>
          <span className="tiny" style={{ color: 'var(--success-text)' }}><CircleCheck size={12} style={{ verticalAlign: -2 }} /> {t('Incoming return received')} · {timeShort(order.returnReceivedAt)}</span>
          {['Warehouse', 'Owner'].includes(role) && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={undoInbound}><RotateCcw size={13} /> {t('Undo')}</button>}
        </div>
      )}

      {order.stage === 'delivered' && order.payment && order.payment.timing === 'cod' && !order.payment.codReconciled && can(role, 'reconcileCOD', settings) && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--warning)' }}>
          <div className="flex items between mb"><b style={{ fontSize: 13 }}>{t('COD cash to reconcile')}</b>{order.payment.codAmount ? <b className="tnum">{jt(order.payment.codAmount)}</b> : null}</div>
          <button className="btn btn-success btn-block" onClick={() => saveOrder({ ...order, payment: { ...order.payment, codReconciled: true, codReceivedAt: new Date().toISOString() }, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: `COD cash reconciled${order.payment.codAmount ? ' — ' + jt(order.payment.codAmount) : ''}` }] })}><Banknote size={15} /> {t('Confirm cash received in office')}</button>
        </div>
      )}

      {/* TERMS (pay-later) receivable: clearing at the Finance gate approved the CREDIT — the actual
          payment lands later. Finance/Owner records it here; until then Home nags "terms payment overdue". */}
      {order.stage === 'delivered' && order.payment && order.payment.timing === 'terms' && !order.payment.paidAt && (role === 'Finance' || role === 'Owner' || can(role, 'actFinanceGate', settings)) && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--warning)' }}>
          <div className="flex items between mb"><b style={{ fontSize: 13 }}>{t('Terms invoice — payment not yet received')}</b>{order.payment.dueDate ? <span className="tiny muted">{t('due')} {dateShort(order.payment.dueDate)}</span> : null}</div>
          <button className="btn btn-success btn-block" onClick={() => saveOrder({ ...order, payment: { ...order.payment, paidAt: new Date().toISOString() }, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Terms payment received' }] })}><Banknote size={15} /> {t('Payment received')}</button>
        </div>
      )}
      {order.stage === 'delivered' && order.payment && order.payment.timing === 'terms' && order.payment.paidAt ? (
        <div className="flex items between mb" style={{ gap: 8 }}>
          <span className="tiny" style={{ color: 'var(--success-text)' }}><Banknote size={12} style={{ verticalAlign: -2 }} /> {t('Terms payment received')} · {dateShort(order.payment.paidAt)}</span>
          {(role === 'Finance' || role === 'Owner' || can(role, 'actFinanceGate', settings)) && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => saveOrder({ ...order, payment: { ...order.payment, paidAt: null }, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Undo — terms payment not received yet' }] })}><RotateCcw size={13} /> {t('Undo')}</button>}
        </div>
      ) : null}

      {/* COD reconciled: show the receipt + let Finance/office undo a mis-tap (mirror of docsReturned). */}
      {order.stage === 'delivered' && order.payment && order.payment.timing === 'cod' && order.payment.codReconciled ? (
        <div className="flex items between mb" style={{ gap: 8 }}>
          <span className="tiny" style={{ color: 'var(--success-text)' }}><Banknote size={12} style={{ verticalAlign: -2 }} /> {t('COD cash reconciled')}{order.payment.codReceivedAt ? ` · ${dateShort(order.payment.codReceivedAt)}` : ''}</span>
          {can(role, 'reconcileCOD', settings) && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => saveOrder({ ...order, payment: { ...order.payment, codReconciled: false, codReceivedAt: null }, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Undo — COD cash not reconciled yet' }] })}><RotateCcw size={13} /> {t('Undo')}</button>}
        </div>
      ) : null}

      {order.stage === 'delivered' && !order.docsReturned && can(role, 'confirmDocsReturned', settings) && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--warning)' }}>
          <div className="flex items gap mb"><FileText size={15} style={{ color: 'var(--warning-text)' }} /><b style={{ fontSize: 13 }}>{t('Signed DO & SI returned?')}</b></div>
          <div className="tiny muted mb">{t('Make sure the signed Delivery Order & Sales Invoice come back to the office and are filed.')}</div>
          <button className="btn btn-success btn-block" onClick={() => saveOrder({ ...order, docsReturned: true, docsReturnedAt: new Date().toISOString(), history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Signed DO & SI returned to office' }] })}><FileText size={15} /> {t('DO & SI returned')}</button>
        </div>
      )}
      {order.stage === 'delivered' && order.docsReturned ? (
        <div className="flex items between mb" style={{ gap: 8 }}>
          <span className="tiny" style={{ color: 'var(--success-text)' }}><FileText size={12} style={{ verticalAlign: -2 }} /> {t('Signed DO & SI returned')}{order.docsReturnedAt ? ` · ${dateShort(order.docsReturnedAt)}` : ''}</span>
          {can(role, 'confirmDocsReturned', settings) && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => saveOrder({ ...order, docsReturned: false, docsReturnedAt: null, history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: 'Undo — DO & SI not returned yet' }] })}><RotateCcw size={13} /> {t('Undo')}</button>}
        </div>
      ) : null}

      {/* Accurate document log — every DO/SI/return-note number for this ONE order (original, return,
          replacement…), so "same order, different DO" is traceable in one place. Office roles only. */}
      {['Admin', 'Finance', 'Owner'].includes(role) && (<>
        <div className="sec-label mt-lg">{t('Documents')}</div>
        <div className="card card-pad">
          {(order.documents || []).length === 0
            ? <div className="tiny muted mb">{t('No DO/SI numbers recorded yet — add them here as you issue them in Accurate. One order can carry several (original, return, replacement).')}</div>
            : (order.documents || []).map((d) => (
              <div key={d.id} className="flex items between" style={{ padding: '5px 0', borderBottom: '0.5px solid var(--border)', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div><span className="tnum" style={{ fontWeight: 600, fontSize: 13 }}>{d.type} {d.number}</span>{d.note ? <span className="tiny muted"> · {d.note}</span> : null}</div>
                  <div className="tiny muted">{dateShort(d.at)} · {d.by}</div>
                </div>
                <CircleX className="noprint" size={16} style={{ color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }} onClick={() => removeDocument(d.id)} />
              </div>
            ))}
          <div className="flex items gap noprint" style={{ marginTop: 9, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 96, flexShrink: 0 }} value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}>
              {['DO', 'SI', 'Return Note', 'Other'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <input className="input" style={{ width: 108, flexShrink: 0 }} placeholder={t('Number')} value={docForm.number} onChange={(e) => setDocForm({ ...docForm, number: e.target.value })} />
            <input className="input grow" style={{ minWidth: 120 }} placeholder={t('For… (e.g. replacement)')} value={docForm.note} onChange={(e) => setDocForm({ ...docForm, note: e.target.value })} />
            <button className="btn btn-secondary btn-sm" disabled={!docForm.number.trim()} onClick={addFromDocForm}><Plus size={14} /> {t('Add')}</button>
          </div>
        </div>
      </>)}

      {/* Team notes — free-form comms on the order ("gate code 4412", "call before sending"), any role.
          Separate from History (actions) and from the customer's intake note. */}
      <div className="sec-label mt-lg">{t('Team notes')}{(order.notes || []).length ? ` · ${order.notes.length}` : ''}</div>
      <div className="card card-pad mb">
        {(order.notes || []).map((n, i) => (
          <div key={i} className="tiny" style={{ padding: '4px 0', borderBottom: i < order.notes.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <span className="muted">{dateShort(n.at)} {timeShort(n.at)} · <b>{n.who}</b></span>
            <div style={{ marginTop: 1 }}>{n.text}</div>
          </div>
        ))}
        <div className="flex gap" style={{ marginTop: (order.notes || []).length ? 8 : 0 }}>
          <input className="input" style={{ flex: 1 }} placeholder={t('Add a note for the team…')} value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeamNote()} />
          <button className="btn btn-secondary" disabled={!noteText.trim()} onClick={addTeamNote}><Plus size={15} /></button>
        </div>
      </div>

      <div className="sec-label mt-lg">{t('History')}</div>
      <div className="card card-pad">
        {order.history.slice().reverse().map((h, i) => (
          <div key={i} className="flex gap tiny" style={{ padding: '4px 0', color: 'var(--text-2)' }}>
            <span className="mono" style={{ width: 92, flexShrink: 0 }}>{dateShort(h.at)} {timeShort(h.at)}</span><span>{h.what} · {h.who}{h.role ? ` (${t(h.role)})` : ''}</span>
          </div>
        ))}
      </div>

      {anyOrderAction && (<>
        <div className="sec-label mt-lg">{t('Order actions')}</div>
        <div className="card card-pad">
          {canReorder && (
            <button className="btn btn-secondary btn-block mb" style={{ justifyContent: 'flex-start' }} onClick={reorderOrder}><Repeat size={15} /> {t('Reorder — new order, same items')}</button>
          )}
          {act.hold && (
            <button className="btn btn-secondary btn-block mb" style={{ justifyContent: 'flex-start' }} onClick={toggleHold}>
              <Pause size={15} /> {t('Put on hold')}
            </button>
          )}
          {act.sendBack && (
            <button className="btn btn-secondary btn-block mb" style={{ justifyContent: 'flex-start' }} onClick={sendBackStage}><RotateCcw size={15} /> {t('Send back to')} {t(STAGE_LABEL[prevStage(order.stage)])}</button>
          )}
          {act.restore && (
            <button className="btn btn-secondary btn-block mb" style={{ justifyContent: 'flex-start' }} onClick={restoreCancelled}><RotateCcw size={15} /> {t('Restore order')}</button>
          )}
          {act.reopen && (
            <button className="btn btn-secondary btn-block mb" style={{ justifyContent: 'flex-start' }} onClick={reopenOrder}><RotateCcw size={15} /> {t('Reopen order')}</button>
          )}
          {act.cancel && <button className="btn btn-danger-outline btn-block" onClick={cancelOrder}><XCircle size={15} /> {t('Cancel order')}</button>}
        </div>
      </>)}
      </div>
    </>
  )
}
