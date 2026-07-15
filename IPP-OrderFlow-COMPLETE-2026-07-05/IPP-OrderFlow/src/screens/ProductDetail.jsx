import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { PageHead } from '../components/ui.jsx'
import { can } from '../lib/domain.js'
import { Trash2, Check } from 'lucide-react'

const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export default function ProductDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { products, orders, user, t, settings, addProduct, updateProduct, removeProduct } = useStore()
  const isNew = id === 'new'
  const existing = isNew ? null : products.find((p) => p.id === id)
  const canManage = can(user.role, 'manageProducts', settings)
  const [f, setF] = useState(existing || { name: '', accurateName: '', category: '', origin: '', grade: '', brand: '', form: '', pack: '', catchWeight: false, fixedPack: false, ppn: 'standard' })

  if (!isNew && !existing) return <div className="page"><div className="empty">{t('Product not found.')}</div></div>

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const usedBy = existing ? orders.filter((o) => (o.lines || []).some((l) => l.productId === existing.id)).length : 0

  const save = () => {
    if (!f.name.trim()) return
    if (isNew) {
      // Default the recognizer fields so a new SKU is matched/measured correctly by the intake parser.
      addProduct({ form: '', pack: '', fixedPack: false, catchWeight: false, ppn: 'standard', ...f, id: (slug(f.name) || 'product') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.trim(), accurateName: (f.accurateName || f.name).trim() })
    } else {
      updateProduct({ ...existing, ...f, name: f.name.trim(), accurateName: (f.accurateName || f.name).trim() })
    }
    nav('/products')
  }
  const del = () => {
    if (usedBy > 0) { window.alert(`${t('In use by')} ${usedBy} ${t('order(s)')} — ${t('cannot delete.')}`); return }
    if (!window.confirm(t('Delete this product?'))) return
    removeProduct(existing.id); nav('/products')
  }

  const field = (label, k, ph = '') => (
    <div className="field"><label>{t(label)}</label>
      <input className="input" value={f[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} disabled={!canManage} />
    </div>
  )

  return (
    <>
      <PageHead title={isNew ? t('New product') : f.name} sub={isNew ? '' : f.accurateName} back={() => nav('/products')} />
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="card card-pad mb">
          {field('Display name', 'name', 'Aus Wagyu Striploin 8-9')}
          {field('Accurate name (raw)', 'accurateName', 'WAGYU STRIPLOIN 8-9')}
          <div className="grid2">
            {field('Category', 'category')}
            {field('Origin', 'origin')}
          </div>
          <div className="grid2">
            {field('Grade', 'grade')}
            {field('Brand', 'brand')}
          </div>
          <label className="flex items gap mt" style={{ cursor: canManage ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={!!f.catchWeight} onChange={(e) => set('catchWeight', e.target.checked)} disabled={!canManage} />
            <span className="tiny">{t('Catch-weight (sold by actual weight)')}</span>
          </label>
          {/* Not an inventory system — just a warning flag so intake stops promising what the cold room
              doesn't have. The warehouse flips it when stock runs out / arrives. */}
          <label className="flex items gap mt" style={{ cursor: canManage ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={!!f.oos} onChange={(e) => set('oos', e.target.checked)} disabled={!canManage} />
            <span className="tiny" style={f.oos ? { color: 'var(--danger-text)', fontWeight: 600 } : undefined}>{t('Out of stock — warn when someone orders this')}</span>
          </label>
          {!isNew && <div className="tiny muted mt">{t('Used by')} {usedBy} {t('order(s)')}</div>}
        </div>
        {canManage ? (
          <div className="flex gap">
            <button className="btn btn-primary grow" onClick={save} disabled={!f.name.trim()}><Check size={16} /> {t('Save')}</button>
            {!isNew && <button className="btn btn-danger" onClick={del}><Trash2 size={15} /></button>}
          </div>
        ) : <div className="tiny muted">{t('Read-only — only an admin can edit products.')}</div>}
      </div>
    </>
  )
}
