import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Avatar, PageHead } from '../components/ui.jsx'
import { can } from '../lib/domain.js'
import { customersToCSV, csvToCustomers, downloadText } from '../lib/csv.js'
import { Plus, Download, Upload } from 'lucide-react'

export default function Customers() {
  const { customers, orders, user, t, settings, importCustomers } = useStore()
  const nav = useNavigate()
  const fileRef = useRef(null)
  const canEdit = can(user.role, 'manageCustomers', settings)
  // Exporting customers dumps their contacts/addresses — gate it on contact-visibility, not just exportCSV.
  const canExport = can(user.role, 'exportCSV', settings) && can(user.role, 'seeCustomerContact', settings)
  const onExport = () => downloadText(`ipp-customers-${new Date().toISOString().slice(0, 10)}.csv`, customersToCSV(customers))
  const onImportFile = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const merged = csvToCustomers(String(reader.result || ''), customers)
        const added = merged.length - customers.length
        importCustomers(merged)
        window.alert(`${t('Imported')} · ${merged.length} ${t('customers')}${added > 0 ? ` (+${added})` : ''}`)
      } catch { window.alert(t("Couldn't read that CSV file.")) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  return (
    <>
      <PageHead title={t('Customers')} sub={`${customers.length} · Horeca`}>
        {canExport && <button className="btn btn-secondary btn-sm" onClick={onExport}><Download size={14} /> {t('Export')}</button>}
        {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} /> {t('Import')}</button>}
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => nav('/customers/new')}><Plus size={16} /> {t('New customer')}</button>}
      </PageHead>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onImportFile} />
      <div className="page">

      {customers.map((c) => {
        const cnt = orders.filter((o) => o.customerId === c.id).length
        return (
          <div key={c.id} className="rowcard" style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => nav('/customers/' + c.id)}>
            <Avatar name={c.name} />
            <div className="grow">
              <div className="name">{c.name}</div>
              <div className="meta">{[c.area, c.contact].filter(Boolean).join(' · ') || t('No contact details yet')}</div>
              <div className="flex gap" style={{ marginTop: 7, flexWrap: 'wrap' }}>
                <span className="chip chip-info" style={{ textTransform: 'capitalize' }}>{c.payment.timing === 'cod' ? 'COD' : c.payment.timing} · {c.payment.method}</span>
                {c.sales ? <span className="chip">Sales: {c.sales}</span> : null}
                <span className="chip">{cnt} order{cnt !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        )
      })}

      <div className="muted tiny mt" style={{ textAlign: 'center' }}>
        {t('The customer master — payment terms & credit limit here drive each order’s Finance gate. Tap a customer to edit or see their orders.')}
      </div>
      </div>
    </>
  )
}
