import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import OrderList from '../components/OrderList.jsx'
import { PageHead } from '../components/ui.jsx'
import { ROLE_QUEUE, ROLE_FOCUS, STAGES, STAGE_LABEL, STAGE_COLOR, RETURN_BUCKETS, returnBuckets, deliveredOn, cancelledOn, can } from '../lib/domain.js'
import { jt } from '../lib/format.js'
import { Plus, AlertTriangle, Banknote, Navigation, CalendarDays, Package, Inbox, PackageCheck, Ban } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n) => String(n).padStart(2, '0')
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// A dashboard count for one class of orders (Delivered / Voided / Cancelled), windowed by Today / Week /
// Month / Year — with ‹ › to step through months + years and a 📅 to pick ANY specific day. The number
// links to the matching Orders list. Each card remembers its own period (persistKey). Default = today.
function PeriodStat({ title, orders, dateOf, dtype, persistKey, accent, icon, t, nav }) {
  const [period, setPeriod] = useState(() => { try { return localStorage.getItem(persistKey) || 'today' } catch (e) { return 'today' } })
  const [back, setBack] = useState(0)
  const [picked, setPicked] = useState('')   // 'YYYY-MM-DD' when a specific day is chosen (the 📅 mode)
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const todayISO = toISODate(startToday)
  const pick = (p) => { setPeriod(p); setBack(0); if (p === 'date' && !picked) setPicked(todayISO); try { localStorage.setItem(persistKey, p) } catch (e) { /* private mode */ } }

  let winStart, winEnd, winLabel
  if (period === 'date') {
    const d = picked ? new Date(picked + 'T00:00:00') : startToday
    winStart = d; winEnd = new Date(d); winEnd.setDate(winEnd.getDate() + 1); winLabel = null
  } else if (period === 'week') {
    const sw = new Date(startToday); sw.setDate(sw.getDate() - ((sw.getDay() + 6) % 7))
    winStart = sw; winEnd = new Date(sw); winEnd.setDate(winEnd.getDate() + 7); winLabel = t('this week')
  } else if (period === 'year') {
    const y = startToday.getFullYear() - back; winStart = new Date(y, 0, 1); winEnd = new Date(y + 1, 0, 1); winLabel = String(y)
  } else if (period === 'month') {
    const m = new Date(startToday.getFullYear(), startToday.getMonth() - back, 1)
    winStart = m; winEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1); winLabel = t(MONTHS[m.getMonth()]) + ' ' + m.getFullYear()
  } else {  // today
    winStart = startToday; winEnd = new Date(startToday); winEnd.setDate(winEnd.getDate() + 1)
    winLabel = `${startToday.getDate()} ${t(MONTHS[startToday.getMonth()])} ${startToday.getFullYear()}`
  }
  const count = orders.filter((o) => { const d = dateOf(o); return d >= winStart && d < winEnd }).length
  const href = `/orders?dtype=${dtype}&dfrom=${winStart.toISOString()}&dto=${winEnd.toISOString()}`
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="l">{t(title)}</span>
        <span className="stat-ico" style={{ color: accent || 'var(--text-2)', background: `color-mix(in srgb, ${accent || 'var(--text-2)'} 15%, transparent)` }}>{icon}</span>
      </div>
      <div className="v num-link" onClick={() => nav(href)} title={t(title)} style={accent && count > 0 ? { color: accent } : undefined}>{count}</div>
      <div className="seg seg-xs" style={{ marginTop: 8 }}>
        {['today', 'week', 'month', 'year'].map((p) => (
          <button key={p} className={period === p ? 'on' : ''} onClick={() => pick(p)}>{t(p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'year' ? 'Year' : 'Month')}</button>
        ))}
        <button className={'pn-cal' + (period === 'date' ? ' on' : '')} onClick={() => pick('date')} title={t('Pick a date')} aria-label={t('Pick a date')}><CalendarDays size={13} /></button>
      </div>
      <div className="period-nav">
        {period === 'date'
          ? <input type="date" className="pn-date" value={picked || todayISO} max={todayISO} onChange={(e) => setPicked(e.target.value)} />
          : (<>
              {(period === 'month' || period === 'year') && <button className="pn-arr" onClick={() => setBack(back + 1)} aria-label={t('Previous')}>‹</button>}
              <span className="pn-lbl">{winLabel}</span>
              {(period === 'month' || period === 'year') && <button className="pn-arr" onClick={() => setBack(Math.max(0, back - 1))} disabled={back === 0} aria-label={t('Next')}>›</button>}
            </>)}
      </div>
    </div>
  )
}

// One dashboard for everyone — the pipeline overview helps the whole team coordinate. What each
// role can SEE in detail is gated on click (OrderDetail hides price/contact, canAct gates actions).
export default function Home() {
  const { orders: allOrders, user, t, settings } = useStore()
  const orders = allOrders
  const nav = useNavigate()
  const role = user.role
  const myStage = ROLE_QUEUE[role]            // the floor/finance role's own queue stage (none for Owner/Admin)
  const focus = ROLE_FOCUS[role] || []        // all the pipeline modules this role is responsible for
  const canCreate = can(role, 'createOrders', settings)

  const today = new Date().toDateString()
  const openOrders = orders.filter((o) => !['delivered', 'cancelled', 'returned'].includes(o.stage))
  // Operational metric while there's no pricing connection. WHEN ACCURATE IS CONNECTED, swap this
  // tile back to "Value today" = orders.reduce((s, o) => s + (sameDay ? orderValue(o) : 0), 0).
  // orderValue()/orderPriced() are kept in domain.js — only this dashboard tile was hidden.
  const ordersToday = orders.filter((o) => new Date(o.createdAt).toDateString() === today).length
  // Cold + Finance run in parallel: a Cold order that isn't paid yet also counts in the Finance tile
  // (it's in BOTH queues until either side finishes), so each team sees its own outstanding work.
  // 'delivered' is dropped from the strip — it's a terminal EXIT (only ever grows), surfaced as its own
  // today / period tiles up top instead of as a work-in-progress stage.
  const counts = STAGES.filter((s) => s !== 'delivered').map((s) => ({ s, n: s === 'finance'
    ? orders.filter((o) => o.stage === 'finance' || (o.stage === 'cold' && !o.hold && !(o.payment && o.payment.confirmed))).length
    : orders.filter((o) => o.stage === s).length }))
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  // The Delivered / Voided / Cancelled cards are self-contained <PeriodStat> widgets (each windows +
  // links itself). Here we just hand each the candidate set + its date function. Voided orders live in
  // allOrders (they're filtered out of the live `orders`); cancelled orders are a stage, so still in it.
  const deliveredOrders = orders.filter((o) => o.stage === 'delivered')
  const cancelledOrders = orders.filter((o) => o.stage === 'cancelled')
  const codPending = orders.filter((o) => o.stage === 'delivered' && o.payment && o.payment.timing === 'cod' && !o.payment.codReconciled)
  const codTotal = codPending.reduce((s, o) => s + (Number(o.payment.codAmount) || 0), 0)
  // The courier's runs: normal dispatch deliveries + revised-DO/SI return deliveries out for signing.
  const myDeliveries = orders.filter((o) =>
    (o.stage === 'dispatch' && (o.takenBy === user.name || !o.takenBy)) ||
    (o.stage === 'returned' && o.returnSettle === 'sign' && (!o.returnDispatch || !o.returnDispatch.takenBy || o.returnDispatch.takenBy === user.name)))
  // Returns are off-pipeline, so they get their own little step-strip — "where is each return stuck,
  // and how many" — shown only when there ARE returns in flight. An order can be in SEVERAL buckets
  // at once now (warehouse receive ∥ admin decisions run in parallel), so each tile counts independently.
  const retCounts = RETURN_BUCKETS.map((b) => ({ ...b, n: orders.filter((o) => returnBuckets(o).includes(b.key)).length }))
  const retTotal = retCounts.reduce((s, b) => s + b.n, 0)
  const attention = [
    ...orders.filter((o) => o.stage === 'outstanding').map((o) => ({ o, msg: t('part delivered — send the rest or finish') })),
    // Receive covers BOTH a return sitting at 'returned' and an inbound return whose replacement is
    // already running through the pipeline (returnInbound — the parallel flow).
    ...orders.filter((o) => (o.stage === 'returned' && !o.returnReceived) || o.returnInbound).map((o) => ({ o, msg: t('return coming back — warehouse to receive & verify') })),
    // The admin's document/replacement decision no longer waits for the receive — nag as soon as a
    // return exists with no decision yet. (Out-for-signing = already decided.)
    ...orders.filter((o) => o.stage === 'returned' && !o.returnSettle && !o.returnDoc).map((o) => ({ o, msg: t('return — admin to update Accurate & decide (can run before goods arrive)') })),
    ...orders.filter((o) => o.stage === 'returned' && o.returnSettle === 'sign').map((o) => ({ o, msg: t('revised DO/SI out for signing') })),
    // 'T00:00:00' → parse the date-only string as LOCAL midnight (bare YYYY-MM-DD parses as UTC =
    // 7am WIB, which made reminders/overdue flags show up 7 hours late).
    ...orders.filter((o) => o.stage === 'awaiting' && o.remindOn && new Date(o.remindOn + 'T00:00:00') <= new Date()).map((o) => ({ o, msg: t('stock reminder due') })),
    ...orders.filter((o) => o.stage === 'dispatch' && !o.takenBy).map((o) => ({ o, msg: t('ready — awaiting a driver') })),
    ...(can(role, 'reconcileCOD', settings) ? codPending.map((o) => ({ o, msg: t('COD cash not reconciled') })) : []),
    // Once the terms payment is RECORDED as received (paidAt), stop nagging.
    ...(can(role, 'seeCustomerCredit', settings) ? orders.filter((o) => o.payment && o.payment.timing === 'terms' && !o.payment.paidAt && o.payment.dueDate && new Date(String(o.payment.dueDate).length <= 10 ? o.payment.dueDate + 'T00:00:00' : o.payment.dueDate) < startToday && o.stage === 'delivered').map((o) => ({ o, msg: t('terms payment overdue') })) : []),
    ...orders.filter((o) => o.stage !== 'delivered' && !['awaiting', 'outstanding', 'cancelled', 'returned'].includes(o.stage) && new Date(o.deliver) < startToday).map((o) => ({ o, msg: t('past its delivery date') })),
    ...(can(role, 'confirmDocsReturned', settings) ? orders.filter((o) => o.stage === 'delivered' && !o.docsReturned).map((o) => ({ o, msg: t('signed DO/SI not returned') })) : []),
  ].slice(0, 6)

  return (
    <>
      <PageHead title={t('Home')}>
        {canCreate && <button className="btn btn-primary btn-sm" onClick={() => nav('/new')}><Plus size={16} /> {t('New order')}</button>}
      </PageHead>
      <div className="page">
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <div className="stat stat-link" onClick={() => nav('/orders?stage=active')} title={t('Open orders')}>
            <div className="stat-top"><span className="l">{t('Open orders')}</span><span className="stat-ico" style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 15%, transparent)' }}><Package size={17} /></span></div>
            <div className="v">{openOrders.length}</div>
          </div>
          <div className="stat stat-link" onClick={() => nav('/orders?filter=today')} title={t("Today's Orders")}>
            <div className="stat-top"><span className="l">{t("Today's Orders")}</span><span className="stat-ico" style={{ color: 'var(--c-intake)', background: 'color-mix(in srgb, var(--c-intake) 15%, transparent)' }}><Inbox size={17} /></span></div>
            <div className="v">{ordersToday}</div>
          </div>
        </div>
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(158px,1fr))' }}>
          <PeriodStat title="Delivered Orders" orders={deliveredOrders} dateOf={deliveredOn} dtype="delivered" persistKey="ipp-deliv-window" accent="var(--c-done)" icon={<PackageCheck size={17} />} t={t} nav={nav} />
          <PeriodStat title="Cancelled Orders" orders={cancelledOrders} dateOf={cancelledOn} dtype="cancelled" persistKey="ipp-cancel-window" accent="var(--danger-text)" icon={<Ban size={17} />} t={t} nav={nav} />
        </div>

        {(role === 'Courier' || ['Warehouse', 'Admin', 'Owner'].includes(role) || (can(role, 'reconcileCOD', settings) && codPending.length > 0)) && (
          <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
            {role === 'Courier' && (
              <div className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => nav('/deliveries')}>
                <div className="flex items gap"><Navigation size={17} style={{ color: 'var(--c-courier)', flexShrink: 0 }} /><div><div style={{ fontWeight: 600, fontSize: 13 }}>{t('My deliveries')}</div><div className="tiny muted">{myDeliveries.length} {t('to deliver')}</div></div></div>
              </div>
            )}
            {['Warehouse', 'Admin', 'Owner'].includes(role) && (
              <div className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => nav('/picklist')}>
                <div className="flex items gap"><Package size={17} style={{ color: 'var(--c-cold)', flexShrink: 0 }} /><div><div style={{ fontWeight: 600, fontSize: 13 }}>{t('Pick list')}</div><div className="tiny muted">{t("today's items to pull, summed")}</div></div></div>
              </div>
            )}
            {can(role, 'reconcileCOD', settings) && codPending.length > 0 && (
              <div className="card card-pad" style={{ cursor: 'pointer', borderColor: 'var(--warning)' }} onClick={() => nav('/cashup')}>
                <div className="flex items gap"><Banknote size={17} style={{ color: 'var(--warning-text)', flexShrink: 0 }} /><div><div style={{ fontWeight: 600, fontSize: 13 }}>{t('COD cash-up')}</div><div className="tiny muted tnum">{jt(codTotal)} · {codPending.length}</div></div></div>
              </div>
            )}
          </div>
        )}

        {/* OWNER's end-of-day digest — the whole day in one glance, no digging through Reports. */}
        {role === 'Owner' && (() => {
          const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1)
          const inToday = (d) => d >= startToday && d < endToday
          const deliveredToday = deliveredOrders.filter((o) => inToday(deliveredOn(o))).length
          const codToday = orders.filter((o) => o.payment && o.payment.codReceivedAt && inToday(new Date(o.payment.codReceivedAt)))
          const codTodayTotal = codToday.reduce((s, o) => s + (Number(o.payment.codAmount) || 0), 0)
          const onRoad = orders.filter((o) => o.stage === 'dispatch' && (o.takenBy || o.pickup || o.thirdParty)).length
          const docsOut = orders.filter((o) => o.stage === 'delivered' && !o.docsReturned).length
          // DISTINCT orders — retTotal sums the bucket counts, and one return can sit in two buckets
          // at once (parallel receive ∥ settle), which would double-count it here.
          const retOrders = orders.filter((o) => returnBuckets(o).length > 0).length
          const cell = (label, v, to, warn) => (
            <div style={{ cursor: to ? 'pointer' : 'default' }} onClick={to ? () => nav(to) : undefined}>
              <div style={{ fontSize: 17, fontWeight: 600, color: warn && v > 0 ? 'var(--warning-text)' : 'var(--text)' }}>{v}</div>
              <div className="tiny muted">{label}</div>
            </div>
          )
          return (
            <>
              <div className="sec-label">{t('Today at a glance')}</div>
              <div className="card card-pad mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 10, textAlign: 'center' }}>
                {cell(t('new orders'), ordersToday, '/orders?filter=today')}
                {cell(t('delivered'), deliveredToday)}
                {cell(t('on the road'), onRoad, '/orders?stage=dispatch')}
                {cell(t('returns in flight'), retOrders, retOrders ? '/orders?stage=returned' : null, true)}
                {cell(t('COD collected'), codToday.length ? `${codToday.length} · ${jt(codTodayTotal)}` : 0)}
                {cell(t('COD pending'), codPending.length, codPending.length ? '/cashup' : null, true)}
                {cell(t('DO/SI not back'), docsOut, docsOut ? '/orders?stage=pending-docs' : null, true)}
              </div>
            </>
          )
        })()}

        <div className="sec-label">{t('Current order pipeline')}</div>
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 7 }}>
          {counts.map(({ s, n }) => {
            const mine = focus.includes(s)   // a stage this role is responsible for
            // The Dispatch stage covers TWO real-world states — split them out so "3" isn't read as
            // "3 trucks on the road" when 2 are still waiting for a courier to take them.
            const onRoad = s === 'dispatch' ? orders.filter((o) => o.stage === 'dispatch' && (o.takenBy || o.pickup || o.thirdParty)).length : 0
            const toPick = s === 'dispatch' ? n - onRoad : 0
            return (
              <div key={s} className="card card-pad" onClick={() => nav('/orders?stage=' + s)} title={t(STAGE_LABEL[s])}
                style={{ textAlign: 'center', padding: '9px 4px', cursor: 'pointer', ...(mine ? { borderColor: STAGE_COLOR[s], background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px ' + STAGE_COLOR[s] } : {}) }}>
                <div style={{ fontSize: 19, fontWeight: 600, color: s === 'delivered' && !mine ? 'var(--c-done)' : mine ? STAGE_COLOR[s] : 'var(--text)' }}>{n}</div>
                <div className="tiny muted">{t(STAGE_LABEL[s])}</div>
                {s === 'dispatch' && n > 0 && <div className="tiny" style={{ color: 'var(--text-3)', marginTop: 1 }}>{toPick} {t('to pick up')} · {onRoad} {t('on the road')}</div>}
              </div>
            )
          })}
        </div>
        {focus.length > 0 && <div className="tiny muted" style={{ margin: '-4px 2px 14px' }}>{t('Highlighted modules are your responsibility.')}</div>}

        {retTotal > 0 && <>
          <div className="sec-label">{t('Returns workflow')}</div>
          <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(118px,1fr))', gap: 7 }}>
            {retCounts.map((b) => {
              // The Owner oversees EVERY step, so nothing is singled out as "theirs" (same as the pipeline
              // tiles — ROLE_FOCUS[Owner] is empty). Highlight only a specific role's own buckets.
              const mine = b.roles.includes(role) && role !== 'Owner' && b.n > 0
              return (
                <div key={b.key} className="card card-pad" onClick={() => nav('/orders?ret=' + b.key)} title={t(b.label)}
                  style={{ textAlign: 'center', padding: '9px 4px', cursor: 'pointer', ...(mine ? { borderColor: 'var(--danger)', background: 'var(--surface-2)' } : {}) }}>
                  <div style={{ fontSize: 19, fontWeight: 600, color: b.n > 0 ? 'var(--danger-text)' : 'var(--text-3)' }}>{b.n}</div>
                  <div className="tiny muted">{t(b.label)}</div>
                </div>
              )
            })}
          </div>
        </>}

        {attention.length > 0 && <>
          <div className="sec-label">{t('Needs attention')}</div>
          {attention.map(({ o, msg }, i) => (
            <div key={i} className="rowcard" style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger)' }} onClick={() => nav('/orders/' + o.id)}>
              <AlertTriangle size={15} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
              <div className="grow tiny" style={{ color: 'var(--danger-text)' }}><b>#{o.no} {o.customerName}</b> — {msg}</div>
            </div>
          ))}
          <div className="mt" />
        </>}

        <OrderList orders={openOrders} title="Open orders" />
      </div>
    </>
  )
}
