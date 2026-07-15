import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { PageHead } from '../components/ui.jsx'
import { can } from '../lib/domain.js'
import { productsToCSV, csvToProducts, downloadText } from '../lib/csv.js'
import { Plus, Search, Download, Upload } from 'lucide-react'

export default function Products() {
  const { products, user, t, settings, importProducts, updateProduct } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const fileRef = useRef(null)
  const canManage = can(user.role, 'manageProducts', settings)
  const canExport = can(user.role, 'exportCSV', settings)
  // Stock flag is the WAREHOUSE's knowledge — they flip it from this list without needing full
  // product-edit rights (which stay Admin-only). It only warns at intake; it's not inventory.
  const canFlagStock = ['Warehouse', 'Admin', 'Owner'].includes(user.role)

  const ql = q.trim().toLowerCase()
  const filtered = ql ? products.filter((p) => (p.name + ' ' + (p.accurateName || '') + ' ' + (p.category || '')).toLowerCase().includes(ql)) : products

  const onExport = () => downloadText(`ipp-products-${new Date().toISOString().slice(0, 10)}.csv`, productsToCSV(products))
  const onImportFile = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const merged = csvToProducts(String(reader.result || ''), products)
        const added = merged.length - products.length
        importProducts(merged)
        window.alert(`${t('Imported')} · ${merged.length} ${t('products')}${added > 0 ? ` (+${added})` : ''}`)
      } catch { window.alert(t("Couldn't read that CSV file.")) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <>
      <PageHead title={t('Products')} sub={`${products.length}`}>
        {canExport && <button className="btn btn-secondary btn-sm" onClick={onExport}><Download size={14} /> {t('Export')}</button>}
        {canManage && <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} /> {t('Import')}</button>}
        {canManage && <button className="btn btn-primary btn-sm" onClick={() => nav('/products/new')}><Plus size={16} /> {t('New product')}</button>}
      </PageHead>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onImportFile} />
      <div className="page">
        <div className="grow mb" style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 36, width: '100%' }} placeholder={t('Search products…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tiny muted mb">{filtered.length} {t('of')} {products.length}</div>
        {filtered.slice(0, 400).map((p) => (
          <div key={p.id} className="rowcard" style={{ cursor: 'pointer' }} onClick={() => nav('/products/' + p.id)}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="name">{p.name}</div>
              <div className="meta">{[p.category, p.accurateName].filter(Boolean).join(' · ')}</div>
            </div>
            {p.catchWeight ? <span className="chip chip-info" style={{ flexShrink: 0 }}>{t('catch-weight')}</span> : null}
            {(p.oos || canFlagStock) ? (
              <span className={'chip' + (p.oos ? ' chip-danger' : '')} style={{ flexShrink: 0, cursor: canFlagStock ? 'pointer' : 'default', ...(p.oos ? {} : { color: 'var(--text-3)' }) }}
                title={canFlagStock ? t('Tap to toggle the out-of-stock warning') : undefined}
                onClick={(e) => { if (!canFlagStock) return; e.stopPropagation(); updateProduct({ ...p, oos: !p.oos }) }}>
                {p.oos ? t('OUT OF STOCK') : t('in stock')}
              </span>
            ) : null}
          </div>
        ))}
        {filtered.length > 400 && <div className="tiny muted mt" style={{ textAlign: 'center' }}>{t('Showing first 400 — refine your search.')}</div>}
        <div className="muted tiny mt" style={{ textAlign: 'center' }}>{t('The product master — the intake recognizer matches pasted orders to these SKUs.')}</div>
      </div>
    </>
  )
}
