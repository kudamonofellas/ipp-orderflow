import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { recognizeItem } from '../lib/recognize.js'
import { PageHead } from '../components/ui.jsx'
import ProductPicker from '../components/ProductPicker.jsx'
import { can, ACTOR, UNITS, hasLeftWarehouse, lineFrozen, isWeighed } from '../lib/domain.js'
import { Plus, Sparkles, Check, CircleX, Scissors } from 'lucide-react'

export default function OrderEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const { orders, products, saveOrder, user, settings, t } = useStore()
  const order = orders.find((o) => o.id === id)
  const [lines, setLines] = useState(order ? order.lines.map((l) => ({ ...l, cuts: (l.cuts || []).map((c) => ({ ...c })) })) : [])
  const [adding, setAdding] = useState(false)
  const [raw, setRaw] = useState('')
  const [match, setMatch] = useState(null)
  const [no, setNo] = useState(order?.no || '')

  if (!order) return <div className="page"><div className="empty">Order not found.</div></div>

  // Re-check edit permission here too (route guard only checks the base capability) so a locked order
  // can't be edited via a direct URL by someone without the editAfterLock override. The ORDER stays
  // editable until it leaves the warehouse; CUT lines freeze individually (lineFrozen, below).
  const editLocked = hasLeftWarehouse(order) || ['outstanding', 'cancelled', 'returned'].includes(order.stage)
  const mayEdit = can(user.role, 'editOrders', settings) && (!editLocked || can(user.role, 'editAfterLock', settings))
  if (!mayEdit) return <div className="page"><div className="empty">{t("You can’t edit this order.")}</div></div>

  const patchLine = (lid, patch) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, ...patch } : l)))
  const remove = (lid) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, removed: !l.removed } : l)))
  const setCut = (lid, j, text) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, cuts: l.cuts.map((c, cj) => (cj === j ? { ...c, text } : c)) } : l)))
  const addCut = (lid) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, cuts: [...(l.cuts || []), { id: 'c' + Date.now() + '-' + (l.cuts?.length || 0), text: '', done: false }] } : l)))
  const removeCut = (lid, j) => setLines((ls) => ls.map((l) => (l.id === lid ? { ...l, cuts: l.cuts.filter((_, cj) => cj !== j) } : l)))
  const qtyNum = (s) => parseFloat(String(s).replace(',', '.')) || 0  // coerce + comma-decimals
  const badQty = lines.some((l) => !l.removed && qtyNum(l.qty) <= 0)

  const addIt = () => {
    if (!match) return
    setLines([...lines, { id: 'l' + Date.now(), productId: match.product?.id || null, name: match.product?.name || match.raw, qty: match.qty, unit: match.unit, cuts: match.instruction ? [{ id: 'c' + Date.now(), text: match.instruction, done: false }] : [], weight: null, status: match.status, price: null, isNew: true }])
    setAdding(false); setMatch(null); setRaw('')
  }
  // Descriptive diff so the history says WHAT changed (qty/price/added/removed) — a real edit trail.
  const editNote = () => {
    const parts = []
    lines.filter((l) => l.removed && !l.isNew).forEach((l) => parts.push(`removed ${l.name}`))
    lines.filter((l) => l.isNew && !l.removed).forEach((l) => parts.push(`added ${qtyNum(l.qty)} ${l.unit} ${l.name}`))
    lines.filter((l) => !l.removed && !l.isNew).forEach((l) => {
      const o = order.lines.find((x) => x.id === l.id); if (!o) return
      if (qtyNum(l.qty) !== Number(o.qty)) parts.push(`${l.name} qty ${o.qty}→${qtyNum(l.qty)}`)
      if ((l.unit || '') !== (o.unit || '')) parts.push(`${l.name} unit ${o.unit}→${l.unit}`)
      const np = l.price ? (Number(String(l.price).replace(/[^\d]/g, '')) || null) : null
      if ((o.price || 0) !== (np || 0)) parts.push(`${l.name} price ${o.price || '—'}→${np || '—'}`)
      // Cutting / processing instructions — compare the saved (non-empty) text so add/remove/edit all show.
      const oldCuts = (o.cuts || []).map((c) => (c.text || '').trim()).filter(Boolean)
      const newCuts = (l.cuts || []).map((c) => (c.text || '').trim()).filter(Boolean)
      if (oldCuts.join(' | ') !== newCuts.join(' | ')) parts.push(`${l.name} cutting ${oldCuts.join(', ') || '—'}→${newCuts.join(', ') || '—'}`)
    })
    if (no.trim() && no.trim() !== order.no) parts.push(`no. ${order.no}→${no.trim()}`)
    return parts.length ? `Edited — ${parts.join('; ')}` : 'Order edited (no change)'
  }
  const save = () => {
    if (badQty || !mayEdit) return
    // An order needs at least one item — removing every line and saving would send an empty order
    // through the whole pipeline (nothing to weigh, deliver, or invoice). Cancel it instead.
    if (!lines.some((l) => !l.removed)) { window.alert(t('The order has no items left — cancel the order instead of emptying it.')); return }
    saveOrder({
      ...order,
      no: no.trim() || order.no,
      lines: lines.filter((l) => !l.removed).flatMap(({ isNew, removed, ...l }, idx) => {
        const orig = order.lines.find((x) => x.id === l.id)
        const newQty = qtyNum(l.qty)
        const base = {
          ...l,
          qty: newQty,
          price: l.price ? (Number(String(l.price).replace(/[^\d]/g, '')) || null) : null,
          cuts: (l.cuts || []).filter((c) => (c.text || '').trim()).map((c) => ({ id: c.id, text: c.text.trim(), done: !!c.done })),
        }
        const wasWeighed = orig && (Number(orig.weight) > 0 || (orig.weighings || []).length)
        // INCREASE of an already-weighed item: don't dismantle the original — keep it (its weight + photos)
        // at its old qty and add the EXTRA as a SEPARATE same-product line to weigh + photograph on its own.
        if (isWeighed(l.unit) && orig && wasWeighed && (l.unit || '') === (orig.unit || '') && newQty > Number(orig.qty)) {
          const keep = { ...base, qty: Number(orig.qty) }   // original line untouched (weight/weighings/photos come from ...l)
          const extra = {
            id: 'l' + Date.now().toString(36) + '-' + idx, productId: orig.productId || null, name: orig.name, unit: orig.unit,
            qty: newQty - Number(orig.qty), price: keep.price, isExtra: true,
            cuts: (orig.cuts || []).map((c, ci) => ({ id: 'c' + Date.now().toString(36) + '-' + idx + '-' + ci, text: c.text, done: false })),
            weight: null, weighings: [], weighPhoto: null, photos: [],
          }
          return [keep, extra]
        }
        // DECREASE / unit change of a weighed line (dismantle + re-prep), or a new weighed line: re-weigh
        // the whole line — clear the weight so the order-detail "needs weighing" banner sends it to Cold.
        if (isWeighed(l.unit) && (isNew || (orig && (newQty !== Number(orig.qty) || (l.unit || '') !== (orig.unit || ''))))) {
          return [{ ...base, weight: null, weighings: [], weighPhoto: null, photos: [] }]
        }
        return [base]
      }),
      history: [...order.history, { at: new Date().toISOString(), who: user.name, role: user.role, what: editNote() }],
    })
    nav('/orders/' + order.id)
  }

  return (
    <>
      <PageHead title={t('Edit order')} sub={`#${order.no}`} back={() => nav('/orders/' + order.id)} />
      <div className="page" style={{ maxWidth: 760 }}>
      <div className="card card-pad mb tiny muted">{t('Change quantities, add or remove items, and edit the cuttings under each loaf. Allowed until production starts cutting.')}</div>

      <div className="card card-pad mb">
        <div className="field" style={{ margin: 0, maxWidth: 240 }}><label>{t('Order no.')}</label><input className="input" value={no} onChange={(e) => setNo(e.target.value)} /></div>
        {no.trim() && no.trim() !== order.no && orders.some((o) => o.id !== order.id && o.no && o.no.trim() === no.trim()) &&
          <div className="tiny" style={{ marginTop: 8, color: 'var(--warning-text)' }}>⚠ {t('Another order already uses')} #{no.trim()}.</div>}
      </div>

      <div className="sec-label">{t('Items')} · {lines.filter((l) => !l.removed).length}</div>
      <datalist id="ipp-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      {lines.map((l) => {
        // A line being cut is locked — the meat is already committed to spec. Other lines stay editable.
        // A freshly-added line (isNew) is never frozen, even while the order is being cut.
        const frozen = !l.isNew && lineFrozen(l, order)
        return (
        <div key={l.id} className="card card-pad mb" style={l.removed ? { opacity: 0.45 } : (frozen ? { borderColor: 'var(--info)' } : null)}>
          <div className="flex items gap mb">
            {frozen
              ? <span className="tnum" style={{ width: 52, textAlign: 'center', fontWeight: 600 }}>{l.qty}</span>
              : <input className="input" style={{ width: 52, textAlign: 'center', padding: '0 4px' }} value={l.qty} onChange={(e) => patchLine(l.id, { qty: e.target.value })} />}
            {frozen
              ? <span className="tiny muted" style={{ width: 78 }}>{l.unit}</span>
              : <input className="input" list="ipp-units" style={{ width: 78, padding: '0 7px' }} value={l.unit} onChange={(e) => patchLine(l.id, { unit: e.target.value })} placeholder="unit" />}
            <span className="grow name" style={l.removed ? { textDecoration: 'line-through' } : null}>{l.name}</span>
            {l.isNew && <span className="chip chip-info">{t('New')}</span>}
            {frozen
              ? <span className="tiny" style={{ color: 'var(--info)', whiteSpace: 'nowrap', flexShrink: 0 }}><Scissors size={12} style={{ verticalAlign: '-1px' }} /> {t('being cut')}</span>
              : <CircleX size={18} style={{ color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }} onClick={() => remove(l.id)} />}
          </div>
          {(l.cuts || []).map((c, j) => (
            <div key={c.id || j} className="flex items gap mt">
              <Scissors size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
              {frozen
                ? <span className="grow tiny">{c.text}{c.done ? ' ✓' : ''}</span>
                : <input className="input grow" value={c.text} onChange={(e) => setCut(l.id, j, e.target.value)} placeholder={t('cutting / processing (e.g. yakiniku pack per 200g)')} />}
              {!frozen && <CircleX size={16} style={{ color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }} onClick={() => removeCut(l.id, j)} />}
            </div>
          ))}
          {!l.removed && !frozen && <button className="btn btn-ghost btn-sm mt" style={{ justifyContent: 'flex-start' }} onClick={() => addCut(l.id)}><Plus size={14} /> {t('Add cutting')}</button>}
          {frozen
            ? <div className="tiny muted mt">{t('Being cut — locked. Send the order back to Production to change this item.')}</div>
            : <input className="input mt" style={{ fontSize: 13 }} value={l.price || ''} onChange={(e) => patchLine(l.id, { price: e.target.value })} placeholder={t('Unit price from PO — Rp (optional)')} inputMode="numeric" />}
        </div>
        )
      })}

      {!adding ? (
        <button className="btn btn-secondary btn-block mt mb" onClick={() => setAdding(true)}><Plus size={15} /> {t('Add item')}</button>
      ) : (
        <div className="card card-pad mt mb">
          <label className="label" style={{ marginBottom: 6, display: 'block' }}>{t('Type the item — it matches your catalog')}</label>
          <input className="input" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={t('e.g. 1 loaf wagyu striploin 8-9')} />
          <button className="btn btn-primary btn-block mt" onClick={() => setMatch(recognizeItem(raw, products))} disabled={!raw.trim()}><Sparkles size={15} /> {t('Match')}</button>
          {match && (
            <div className="mt" style={{ paddingTop: 11, borderTop: '0.5px solid var(--border)' }}>
              {/* the match is a STARTING POINT — fix the qty, unit or product before adding */}
              <div className="flex items gap" style={{ marginBottom: 8 }}>
                <input className="input" style={{ width: 52, textAlign: 'center', padding: '0 4px' }} value={match.qty} onChange={(e) => setMatch({ ...match, qty: e.target.value })} />
                <input className="input" list="ipp-units" style={{ width: 78, padding: '0 7px' }} value={match.unit} onChange={(e) => setMatch({ ...match, unit: e.target.value })} placeholder="unit" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ProductPicker value={match.product?.id || ''} products={products} typed={match.raw}
                    onPick={(pid) => { const p = products.find((x) => x.id === pid); setMatch({ ...match, product: p || null, status: p ? 'recognized' : 'unrecognized' }) }} />
                </div>
              </div>
              <div className="flex gap mt">
                <button className="btn btn-success grow" onClick={addIt}>{t('Add to order')}</button>
                <button className="btn btn-secondary" onClick={() => { setAdding(false); setMatch(null) }}>{t('Cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {badQty && <div className="tiny mb" style={{ color: 'var(--warning-text)' }}>{t('Every item needs a quantity above 0.')}</div>}
      <button className="btn btn-primary btn-block" disabled={badQty} onClick={save}><Check size={16} /> {t('Save changes')}</button>
      </div>
    </>
  )
}
