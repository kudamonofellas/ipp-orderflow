import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { PageHead } from '../components/ui.jsx'
import { STAGE_COLOR, orderValue, can } from '../lib/domain.js'
import { jt } from '../lib/format.js'
import {
  PERIODS,
  filterByPeriod,
  filterByRange,
  headerStats,
  onTimeDelivery,
  weightVariance,
  fulfilment,
  volumeByCustomer,
  demandByProduct,
  cycleTime,
} from '../lib/reports.js'

// ---------- small presentational helpers (no new CSS — inline styles + existing classes) ----------

// One bar row: full name + value on top (name wraps in full — no truncation), the track below.
function Bar({ label, value, pct, color, sub }) {
  const width = Math.max(0, Math.min(100, pct || 0))
  return (
    <div style={{ marginBottom: 9 }}>
      <div className="flex items between" style={{ gap: 10, marginBottom: 3 }}>
        <span style={{ fontSize: 12.5, lineHeight: 1.25, minWidth: 0 }}>
          {label}{sub ? <span className="muted"> {sub}</span> : null}
        </span>
        <span className="tnum tiny" style={{ textAlign: 'right', color: 'var(--text-2)', flexShrink: 0, whiteSpace: 'nowrap' }}>{value}</span>
      </div>
      <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ background: color || 'var(--info)', width: width + '%', height: '100%', borderRadius: 4 }} />
      </div>
    </div>
  )
}

function NoData() {
  return <div className="tiny muted" style={{ padding: '6px 2px' }}>No data in this period</div>
}

const round1 = (n) => (Math.round(n * 10) / 10)
const kg = (n) => round1(n).toLocaleString('en-US') + ' kg'

export default function Reports() {
  const { orders, user, settings, t } = useStore()
  const [periodKey, setPeriodKey] = useState('30')
  const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
  const [month, setMonth] = useState(thisMonth)   // YYYY-MM for the Month picker
  const [from, setFrom] = useState('')            // YYYY-MM-DD for the custom Range picker
  const [to, setTo] = useState('')
  const seeCredit = can(user.role, 'seeCustomerCredit', settings)
  // Receivables: terms orders already delivered, bucketed current vs overdue (by the auto due date).
  // Current state across all time (not period-scoped). Value shows only where the order stated a price.
  const ar = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Paid terms invoices (payment.paidAt — recorded by Finance on the order) are no longer receivable.
    const terms = orders.filter((o) => o.payment && o.payment.timing === 'terms' && o.stage === 'delivered' && !o.payment.paidAt)
    let current = 0, overdue = 0, overdueN = 0
    terms.forEach((o) => {
      const v = orderValue(o) || 0
      const dd = o.payment.dueDate ? new Date(String(o.payment.dueDate).length <= 10 ? o.payment.dueDate + 'T00:00:00' : o.payment.dueDate) : null
      if (dd && dd < today) { overdue += v; overdueN++ } else current += v
    })
    return { n: terms.length, current, overdue, overdueN }
  }, [orders])

  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[1]
  const scoped = useMemo(() => {
    const live = orders
    if (periodKey === 'month') {
      // A cleared month box must not silently show last-30-days under the "Month" tab — use this month.
      const [y, m] = (month || thisMonth()).split('-').map(Number)
      return filterByRange(live, new Date(y, m - 1, 1).getTime(), new Date(y, m, 0, 23, 59, 59, 999).getTime())
    }
    if (periodKey === 'range') {
      const fromMs = from ? new Date(from + 'T00:00:00').getTime() : null
      const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : null
      return filterByRange(live, fromMs, toMs)
    }
    return filterByPeriod(live, period.days)
  }, [orders, periodKey, month, from, to, period.days])

  const stats = useMemo(() => headerStats(scoped), [scoped])
  const onTime = useMemo(() => onTimeDelivery(scoped), [scoped])
  const variance = useMemo(() => weightVariance(scoped), [scoped])
  const fulfil = useMemo(() => fulfilment(scoped), [scoped])
  const custVol = useMemo(() => volumeByCustomer(scoped, 8), [scoped])
  const demand = useMemo(() => demandByProduct(scoped, 10), [scoped])
  const cycle = useMemo(() => cycleTime(scoped), [scoped])

  const empty = scoped.length === 0

  // helpers for bar percentages (relative to the largest value in each list)
  const maxOf = (arr, sel) => arr.reduce((m, x) => Math.max(m, sel(x)), 0) || 1

  const maxCustOrders = maxOf(custVol.byOrders, (c) => c.orders)
  const maxCustKg = maxOf(custVol.byKg, (c) => c.kg)
  const maxDemand = maxOf(demand, (p) => p.total)
  const maxCycle = maxOf(cycle.stages, (s) => s.avgHours)

  return (
    <>
      <PageHead title={t('Reports')} />
      <div className="page">

        {/* period filter — presets, a Month picker, or a custom date Range */}
        <div className="flex items gap mb" style={{ flexWrap: 'wrap' }}>
          <div className="seg" role="tablist" aria-label={t('Period')}>
            {PERIODS.map((p) => (
              <button key={p.key} className={p.key === periodKey ? 'on' : ''} onClick={() => setPeriodKey(p.key)}>{t(p.label)}</button>
            ))}
            <button className={periodKey === 'month' ? 'on' : ''} onClick={() => setPeriodKey('month')}>{t('Month')}</button>
            <button className={periodKey === 'range' ? 'on' : ''} onClick={() => setPeriodKey('range')}>{t('Range')}</button>
          </div>
          {periodKey === 'month' && (
            <input type="month" className="input" style={{ maxWidth: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('Month')} />
          )}
          {periodKey === 'range' && (
            <div className="flex items gap" style={{ flexWrap: 'wrap' }}>
              <input type="date" className="input" style={{ maxWidth: 165 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('From')} />
              <span className="tiny muted">{t('to')}</span>
              <input type="date" className="input" style={{ maxWidth: 165 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('To')} />
            </div>
          )}
        </div>

        {/* header stats */}
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
          <div className="stat"><div className="l">{t('Total orders')}</div><div className="v">{stats.total}</div></div>
          <div className="stat"><div className="l">{t('Delivered')}</div><div className="v">{stats.delivered}</div></div>
          <div className="stat"><div className="l">{t('Returned')}</div><div className="v">{stats.returned}</div></div>
          <div className="stat"><div className="l">{t('Cancelled')}</div><div className="v">{stats.cancelled}</div></div>
        </div>

        {empty && (
          <div className="card card-pad mb"><NoData /></div>
        )}

        {/* on-time delivery + fulfilment side by side */}
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          <div className="card card-pad">
            <div className="sec-label">{t('On-time delivery')}</div>
            {onTime.pct == null ? <NoData /> : (
              <>
                <div className="flex items between">
                  <div className="v tnum" style={{ fontSize: 28, fontWeight: 600 }}>{onTime.pct}%</div>
                  <div className="tiny muted">{onTime.onTime}/{onTime.n} {t('on time')}</div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 8, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ background: 'var(--success)', width: onTime.pct + '%', height: '100%' }} />
                </div>
                {onTime.late > 0 && (
                  <div className="tiny muted mt">{onTime.late} {t('delivered late')}</div>
                )}
              </>
            )}
          </div>

          <div className="card card-pad">
            <div className="sec-label">{t('Fulfilment')}</div>
            {fulfil.total === 0 ? <NoData /> : (
              <>
                <div className="flex gap mb" style={{ flexWrap: 'wrap' }}>
                  <span className="chip chip-success">{fulfil.cleanPct}% {t('clean')}</span>
                  <span className="chip chip-warning">{fulfil.shortPct}% {t('short')}</span>
                  <span className="chip">{fulfil.backorderedPct}% {t('backordered')}</span>
                </div>
                <Bar label={t('Clean')} pct={(fulfil.clean / fulfil.total) * 100} value={fulfil.clean} color="var(--success)" />
                <Bar label={t('Closed short')} pct={(fulfil.short / fulfil.total) * 100} value={fulfil.short} color="var(--warning)" />
                <Bar label={t('Backordered')} pct={(fulfil.backordered / fulfil.total) * 100} value={fulfil.backordered} color="var(--c-courier)" />
              </>
            )}
          </div>
        </div>

        {seeCredit && ar.n > 0 && (<>
          <div className="sec-label">{t('Receivables (terms)')}</div>
          <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <div className="stat"><div className="l">{t('Terms outstanding')}</div><div className="v">{ar.n}</div>{ar.current + ar.overdue > 0 ? <div className="tiny muted tnum">{jt(ar.current + ar.overdue)}</div> : null}</div>
            <div className="stat" style={ar.overdueN > 0 ? { borderLeft: '3px solid var(--danger)' } : null}><div className="l">{t('Overdue')}</div><div className="v" style={{ color: ar.overdueN > 0 ? 'var(--danger-text)' : 'var(--text)' }}>{ar.overdueN}</div>{ar.overdue > 0 ? <div className="tiny muted tnum">{jt(ar.overdue)}</div> : null}</div>
          </div>
        </>)}

        {/* weight variance / shrinkage */}
        <div className="sec-label">{t('Weight variance / shrinkage')}</div>
        <div className="card card-pad mb">
          {variance.variancePct == null ? <NoData /> : (
            <>
              <div className="flex items between mb">
                <div>
                  <div className="v tnum" style={{ fontSize: 26, fontWeight: 600, color: variance.variancePct < 0 ? 'var(--warning-text)' : 'var(--text)' }}>
                    {variance.variancePct > 0 ? '+' : ''}{round1(variance.variancePct)}%
                  </div>
                  <div className="tiny muted">{t('overall: weighed vs ordered')}</div>
                </div>
                <div className="tiny muted tnum" style={{ textAlign: 'right' }}>
                  {kg(variance.totalWeighed)} {t('weighed')}<br />
                  {kg(variance.totalOrdered)} {t('ordered')}
                </div>
              </div>
              {variance.products.length === 0 ? (
                <div className="tiny muted">{t('No weighed lines to compare')}</div>
              ) : (
                <>
                  <div className="tiny muted mb">{t('Products by drift (weighed vs ordered)')}</div>
                  {variance.products.slice(0, 8).map((p) => {
                    const over = p.variancePct >= 0
                    return (
                      <Bar
                        key={p.name}
                        label={p.name}
                        sub={'×' + p.n}
                        pct={Math.min(100, Math.abs(p.variancePct))}
                        value={(over ? '+' : '') + round1(p.variancePct) + '%'}
                        color={over ? 'var(--info)' : 'var(--warning)'}
                      />
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* volume by customer */}
        <div className="sec-label">{t('Volume by customer')}</div>
        <div className="grid2 mb" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          <div className="card card-pad">
            <div className="tiny muted mb">{t('Top customers by orders')}</div>
            {custVol.byOrders.length === 0 ? <NoData /> : custVol.byOrders.map((c) => (
              <Bar key={c.name} label={c.name} pct={(c.orders / maxCustOrders) * 100} value={c.orders + ' ' + t('orders')} />
            ))}
          </div>
          <div className="card card-pad">
            <div className="tiny muted mb">{t('Top customers by weighed kg')}</div>
            {custVol.byKg.length === 0 ? <NoData /> : custVol.byKg.map((c) => (
              <Bar key={c.name} label={c.name} pct={(c.kg / maxCustKg) * 100} value={kg(c.kg)} color="var(--c-cold)" />
            ))}
          </div>
        </div>

        {/* demand by product */}
        <div className="sec-label">{t('Demand by product')}</div>
        <div className="card card-pad mb">
          {demand.length === 0 ? <NoData /> : demand.map((p) => {
            const val = p.kg > 0 && p.count > 0
              ? kg(p.kg) + ' · ' + p.count
              : p.kg > 0
                ? kg(p.kg)
                : p.count + ' ' + (p.unit || '')
            return <Bar key={p.name} label={p.name} pct={(p.total / maxDemand) * 100} value={val} />
          })}
        </div>

        {/* cycle time / bottleneck */}
        <div className="sec-label">{t('Cycle time per stage')}</div>
        <div className="card card-pad mb">
          {cycle.measured === 0 ? <NoData /> : (
            <>
              {cycle.slowest && (
                <div className="tiny muted mb">
                  {t('Bottleneck')}: <b style={{ color: 'var(--warning-text)' }}>{t(cycle.slowest.label)}</b> — {round1(cycle.slowest.avgHours)}h {t('avg')}
                </div>
              )}
              {cycle.stages.map((s) => {
                const isSlow = cycle.slowest && s.stage === cycle.slowest.stage
                return (
                  <Bar
                    key={s.stage}
                    label={t(s.label)}
                    pct={(s.avgHours / maxCycle) * 100}
                    value={s.n ? round1(s.avgHours) + 'h' : '—'}
                    color={isSlow ? 'var(--warning)' : (STAGE_COLOR[s.stage] || 'var(--info)')}
                  />
                )
              })}
              <div className="tiny muted mt">{t('Average hours an order sits in each stage')}</div>
            </>
          )}
        </div>

      </div>
    </>
  )
}
