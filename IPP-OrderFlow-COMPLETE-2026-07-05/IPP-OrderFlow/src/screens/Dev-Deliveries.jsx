import { useStore } from '../lib/store.jsx'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../components/ui.jsx'
import { jt } from '../lib/format.js'
import { MapPin, Navigation, Truck, ChevronUp, ChevronDown } from 'lucide-react'

const mapsSearch = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)

// Courier run-sheet: the deliveries to do, with destination address + a tap-to-navigate maps link and
// the COD amount to collect. The courier's own taken jobs first, then anything still unassigned.
export default function Deliveries() {
  const { orders, user, t, saveOrder } = useStore()
  const nav = useNavigate()
  // The destination address always shows on the run-sheet — it exists FOR the courier; hiding it via
  // the customer-contact permission made deliveries impossible (phone/sales stay hidden elsewhere).
  const dispatch = orders.filter((o) => o.stage === 'dispatch')
  // Revised-DO/SI signing runs are courier jobs too — Home's "My deliveries" counts them, so the
  // run-sheet must list them (they were missing here).
  const signRuns = orders.filter((o) => o.stage === 'returned' && o.returnSettle === 'sign')
  const takenByMe = (o) => (o.stage === 'dispatch' ? (o.takenBy === user.name || !o.takenBy) : (!o.returnDispatch || !o.returnDispatch.takenBy || o.returnDispatch.takenBy === user.name))
  const all = [...dispatch, ...signRuns]
  // The courier orders their own stops (runSeq) — unsequenced runs sink to the bottom in date order.
  const bySeq = (a, b) => ((a.runSeq ?? 999) - (b.runSeq ?? 999)) || (new Date(a.deliver) - new Date(b.deliver))
  const mine = all.filter(takenByMe).sort(bySeq)
  const others = all.filter((o) => !takenByMe(o))
  // Only reorder stops that are truly YOURS (taken by you) — the unassigned pool is shared.
  const ownRun = (o) => (o.stage === 'dispatch' ? o.takenBy === user.name : !!(o.returnDispatch && o.returnDispatch.takenBy === user.name))
  const move = (o, dir) => {
    const seq = mine.filter(ownRun)
    const i = seq.findIndex((x) => x.id === o.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= seq.length) return
    const a = seq[i], b = seq[j]
    saveOrder({ ...a, runSeq: j }); saveOrder({ ...b, runSeq: i })
    // renumber the rest so sequences stay dense after mixed moves
    seq.forEach((x, k) => { if (x.id !== a.id && x.id !== b.id && x.runSeq !== k) saveOrder({ ...x, runSeq: k }) })
  }

  const Row = (o) => {
    const sign = o.stage === 'returned'
    const taken = sign ? (o.returnDispatch && o.returnDispatch.takenBy) : o.takenBy
    return (
      <div key={o.id} className="rowcard" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ cursor: 'pointer' }} onClick={() => nav('/orders/' + o.id)}>
          <div className="name">{o.customerName}{sign ? <span className="chip" style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', background: 'var(--danger-bg)', color: 'var(--danger-text)' }}>{t('DO/SI to sign')}</span> : null}</div>
          <div className="meta">#{o.no}{taken ? ' · ' + t('Taken by') + ' ' + taken : ' · ' + t('unassigned')}</div>
          {o.address ? <div className="tiny" style={{ marginTop: 4, color: 'var(--text-2)' }}><MapPin size={11} style={{ verticalAlign: -1 }} /> {o.address}</div> : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {!sign && o.payment && o.payment.timing === 'cod' && o.payment.codAmount ? <div className="chip chip-warning" style={{ whiteSpace: 'nowrap' }}>COD {jt(o.payment.codAmount)}</div> : null}
          {o.address ? <a className="btn btn-secondary btn-sm mt" style={{ whiteSpace: 'nowrap' }} href={mapsSearch(o.address)} target="_blank" rel="noreferrer"><Navigation size={13} /> {t('Navigate')}</a> : null}
        </div>
        {ownRun(o) && mine.filter(ownRun).length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => move(o, -1)} aria-label={t('Move up')}><ChevronUp size={15} /></button>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => move(o, 1)} aria-label={t('Move down')}><ChevronDown size={15} /></button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHead title={t('My deliveries')} sub={`${mine.length}`} back={() => nav('/')} />
      <div className="page" style={{ maxWidth: 720 }}>
        {mine.length === 0 && others.length === 0 && <div className="empty">{t('No deliveries right now.')}</div>}
        {mine.map(Row)}
        {others.length > 0 && (<>
          <div className="sec-label mt-lg" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Truck size={13} /> {t('With other drivers')}</div>
          {others.map(Row)}
        </>)}
      </div>
    </>
  )
}
