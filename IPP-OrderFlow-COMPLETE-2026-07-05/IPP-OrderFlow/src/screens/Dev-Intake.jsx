import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { parseOrder, recognizeItem, learnCorrection, matchCustomer } from '../lib/recognize.js'
import { orderNo, dateCode, titleCase } from '../lib/format.js'
import { PageHead, DbImage } from '../components/ui.jsx'
import { processPhoto } from '../lib/img.js'
import { savePhoto, deletePhoto } from '../lib/photos.js'
import { orderPhotoIds, UNITS } from '../lib/domain.js'
import ProductPicker from '../components/ProductPicker.jsx'
import { Check, Plus, CircleX, AlertTriangle, Scissors, UserPlus, Paperclip, FileText } from 'lucide-react'

export default function Intake() {
  const { products, customers, createOrder, deleteOrder, addCustomer, updateCustomer, user, orders, t } = useStore()
  const nav = useNavigate()
  const [raw, setRaw] = useState('')
  const [form, setForm] = useState(null)
  const [addRaw, setAddRaw] = useState('')
  const [po, setPo] = useState(null)  // attached PO file (image downscaled / pdf)

  const onPO = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return
    const isImg = f.type.startsWith('image/')
    // Images → full-res JPEG; PDFs pass through unchanged. Both stored in IndexedDB (no size cap).
    processPhoto(f).then(savePhoto).then((id) => setPo({ name: f.name, type: isImg ? 'image' : 'pdf', photoId: id })).catch(() => {})
    e.target.value = ''
  }
  const prodOptions = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])

  // next free queue number for a date, e.g. 260623-22 if -21 is taken
  const nextFreeFor = (iso) => {
    const dc = dateCode(iso)
    const used = new Set(orders.filter((o) => o.no && o.no.startsWith(dc + '-')).map((o) => parseInt(o.no.split('-')[1]) || 0))
    let n = 1; while (used.has(n)) n++   // lowest free number (fills gaps), e.g. 2 when 1 & 21 exist
    return `${dc}-${String(n).padStart(2, '0')}`
  }

  const run = () => {
    const d = parseOrder(raw, { products, customers })
    setForm({
      custName: d.customerTyped || d.customer?.name || '',
      company: d.company || d.customer?.company || '',
      deliver: d.deliver.slice(0, 10),
      method: d.paymentMethod || d.customer?.payment.method || 'transfer',
      timing: d.customer?.payment.timing || 'upfront',
      sales: d.sales || '',
      no: d.ref ? orderNo(d.deliver, d.ref) : nextFreeFor(d.deliver),
      replaceId: null,
      address: d.address || (d.customerMatch === 'exact' || d.customerMatch === 'phone' ? d.customer?.address : '') || '',
      phone: d.phone || (d.customerMatch === 'exact' || d.customerMatch === 'phone' ? d.customer?.contact : '') || '',
      note: '',
      mergeSel: {},
      dateGuessed: !!d.dateGuessed,
      multiCustomer: !!d.multiCustomer,
      lines: d.lines.length
        ? d.lines.map((li, i) => ({ _k: 'ln' + i, qty: li.qty, unit: li.unit, productId: li.product?.id || '', cuts: li.cuts || [], status: li.status, raw: li.raw, learned: li.learned, qtyRange: li.qtyRange || null, weightNote: li.weightNote || null, price: li.price ? String(li.price) : '' }))
        : [{ _k: 'ln0', qty: 1, unit: '', productId: '', cuts: [], status: 'unrecognized', raw: '' }],
    })
  }

  const setCust = (name) => setForm((f) => {
    const c = customers.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
    return { ...f, custName: name, ...(c ? { method: c.payment.method, timing: c.payment.timing, sales: f.sales || c.sales, address: f.address || c.address, phone: f.phone || c.contact, company: f.company || c.company || '' } : {}) }
  })
  const setLine = (i, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const removeLine = (i) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  const setCut = (i, j, text) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, cuts: l.cuts.map((c, cj) => (cj === j ? text : c)) } : l)) }))
  const addCut = (i) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, cuts: [...(l.cuts || []), ''] } : l)) }))
  const removeCut = (i, j) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, cuts: l.cuts.filter((_, cj) => cj !== j) } : l)) }))
  const addItem = () => {
    if (!addRaw.trim()) return
    const m = recognizeItem(addRaw, products)
    setForm((f) => ({ ...f, lines: [...f.lines, { _k: 'lnA' + Date.now(), qty: m.qty, unit: m.unit, productId: m.product?.id || '', cuts: m.instruction ? [m.instruction] : [], status: m.status, raw: m.raw, learned: m.learned, qtyRange: m.qtyRange || null, weightNote: m.weightNote || null, price: m.price ? String(m.price) : '' }] }))
    setAddRaw('')
  }

  // Synchronous re-entrancy guard: a fast double-tap on "Confirm order" used to run confirm() twice
  // before React re-rendered → TWO identical orders with the SAME order number. A ref blocks the
  // second call instantly (state would be too slow — it updates async).
  const submitting = useRef(false)
  const confirm = () => {
    if (submitting.current) return
    submitting.current = true
    const cmc = matchCustomer(form.custName, form.phone, customers)
    let custId, custName
    if (cmc.customer) {
      custId = cmc.customer.id; custName = cmc.customer.name
      const upd = { id: custId }  // merge the fields the admin left checked (keeps the most info)
      if (form.phone && form.phone.trim() && form.phone.trim() !== (cmc.customer.contact || '').trim() && form.mergeSel?.contact !== false) upd.contact = form.phone.trim()
      if (form.address && form.address.trim() && !((cmc.customer.address || '').trim()) && form.mergeSel?.address !== false) upd.address = form.address.trim()
      if (form.company && form.company.trim() && form.company.trim() !== (cmc.customer.company || '').trim()) upd.company = titleCase(form.company)
      if (Object.keys(upd).length > 1) updateCustomer(upd)
    } else {  // brand-new customer → save to the list (name + company Title-Cased)
      custId = 'c' + Date.now()
      custName = titleCase(form.custName) || 'Customer'
      addCustomer({ id: custId, name: custName, company: titleCase(form.company), channel: 'horeca', payment: { timing: form.timing || 'upfront', method: form.method || 'transfer' }, contact: form.phone || '', address: form.address || '', area: '', sales: form.sales || '' })
    }
    const companyTC = titleCase(form.company)
    // learn from every confirmed line: "this shorthand → this product" (no-AI training)
    form.lines.forEach((l) => { if (l.raw && l.productId) learnCorrection(l.raw, l.productId) })
    const created = new Date()
    let lid = 0
    const order = {
      id: 'o' + Date.now(), no: String(form.no).trim(), ref: (String(form.no).split('-')[1] || null),
      customerId: custId, customerName: custName, company: companyTC, channel: 'horeca',
      createdAt: created.toISOString(), deliver: new Date(form.deliver + 'T09:00:00').toISOString(),
      sales: form.sales || '',
      payment: { method: form.method, timing: form.timing, confirmed: false },
      contact: form.phone || '', address: form.address || '', note: form.note || '', po: po ? { name: po.name, type: po.type, photoId: po.photoId } : null, stage: 'intake',
      lines: form.lines.filter((l) => l.productId || l.raw).map((l) => {
        const p = products.find((x) => x.id === l.productId)
        return { id: 'l' + Date.now() + ++lid, productId: l.productId || null, name: p ? p.name : (l.raw || 'Item'), qty: parseFloat(String(l.qty).replace(',', '.')) || 0, unit: l.unit || 'pcs', weight: null, status: l.productId ? 'recognized' : 'unrecognized', weightNote: l.weightNote || null, price: l.price ? (Number(String(l.price).replace(/[^\d]/g, '')) || null) : null, cuts: (l.cuts || []).map((t, ci) => ({ id: 'c' + Date.now() + lid + '-' + ci, text: String(t).trim(), done: false })).filter((c) => c.text) }
      }),
      history: [{ at: created.toISOString(), who: user.name, role: user.role, what: 'Order created' }],
    }
    if (form.replaceId) { const old = orders.find((o) => o.id === form.replaceId); if (old) orderPhotoIds(old).forEach((id) => deletePhoto(id)); deleteOrder(form.replaceId) }
    createOrder(order)
    nav('/orders/' + order.id)
  }

  if (!form) return (
    <>
      <PageHead title={t('Paste the order')} back={() => nav('/new')} />
      <div className="page" style={{ maxWidth: 760 }}>
      <textarea className="textarea mono mb" value={raw} onChange={(e) => setRaw(e.target.value)}
        placeholder={t('Paste the order here…')} />
      {po && <div className="card card-pad mb flex items gap">
        {po.type === 'image' ? <DbImage id={po.photoId} style={{ height: 46, borderRadius: 6 }} /> : <FileText size={22} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
        <span className="grow tiny" style={{ wordBreak: 'break-all' }}>{po.name}</span>
        <CircleX size={18} style={{ cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }} onClick={() => setPo(null)} />
      </div>}
      <label className="btn btn-secondary btn-block mb" style={{ cursor: 'pointer' }}>
        <Paperclip size={15} /> {po ? t('Replace PO') : t('Attach PO (PDF or photo)')}
        <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={onPO} />
      </label>
      <button className="btn btn-primary btn-block" disabled={!raw.trim() && !po} onClick={run}>{t('Next')} →</button>
      </div>
    </>
  )

  const sc = (s) => (s === 'recognized' ? 'chip-success' : s === 'probable' ? 'chip-warning' : 'chip-danger')
  const cm = matchCustomer(form.custName, form.phone, customers)
  const dbc = cm.customer
  const existing = cm.type === 'exact' || cm.type === 'phone'
  const isNew = cm.type === 'new'
  const mergeItems = []
  if (existing) {
    if (form.phone && form.phone.trim() && form.phone.trim() !== (dbc.contact || '').trim()) mergeItems.push({ key: 'contact', label: 'Phone', from: dbc.contact || '—', to: form.phone.trim() })
    if (form.address && form.address.trim() && !((dbc.address || '').trim())) mergeItems.push({ key: 'address', label: 'Address', from: '—', to: form.address.trim() })
  }
  const addrDiffers = existing && (dbc.address || '').trim() && form.address && form.address.trim() && form.address.trim() !== (dbc.address || '').trim()
  const useExisting = (c) => setForm((f) => ({ ...f, custName: c.name, phone: f.phone || c.contact || '', address: f.address || c.address || '', sales: f.sales || c.sales || '', method: c.payment?.method || f.method, timing: c.payment?.timing || f.timing }))
  const today0 = new Date(); today0.setHours(0, 0, 0, 0)
  const deliverPast = form.deliver && new Date(form.deliver) < today0
  const noStr = String(form.no || '').trim()
  const dcOf = noStr.split('-')[0] || ''
  const enteredNN = parseInt(noStr.split('-')[1]) || 0
  const usedNNs = new Set(orders.filter((o) => o.no && o.no.startsWith(dcOf + '-')).map((o) => parseInt(o.no.split('-')[1]) || 0))
  let lowestFree = 1; while (usedNNs.has(lowestFree)) lowestFree++   // first open slot (fills gaps)
  const expectedNo = `${dcOf}-${String(lowestFree).padStart(2, '0')}`
  const dupOrder = orders.find((o) => o.no && o.no.trim() === noStr)
  const seqGap = !dupOrder && dcOf && enteredNN > 0 && enteredNN !== lowestFree  // not the first open slot — maybe a typo
  const badNo = noStr !== '' && !/^\d{6}-\d{1,3}$/.test(noStr)  // must be YYMMDD-NN
  const badLine = (form.lines || []).some((l) => !(parseFloat(String(l.qty).replace(',', '.')) > 0))
  const fmtD = form.deliver ? new Date(form.deliver).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

  return (
    <>
      <PageHead title={t('Confirm order')} back={() => setForm(null)} />
      <div className="page" style={{ maxWidth: 1130 }}>
      <div className="intake-cols">
      <div className="intake-form">

      {form.multiCustomer && <div className="card card-pad mb flex items gap" style={{ color: 'var(--warning-text)', background: 'var(--warning-bg)' }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }} /><span style={{ fontSize: 13 }}>{t('This looks like more than one customer\'s order — please enter them as separate orders.')}</span>
      </div>}

      <div className="card card-pad mb">
        <div className="grid2">
          {/* Row 1: Order no. (left) · Deliver (right) */}
          <div className="field" style={{ margin: 0 }}><label>{t('Order no.')}</label><input className="input" value={form.no || ''} onChange={(e) => setForm({ ...form, no: e.target.value, replaceId: null })} placeholder="—" /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('Deliver')}</label><input className="input" type="date" value={form.deliver} onChange={(e) => setForm({ ...form, deliver: e.target.value, dateGuessed: false })} />
            {form.dateGuessed && <div className="tiny" style={{ color: 'var(--warning-text)', marginTop: 4 }}>{t('Delivery date was guessed — please check.')}</div>}
          </div>
          {/* Row 2: Restaurant / outlet (left) · Sales (right) */}
          <div className="field" style={{ margin: 0 }}><label>{t('Restaurant / outlet')} {isNew && <span className="chip chip-info" style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px' }}>{t('new')}</span>}</label>
            <input className="input" list="custs" value={form.custName} onChange={(e) => setCust(e.target.value)} placeholder={t('Restaurant / outlet')} />
            <datalist id="custs">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div className="field" style={{ margin: 0 }}><label>{t('Sales')}</label><input className="input" value={form.sales || ''} onChange={(e) => setForm({ ...form, sales: e.target.value })} placeholder="Sales rep" /></div>
          {/* Row 3: Company name (left) · Phone (right) */}
          <div className="field" style={{ margin: 0 }}><label>{t('Company name')} <span className="muted" style={{ fontWeight: 400 }}>{t('(PT / CV — for the invoice)')}</span></label>
            <input className="input" value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder={t('e.g. PT En Prima Food & Beverages')} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('Phone')}</label><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone / WhatsApp" /></div>
        </div>
        <div className="field" style={{ margin: '10px 0 0' }}><label>{t('Delivery address')}</label><textarea className="textarea" style={{ minHeight: 50 }} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" /></div>
        <div className="field" style={{ margin: '10px 0 0' }}><label>{t('Note (optional)')}</label><textarea className="textarea" style={{ minHeight: 44 }} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Any note for this order…" /></div>

        {cm.type === 'fuzzy' && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13, flexWrap: 'wrap' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /><span>Did you mean <b>{dbc.name}</b>? Looks like the same customer.</span><span className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => useExisting(dbc)}>Use {dbc.name}</button>
        </div>}
        {isNew && form.custName.trim() && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--info-text)', background: 'var(--info-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <UserPlus size={15} style={{ flexShrink: 0 }} /><span>New customer — <b>{form.custName.trim()}</b> will be saved to your list.</span>
        </div>}
        {existing && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--success-text)', background: 'var(--success-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <Check size={15} style={{ flexShrink: 0 }} /><span>Existing customer{cm.type === 'phone' ? ` — matched by phone: ${dbc.name}` : ''}.</span>
        </div>}
        {existing && mergeItems.length > 0 && <div style={{ marginTop: 10, background: 'var(--warning-bg)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
          <div style={{ color: 'var(--warning-text)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Update {dbc.name}'s saved details?</div>
          {mergeItems.map((m) => (
            <label key={m.key} className="flex items gap" style={{ cursor: 'pointer', padding: '3px 0', fontSize: 12 }}>
              <input type="checkbox" checked={form.mergeSel?.[m.key] !== false} onChange={(e) => setForm({ ...form, mergeSel: { ...form.mergeSel, [m.key]: e.target.checked } })} />
              <span><b>{m.label}:</b> {m.from} → {m.to}</span>
            </label>
          ))}
        </div>}
        {addrDiffers && <div className="tiny muted" style={{ marginTop: 8 }}>Delivery address differs from {dbc.name}'s saved address — used for this order only.</div>}
        {deliverPast && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '8px 11px', borderRadius: 'var(--radius)', fontSize: 13 }}><AlertTriangle size={15} /> Delivery date {fmtD} is in the past — is this a typo?</div>}
        {dupOrder && !form.replaceId && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13, flexWrap: 'wrap' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /><span>Order #{form.no} already exists ({dupOrder.customerName}). Duplicate?</span><span className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, no: expectedNo })}>Use #{expectedNo}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, replaceId: dupOrder.id })}>Replace it</button>
        </div>}
        {form.replaceId && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--info-text)', background: 'var(--info-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13 }}><AlertTriangle size={15} style={{ flexShrink: 0 }} /><span>Will replace the existing #{form.no}.</span><span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, replaceId: null })}>Undo</button></div>}
        {seqGap && <div className="flex items gap" style={{ marginTop: 10, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '9px 11px', borderRadius: 'var(--radius)', fontSize: 13, flexWrap: 'wrap' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /><span>The next open queue number is #{expectedNo} — but you entered #{form.no}. Typo, or keep it?</span><span className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, no: expectedNo })}>Use #{expectedNo}</button>
        </div>}
      </div>

      {po && <div className="card card-pad mb flex items gap">
        {po.type === 'image' ? <DbImage id={po.photoId} style={{ height: 42, borderRadius: 6 }} /> : <FileText size={20} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
        <span className="grow tiny">{t('PO attached')} · {po.name}</span>
      </div>}

      <div className="sec-label">{t('Items')} · {form.lines.length}</div>
      <datalist id="ipp-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      {form.lines.map((l, i) => (
        <div key={l._k || i} className="card card-pad mb">
          <div className="flex items gap mb">
            <input className="input" style={{ width: 52, textAlign: 'center', padding: '0 4px' }} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
            <input className="input" list="ipp-units" style={{ width: 78, padding: '0 7px' }} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="unit" />
            <span className={'chip ' + sc(l.learned ? 'recognized' : l.status)}>{l.learned ? '✓ learned' : l.status}</span>
            {l.qtyRange && <span className="chip">range {l.qtyRange}</span>}
            {l.weightNote && <span className="chip" title={t('Expected weight')}>≈ {l.weightNote}</span>}
            <span className="spacer" />
            <CircleX size={18} style={{ color: 'var(--text-3)', cursor: 'pointer' }} onClick={() => removeLine(i)} />
          </div>
          <ProductPicker value={l.productId} products={prodOptions} typed={l.raw}
            onPick={(pid) => { setLine(i, { productId: pid, status: pid ? 'recognized' : 'unrecognized', learned: false }); if (pid && l.raw) learnCorrection(l.raw, pid) }} />
          {/* Stock warning (non-blocking) — the warehouse flagged this SKU out, so check before promising it. */}
          {(() => { const p = products.find((x) => x.id === l.productId); return p && p.oos ? (
            <div className="tiny mt" style={{ color: 'var(--danger-text)' }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {t('Flagged OUT OF STOCK by the warehouse — confirm availability before promising this item.')}</div>
          ) : null })()}
          {(l.cuts || []).map((c, j) => (
            <div key={j} className="flex items gap mt">
              <Scissors size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
              <input className="input grow" value={c} onChange={(e) => setCut(i, j, e.target.value)} placeholder="cutting / processing (e.g. yakiniku pack per 200g)" />
              <CircleX size={17} style={{ color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }} onClick={() => removeCut(i, j)} />
            </div>
          ))}
          <button className="btn btn-ghost btn-sm mt" style={{ justifyContent: 'flex-start' }} onClick={() => addCut(i)}><Plus size={14} /> {t('Add cutting')}</button>
          <input className="input mt" value={l.price || ''} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="Unit price from PO — Rp (optional)" inputMode="numeric" />
        </div>
      ))}

      <div className="card card-pad mb flex items gap">
        <input className="input" value={addRaw} onChange={(e) => setAddRaw(e.target.value)} placeholder="Add item — type it, matches your catalog…" onKeyDown={(e) => { if (e.key === 'Enter') addItem() }} />
        <button className="btn btn-secondary" onClick={addItem}><Plus size={15} /> Add</button>
      </div>

      {badNo && <div className="tiny mb" style={{ color: 'var(--warning-text)' }}>⚠ Order no. should look like 260625-21 (YYMMDD-NN).</div>}
      {badLine && <div className="tiny mb" style={{ color: 'var(--warning-text)' }}>⚠ Every item needs a quantity above 0.</div>}
      <div className="flex gap">
        <button className="btn btn-secondary" onClick={() => setForm(null)}>{t('Back')}</button>
        {/* !form.deliver: a cleared date crashed confirm() midway (Invalid Date → toISOString throws)
            AFTER the customer was already saved — creating a duplicate customer on every retry. */}
        <button className="btn btn-primary grow" disabled={!form.custName.trim() || form.lines.filter((l) => l.productId || l.raw).length === 0 || !form.deliver || (dupOrder && !form.replaceId) || badNo || badLine} onClick={confirm}><Check size={16} /> {t('Confirm order')}</button>
      </div>
      </div>{/* /intake-form */}

      {/* The original paste (+ any PO) kept beside the form for side-by-side checking. */}
      <aside className="intake-raw">
        <div className="sec-label" style={{ marginTop: 0 }}>{t('What you pasted')}</div>
        {raw.trim()
          ? <pre className="raw-paste">{raw}</pre>
          : <div className="tiny muted">{t('No pasted text — PO attached only.')}</div>}
        {po && (po.type === 'image'
          ? <DbImage id={po.photoId} open style={{ width: '100%', borderRadius: 8, marginTop: 10, border: '1px solid var(--border)' }} />
          : <div className="card card-pad mt flex items gap"><FileText size={18} style={{ color: 'var(--text-2)', flexShrink: 0 }} /><span className="grow tiny" style={{ wordBreak: 'break-all' }}>{po.name}</span></div>)}
      </aside>
      </div>{/* /intake-cols */}
      </div>
    </>
  )
}
