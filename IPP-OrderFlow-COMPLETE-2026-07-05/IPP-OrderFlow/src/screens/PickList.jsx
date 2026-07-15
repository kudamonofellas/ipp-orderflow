import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { PageHead } from '../components/ui.jsx'
import { isWeightUnit } from '../lib/domain.js'
import { Package } from 'lucide-react'

const pad2 = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// AGGREGATE PICK LIST — "today needs 31 kg lamb leg across 5 orders". Sums every line still to be
// pulled (orders at New Orders / Cold Storage) for one delivery date, so the warehouse pulls each
// product ONCE instead of walking the cold room order by order. Weighed items show the summed
// ordered figure — the actual kg still comes from the scale per order, as always.
export default function PickList() {
  const { orders, t } = useStore()
  const nav = useNavigate()
  const [day, setDay] = useState(() => toISO(new Date()))
  const start = new Date(day + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const pool = orders.filter((o) => ['intake', 'cold'].includes(o.stage) && !o.hold && new Date(o.deliver) >= start && new Date(o.deliver) < end)

  const map = new Map()
  pool.forEach((o) => (o.lines || []).forEach((l) => {
    if (l.removed) return
    const key = (l.productId || l.name) + '|' + l.unit
    const e = map.get(key) || { name: l.name, unit: l.unit, qty: 0, cuts: 0, orders: [] }
    e.qty += Number(l.qty) || 0
    e.cuts += (l.cuts || []).filter((c) => (c.text || '').trim()).length
    e.orders.push({ id: o.id, no: o.no, qty: l.qty, cust: o.customerName })
    map.set(key, e)
  }))
  const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHead title={t('Pick list')} sub={`${pool.length} ${t('order(s)')}`} back={() => nav('/')} />
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="flex items gap mb">
          <span className="tiny muted">{t('Deliveries on')}</span>
          <input type="date" className="input" style={{ maxWidth: 170 }} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        {rows.length === 0 && <div className="empty">{t('Nothing to pull for this date — orders past Cold Storage are already picked.')}</div>}
        {rows.map((r, i) => (
          <div key={i} className="card card-pad mb">
            <div className="flex items between" style={{ gap: 8 }}>
              <span className="name grow" style={{ minWidth: 0 }}>{r.name}</span>
              <b className="tnum" style={{ flexShrink: 0, fontSize: 15 }}>{Math.round(r.qty * 100) / 100} {r.unit}</b>
            </div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {r.orders.map((o, j) => (
                <span key={j}>
                  <span onClick={() => nav('/orders/' + o.id)} style={{ cursor: 'pointer', color: 'var(--info)' }}>#{o.no}</span> {o.qty} {r.unit} · {o.cust}{j < r.orders.length - 1 ? '  ·  ' : ''}
                </span>
              ))}
              {r.cuts > 0 && <span> · ✂ {r.cuts} {t('cutting job(s)')}</span>}
              {isWeightUnit(r.unit) && <span> · {t('actual kg from the scale per order')}</span>}
            </div>
          </div>
        ))}
        <div className="tiny muted mt" style={{ textAlign: 'center' }}><Package size={12} style={{ verticalAlign: -2 }} /> {t('Counts orders still at New Orders / Cold Storage for the chosen delivery date (on-hold excluded).')}</div>
      </div>
    </>
  )
}
