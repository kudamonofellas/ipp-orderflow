import { useStore } from '../lib/store.jsx'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../components/ui.jsx'
import { jt } from '../lib/format.js'
import { Banknote } from 'lucide-react'

// COD cash-up worklist: every delivered COD order whose cash hasn't been reconciled in the office,
// with the total expected. Reuses the same reconcile action as the per-order card.
export default function CashUp() {
  const { orders, saveOrder, user, t } = useStore()
  const nav = useNavigate()
  const cod = orders.filter((o) => o.stage === 'delivered' && o.payment && o.payment.timing === 'cod' && !o.payment.codReconciled)
  const total = cod.reduce((s, o) => s + (Number(o.payment.codAmount) || 0), 0)
  const reconcile = (o) => saveOrder({ ...o, payment: { ...o.payment, codReconciled: true, codReceivedAt: new Date().toISOString() }, history: [...o.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: `COD cash reconciled${o.payment.codAmount ? ' — ' + jt(o.payment.codAmount) : ''}` }] })
  return (
    <>
      <PageHead title={t('COD cash-up')} sub={`${cod.length} ${t('to reconcile')}`} back={() => nav('/')} />
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="stat mb"><div className="l">{t('Cash expected')}</div><div className="v tnum">{jt(total)}</div></div>
        {cod.length === 0 && <div className="empty">{t('All COD cash is reconciled.')}</div>}
        {cod.map((o) => (
          <div key={o.id} className="rowcard" style={{ alignItems: 'center' }}>
            <div className="grow" style={{ cursor: 'pointer' }} onClick={() => nav('/orders/' + o.id)}>
              <div className="name">{o.customerName}</div>
              <div className="meta">#{o.no}{o.takenBy ? ' · ' + t('Taken by') + ' ' + o.takenBy : ''}</div>
            </div>
            <b className="tnum" style={{ marginRight: 10 }}>{o.payment.codAmount ? jt(o.payment.codAmount) : '—'}</b>
            <button className="btn btn-success btn-sm" onClick={() => reconcile(o)}><Banknote size={14} /> {t('Reconcile')}</button>
          </div>
        ))}
      </div>
    </>
  )
}
