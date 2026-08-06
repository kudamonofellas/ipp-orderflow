import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { products } from '../data/products.js'
import { customers } from '../data/customers.js'
import { orderNo } from './format.js'
import { t } from './i18n.js'
import { DEMO_USERS } from './domain.js'

const KEY = 'ipp-orderflow-v7'
// Schema version stored INSIDE the blob. Bump this (not KEY) for future shape changes and add a
// migration step in migrate() — so upgrades transform data instead of silently wiping + reseeding.
const DATA_VERSION = 7
function migrate(saved) {
  if (!saved) return saved
  let v = saved.__v || 7
  // The old single 'showFloorPrice' toggle became the per-role 'seePrices' capability — preserve an
  // owner who had turned it OFF for the floor.
  if (saved.settings && saved.settings.showFloorPrice === false) {
    saved.settings.permissions = saved.settings.permissions || {}
    saved.settings.permissions.seePrices = { ...(saved.settings.permissions.seePrices || {}), Warehouse: false, Production: false }
    delete saved.settings.showFloorPrice
  }
  // The old Void flow (removed round 74) left some orders flagged `voided` — convert them to the
  // one visible Cancelled state so the dead `!o.voided` filters could be deleted from every screen.
  if (Array.isArray(saved.orders)) {
    saved.orders = saved.orders.map((o) => o && o.voided
      ? { ...o, voided: undefined, cancelled: true, stage: 'cancelled', cancelledFrom: o.stage !== 'cancelled' ? o.stage : (o.cancelledFrom || null) }
      : o)
  }
  saved.__v = v
  return saved
}

function find(kw) {
  const p = products.find((x) => x.accurateName.toLowerCase().includes(kw.toLowerCase()))
  return p || products[0]
}
let LID = 0
const line = (kw, qty, unit, instruction = '', price = null) => {
  const p = find(kw)
  const cutTexts = Array.isArray(instruction) ? instruction : (instruction ? [instruction] : [])
  const cuts = cutTexts.map((t) => ({ id: 'c' + ++LID, text: t, done: false }))
  return { id: 'l' + ++LID, productId: p.id, name: p.name, qty, unit,
    weight: null, status: 'recognized', price, cuts }
}
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(9, 14, 0, 0); return d.toISOString() }

function seed() {
  const mk = (i, custId, stage, dropDays, deliverDays, lines, payOverride) => {
    const c = customers.find((x) => x.id === custId)
    const created = daysFromNow(dropDays)
    return {
      id: 'o' + i, no: orderNo(created, i), customerId: c.id, customerName: c.name, channel: 'horeca',
      createdAt: created, deliver: daysFromNow(deliverDays), sales: c.sales,
      payment: { ...c.payment, confirmed: ['production', 'finalise', 'dispatch', 'delivered'].includes(stage), ...(payOverride || {}) },
      contact: c.contact, address: c.address, stage, lines,
      history: [{ at: created, who: c.sales, what: 'Order created' }],
    }
  }
  return [
    mk(1, 'saffron', 'intake', 0, 2, [
      line('WAGYU STRIPLOIN 8-9+ CARARA', 1, 'loaf', 'steak cut 2 cm', 2100000),
      line('HOKKAIDO SCALLOP 2L', 2, 'box', '', 850000),
      line('SHORT RIB DICE 500 GRAM', 3, 'pack', '', 95000),
    ]),
    mk(2, 'ducking', 'cold', -1, 1, [
      line('LAMB LEG BONELESS', 3, 'kg'),
      line('WAGYU CUBE ROLL 4-5+ RUBY', 1, 'loaf', 'cut 1.5 cm'),
    ]),
    mk(3, 'ivy', 'finance', -1, 1, [
      line('KERANG HOKKAIDO SCALLOP 2L', 1, 'pack'),
    ]),
    mk(4, 'munro', 'production', -1, 0, [
      line('WAGYU RIBEYE 8-9+ CARARA', 1, 'loaf', 'steak cut 3 cm · lapor gram'),
    ]),
    mk(5, 'rifai', 'dispatch', -1, 0, [
      line('A5 STRIPLOIN', 2, 'loaf', ['kantong 1: cut 1.5 cm', 'kantong 2: cut 2 cm belah tengah, vacuum per pcs'], 3200000),
    ]),
    // 3 delivered orders stamped across the periods so the Delivered today / week / month / year tiles
    // demonstrate the difference: one delivered today, one earlier this week, one ~a week+ ago.
    { ...mk(6, 'wolfgang', 'delivered', -2, 0, [line('FOIE GRAS / HATI ANGSA SLICE 1 KG', 2, 'pack')]), deliveredAt: daysFromNow(0) },
    { ...mk(7, 'saffron', 'delivered', -4, -2, [line('US CHOICE RIBEYE IBP', 1, 'loaf', 'steak cut 2.5 cm')]), deliveredAt: daysFromNow(-2) },
    { ...mk(8, 'ivy', 'delivered', -11, -9, [line('TASMANIA SALMON PORTION', 4, 'pack')]), deliveredAt: daysFromNow(-9) },
    // A live RETURN so the Returns strip + the whole return flow are visible on a fresh seed. Munro got
    // 2 packs and refused 1 (quality), so it kept 1 + returned 1 → it sits at 'returned' in the 'receive'
    // bucket: the warehouse confirms & weighs the goods back, then admin settles the document.
    { ...mk(9, 'munro', 'returned', -2, -2, [
        { ...line('SHORT RIB DICE 500 GRAM', 2, 'pack'), delivered: 1, returned: 1 },
      ], { confirmed: true }),
      returnReceived: false, partialReturn: true, returnedReason: 'Quality — 1 pack short-dated on arrival' },
  ]
}

// requirePhoto: warehouse must attach ≥1 proof photo per item before releasing.
// tolBelowPct/tolAbovePct: how far a weighed total may fall below / rise above the ordered
// kg before a (non-blocking) "short?/over?" hint shows. All editable in Settings.
// permissions = sparse per-role capability overrides (see domain.can / DEFAULT_PERMISSIONS); {} = all defaults.
const DEFAULT_SETTINGS = { requirePhoto: false, tolBelowPct: 10, tolAbovePct: 10, dispatchProofRequired: true, permissions: {} }
// Real named team members (multiple per role) so history.who is a real person, not the role.
const seedUsers = () => DEMO_USERS.map((u, i) => ({ id: 'u' + i, name: u.name, role: u.role, active: true }))

const initial = () => {
  try {
    const saved = migrate(JSON.parse(localStorage.getItem(KEY)))
    if (saved && saved.orders) return { user: saved.user || null, orders: saved.orders, customers: saved.customers || customers, products: saved.products || products, lang: saved.lang || 'en', settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, users: saved.users || seedUsers() }
  } catch { /* ignore */ }
  return { user: null, orders: seed(), customers, products, lang: 'en', settings: { ...DEFAULT_SETTINGS }, users: seedUsers() }
}

function reducer(state, a) {
  switch (a.type) {
    case 'login': return { ...state, user: a.user }
    case 'logout': return { ...state, user: null }
    case 'create': return { ...state, orders: [a.order, ...state.orders] }
    case 'save':
      return { ...state, orders: state.orders.map((o) => (o.id === a.order.id ? a.order : o)) }
    case 'delete':
      return { ...state, orders: state.orders.filter((o) => o.id !== a.id) }
    case 'addCustomer':
      return { ...state, customers: [...state.customers, a.customer] }
    case 'updateCustomer':
      return { ...state, customers: state.customers.map((c) => (c.id === a.customer.id ? { ...c, ...a.customer } : c)) }
    case 'addProduct':
      return { ...state, products: [a.product, ...state.products] }
    case 'updateProduct':
      return { ...state, products: state.products.map((p) => (p.id === a.product.id ? { ...p, ...a.product } : p)) }
    case 'removeProduct':
      return { ...state, products: state.products.filter((p) => p.id !== a.id) }
    case 'importCustomers':
      return { ...state, customers: a.customers }
    case 'importProducts':
      return { ...state, products: a.products }
    case 'setLang': return { ...state, lang: a.lang }
    case 'updateSettings': return { ...state, settings: { ...state.settings, ...a.patch } }
    case 'reset': { const s = { user: state.user, orders: seed(), customers, products, lang: state.lang, settings: state.settings, users: state.users }; return s }
    case 'hydrate': return { ...state, ...a.state, user: state.user }  // pull in another tab's changes, keep this tab's user (non-destructive)
    case 'addUser': return { ...state, users: [...state.users, a.user] }
    case 'updateUser': return { ...state, users: state.users.map((u) => (u.id === a.user.id ? { ...u, ...a.user } : u)) }
    case 'removeUser': return { ...state, users: state.users.filter((u) => u.id !== a.id) }
    default: return state
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial)

  // Signature of the SHARED data (everything except this tab's logged-in user). Used to tell a real
  // cross-tab change apart from an echo of our own write — see the storage listener below.
  // useMemo — this serializes the ENTIRE order book; without it every keystroke-triggered render
  // re-stringified everything (typing got slower as the book grew) for a value only storage events read.
  const sharedSig = useMemo(
    () => JSON.stringify({ orders: state.orders, customers: state.customers, products: state.products, lang: state.lang, settings: state.settings, users: state.users }),
    [state.orders, state.customers, state.products, state.lang, state.settings, state.users])
  const sharedSigRef = useRef(sharedSig)
  sharedSigRef.current = sharedSig
  const lastSavedRef = useRef('')
  const quotaWarnedRef = useRef(false)

  useEffect(() => {
    try {
      const payload = JSON.stringify({ __v: DATA_VERSION, user: state.user, orders: state.orders, customers: state.customers, products: state.products, lang: state.lang, settings: state.settings, users: state.users })
      if (payload === lastSavedRef.current) return  // nothing actually changed — don't rewrite (avoids needless storage events)
      lastSavedRef.current = payload
      localStorage.setItem(KEY, payload)
      quotaWarnedRef.current = false
    } catch (e) {
      // Storage full or unavailable (private mode / quota). Don't crash the app — but the user MUST
      // know their work is no longer being saved (a console line alone hid this completely).
      console.error('IPP OrderFlow: could not save to local storage (full or unavailable).', e)
      if (!quotaWarnedRef.current) {
        quotaWarnedRef.current = true
        window.alert(t('Storage is full — changes are NOT being saved! Back up now (Settings → Backup) and delete old orders, or contact support.'))
      }
    }
  }, [state.user, state.orders, state.customers, state.products, state.lang, state.settings, state.users])

  // Cross-tab/device-on-same-browser sync: when another tab saves, reflect its data here so the
  // two tabs don't silently clobber each other (the warehouse's weighing won't get reverted by
  // Finance saving from another tab). Keeps THIS tab's logged-in user.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        const saved = migrate(JSON.parse(e.newValue))
        if (!saved || !saved.orders) return
        const incoming = { orders: saved.orders, customers: saved.customers || customers, products: saved.products || products, lang: saved.lang || 'en', settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, users: saved.users || seedUsers() }
        // Only hydrate if the shared data ACTUALLY differs from ours. Without this, two open tabs
        // ping-pong forever: each hydrate makes fresh object refs → re-fires our save effect → the
        // other tab's storage event → hydrate → … which the user sees as the UI flickering.
        if (JSON.stringify(incoming) === sharedSigRef.current) return
        dispatch({ type: 'hydrate', state: incoming })
      } catch (err) { /* ignore a bad cross-tab payload */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const api = {
    ...state,   // products now live in state (editable + persisted), seeded from data/products.js
    login: (user) => dispatch({ type: 'login', user }),
    logout: () => dispatch({ type: 'logout' }),
    createOrder: (order) => dispatch({ type: 'create', order }),
    saveOrder: (order) => dispatch({ type: 'save', order }),
    deleteOrder: (id) => dispatch({ type: 'delete', id }),
    addUser: (u) => dispatch({ type: 'addUser', user: u }),
    updateUser: (u) => dispatch({ type: 'updateUser', user: u }),
    removeUser: (id) => dispatch({ type: 'removeUser', id }),
    addCustomer: (customer) => dispatch({ type: 'addCustomer', customer }),
    updateCustomer: (customer) => dispatch({ type: 'updateCustomer', customer }),
    addProduct: (product) => dispatch({ type: 'addProduct', product }),
    updateProduct: (product) => dispatch({ type: 'updateProduct', product }),
    removeProduct: (id) => dispatch({ type: 'removeProduct', id }),
    importCustomers: (list) => dispatch({ type: 'importCustomers', customers: list }),
    importProducts: (list) => dispatch({ type: 'importProducts', products: list }),
    setLang: (lang) => dispatch({ type: 'setLang', lang }),
    updateSettings: (patch) => dispatch({ type: 'updateSettings', patch }),
    t: (key) => t(key, state.lang),
    resetData: () => dispatch({ type: 'reset' }),
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
