import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { PageHead, Avatar } from '../components/ui.jsx'
import OrderList from '../components/OrderList.jsx'
import { customerExposure, can } from '../lib/domain.js'
import { jt } from '../lib/format.js'
import { Check } from 'lucide-react'

// Customer master record + their order dossier. Owner/Admin can add/edit (over the existing
// addCustomer/updateCustomer store actions); everyone can view the account + history.
export default function CustomerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { customers, orders, user, addCustomer, updateCustomer, t, settings } = useStore()
  const isNew = id === 'new'
  const existing = customers.find((c) => c.id === id)
  const canEdit = can(user.role, 'manageCustomers', settings)
  const seeCredit = can(user.role, 'seeCustomerCredit', settings)
  const [c, setC] = useState(existing || { id: 'c' + Date.now(), name: '', channel: 'horeca', payment: { timing: 'upfront', method: 'transfer' }, contact: '', address: '', area: '', sales: '', creditLimit: 0, termDays: 0 })

  if (!isNew && !existing) return <div className="page"><div className="empty">Customer not found.</div></div>

  const theirOrders = existing ? orders.filter((o) => o.customerId === existing.id) : []
  const exposure = existing ? customerExposure(orders, existing.id) : 0
  const set = (patch) => setC((x) => ({ ...x, ...patch }))
  const setPay = (patch) => setC((x) => ({ ...x, payment: { ...x.payment, ...patch } }))
  const save = () => {
    if (!c.name.trim()) return
    const rec = { ...c, name: c.name.trim(), creditLimit: Number(String(c.creditLimit).replace(/[^\d]/g, '')) || 0, termDays: Number(c.termDays) || 0 }
    if (isNew || !existing) addCustomer(rec); else updateCustomer(rec)
    nav('/customers')
  }

  return (
    <>
      <PageHead title={isNew ? t('New customer') : c.name} sub={isNew ? '' : 'Horeca · B2B'} back={() => nav('/customers')} />
      <div className="page" style={{ maxWidth: 720 }}>
        {canEdit ? (
          <div className="card card-pad mb">
            <div className="field"><label>{t('Restaurant / outlet')}</label><input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} /></div>
            <div className="field"><label>{t('Company name')} <span className="muted" style={{ fontWeight: 400 }}>{t('(PT / CV — for the invoice)')}</span></label><input className="input" value={c.company || ''} onChange={(e) => set({ company: e.target.value })} placeholder={t('e.g. PT En Prima Food & Beverages')} /></div>
            <div className="grid2">
              <div className="field"><label>{t('Phone')}</label><input className="input" value={c.contact || ''} onChange={(e) => set({ contact: e.target.value })} /></div>
              <div className="field"><label>{t('Area')}</label><input className="input" value={c.area || ''} onChange={(e) => set({ area: e.target.value })} /></div>
            </div>
            <div className="field"><label>{t('Delivery address')}</label><input className="input" value={c.address || ''} onChange={(e) => set({ address: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>{t('Sales')}</label><input className="input" value={c.sales || ''} onChange={(e) => set({ sales: e.target.value })} /></div>
              <div className="field"><label>{t('Payment timing')}</label>
                <select className="input" value={c.payment.timing} onChange={(e) => setPay({ timing: e.target.value })}><option value="upfront">Upfront</option><option value="cod">COD</option><option value="terms">Terms</option></select></div>
            </div>
            <div className="grid2">
              <div className="field"><label>{t('Credit limit (Rp)')}</label><input className="input" inputMode="numeric" value={c.creditLimit || ''} onChange={(e) => set({ creditLimit: e.target.value })} /></div>
              <div className="field"><label>{t('Terms (days)')}</label><input className="input" type="number" value={c.termDays || ''} onChange={(e) => set({ termDays: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary btn-block mt" disabled={!c.name.trim()} onClick={save}><Check size={16} /> {t('Save customer')}</button>
          </div>
        ) : (
          <div className="card card-pad mb">
            <div className="flex items gap"><Avatar name={c.name} /><div><div style={{ fontWeight: 600 }}>{c.name}</div>{c.company ? <div className="tiny muted">{c.company}</div> : null}<div className="tiny muted">{[c.area, c.contact].filter(Boolean).join(' · ') || t('No contact details yet')}</div></div></div>
          </div>
        )}
        {!isNew && existing && (
          <>
            {seeCredit && existing.creditLimit ? (
              <div className="card card-pad mb">
                <div className="flex between tiny"><span className="muted">{t('Account exposure (in flight)')}</span><b className="tnum">{jt(exposure)}</b></div>
                <div className="flex between tiny" style={{ marginTop: 4 }}><span className="muted">{t('Credit limit')}</span><b className="tnum">{jt(existing.creditLimit)}</b></div>
              </div>
            ) : null}
            <OrderList orders={theirOrders} title="Their orders" />
          </>
        )}
      </div>
    </>
  )
}
