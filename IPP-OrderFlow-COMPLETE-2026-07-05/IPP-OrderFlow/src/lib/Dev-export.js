// Role-aware data export. CSV (opens in Excel) respects what each role may see — the same
// rules as the screens: Warehouse/Production don't get customer contact, only Admin/Finance/
// Owner get prices. (Photos & PO PDFs are exported via the per-order Print → Save as PDF.)
import { STAGE_LABEL, PRICE_VISIBLE, orderValue, orderPriced, can } from './domain.js'

const esc = (v) => {
  let s = String(v ?? '')
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or a control char) is run
  // as a formula by Excel/Sheets. A customer name/note like "=cmd…" could execute on open. Prefix such
  // cells with a single quote so the spreadsheet shows them as plain text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function ordersToCSV(orders, role, settings) {
  const showCust = can(role, 'seeCustomerContact', settings)
  const showPrice = PRICE_VISIBLE(role, settings)
  const cols = ['Order #', 'Stage', 'Customer', 'Delivery date', 'Items']
  if (showCust) cols.push('Company', 'Sales', 'Contact', 'Address')
  if (showPrice) cols.push('Value (Rp)')
  cols.push('Note')

  const rows = orders.map((o) => {
    const items = (o.lines || []).filter((l) => !l.removed)
      .map((l) => `${l.qty} ${l.unit} ${l.name}`
        + (l.delivered ? ` [delivered ${l.delivered}/${l.qty}]` : '')
        + ((l.cuts || []).length ? ` (${l.cuts.map((c) => c.text).join('; ')})` : ''))
      .join(' | ')
    const r = [o.no, STAGE_LABEL[o.stage] || o.stage, o.customerName, (o.deliver || '').slice(0, 10), items]
    if (showCust) r.push(o.company || '', o.sales || '', o.contact || '', o.address || '')
    if (showPrice) r.push(orderPriced(o) ? orderValue(o) : '')
    r.push(o.note || '')
    return r
  })

  return [cols, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  // Prepend a BOM so Excel reads UTF-8 (Indonesian names, Rp) correctly.
  const blob = new Blob(['﻿' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
