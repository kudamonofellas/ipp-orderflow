import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { orderValue, PRICE_VISIBLE, STAGES } from '../lib/domain.js'
import { jt, dateShort } from '../lib/format.js'
import { StageText } from './ui.jsx'
import { ArrowUpDown, ChevronDown, Check, Truck } from 'lucide-react'

const SORTS = [
  { k: 'num', label: 'Order #' },
  { k: 'deliver', label: 'Delivery date' },
  { k: 'value', label: 'Value' },
  { k: 'stage', label: 'Stage' },
  { k: 'cust', label: 'Customer A–Z' },
]

export default function OrderList({ orders, title = 'All orders' }) {
  const { user, t, settings } = useStore()
  const nav = useNavigate()
  const [sort, setSort] = useState('num')
  const [open, setOpen] = useState(false)
  const priceOk = PRICE_VISIBLE(user.role, settings)

  const rows = orders.map((o) => ({ o, value: orderValue(o) }))
  rows.sort((a, b) => {
    if (sort === 'deliver') return new Date(a.o.deliver) - new Date(b.o.deliver)
    if (sort === 'value') return b.value - a.value
    if (sort === 'stage') return STAGES.indexOf(a.o.stage) - STAGES.indexOf(b.o.stage)
    if (sort === 'cust') return a.o.customerName.localeCompare(b.o.customerName)
    return b.o.no.localeCompare(a.o.no)
  })
  const cur = SORTS.find((s) => s.k === sort)

  return (
    <div onClick={() => setOpen(false)}>
      <div className="flex items between mb">
        <span className="sec-label" style={{ margin: 0 }}>{t(title)} · {orders.length}</span>
        <div className="dd" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)}>
            <ArrowUpDown size={14} /> {t(cur.label)} <ChevronDown size={14} />
          </button>
          {open && (
            <div className="dd-menu">
              {SORTS.map((s) => (
                <div key={s.k} className={'dd-item' + (s.k === sort ? ' on' : '')} onClick={() => { setSort(s.k); setOpen(false) }}>
                  {t(s.label)}{s.k === sort && <Check size={15} style={{ marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 && <div className="empty">{t('No orders here.')}</div>}
      {rows.map(({ o, value }) => (
        <div key={o.id} className="rowcard" onClick={() => nav('/orders/' + o.id)}>
          <div className="grow">
            <div className="name">{o.customerName}</div>
            <div className="meta">#{o.no} · <Truck size={11} style={{ verticalAlign: -1 }} /> {dateShort(o.deliver)}</div>
            {o.stage === 'delivered' && (o.docsReturned
              ? <div className="tiny" style={{ color: 'var(--success-text)', marginTop: 2 }}>✓ {t('Completed')}</div>
              : <div className="tiny" style={{ color: 'var(--warning-text)', marginTop: 2 }}>⚠ {t('Signed DO/SI not returned yet')}</div>)}
          </div>
          {priceOk && <span className="tnum" style={{ width: 74, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>{value > 0 ? jt(value) : '—'}</span>}
          <span style={{ width: 120, fontSize: 12 }}><StageText stage={o.stage} order={o} /></span>
        </div>
      ))}
    </div>
  )
}
