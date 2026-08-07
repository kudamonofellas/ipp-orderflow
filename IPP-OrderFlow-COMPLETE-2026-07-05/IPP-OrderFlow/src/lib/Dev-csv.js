// CSV import/export for the Customer + Product master databases. Export opens cleanly in Excel;
// import is an UPSERT by id (existing rows are updated, new rows added — nothing is silently deleted).
import { downloadText } from './export.js'

const esc = (v) => {
  let s = String(v ?? '')
  // Neutralize spreadsheet formula injection (a cell starting with = + - @ runs as a formula in Excel).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function objectsToCSV(items, columns) {
  const header = columns.map((c) => esc(c.label || c.key)).join(',')
  const rows = items.map((it) => columns.map((c) => esc(c.get ? c.get(it) : it[c.key])).join(','))
  return [header, ...rows].join('\r\n')
}

// Tolerant CSV parser: quoted fields, doubled quotes ("") inside, commas/newlines in quotes, LF or CRLF.
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  const s = String(text || '').replace(/^﻿/, '')   // strip a leading BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* swallow — \r\n handled by the \n branch */ }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function csvToObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => (c || '').trim() !== ''))   // drop blank lines
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => (h || '').trim())
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, ((r[i] ?? '') + '').trim()])))
}

let _seq = 0
// A monotonic counter makes ids unique WITHIN one bulk import (Date.now alone collides for rows parsed
// in the same millisecond, which would silently merge/drop rows).
const rid = (prefix) => prefix + Date.now().toString(36) + (_seq++).toString(36) + Math.random().toString(36).slice(2, 5)
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const norm = (s) => (s || '').trim().toLowerCase()

// ---- Customers ----
const CUST_COLS = [
  { key: 'id', label: 'id' }, { key: 'name', label: 'name' }, { key: 'company', label: 'company' },
  { key: 'area', label: 'area' }, { key: 'contact', label: 'contact' }, { key: 'address', label: 'address' },
  { key: 'sales', label: 'sales' },
  { label: 'payment_timing', get: (c) => (c.payment || {}).timing || '' },
  { label: 'payment_method', get: (c) => (c.payment || {}).method || '' },
  { label: 'termDays', get: (c) => c.termDays ?? '' },
  { label: 'creditLimit', get: (c) => c.creditLimit ?? '' },
]
export const customersToCSV = (customers) => objectsToCSV(customers, CUST_COLS)
export function csvToCustomers(text, existing = []) {
  const byId = new Map(existing.map((c) => [c.id, c]))
  // For id-less rows (hand-authored CSV), match an existing customer by name+company so a re-import
  // UPDATES instead of duplicating.
  const byKey = new Map(existing.map((c) => [norm(c.name) + '|' + norm(c.company), c.id]))
  csvToObjects(text).forEach((r) => {
    const id = r.id || byKey.get(norm(r.name) + '|' + norm(r.company)) || rid('c')
    const prev = byId.get(id) || {}
    byId.set(id, {
      ...prev, id,
      name: r.name || prev.name || '', company: r.company ?? prev.company ?? '', area: r.area ?? prev.area ?? '',
      contact: r.contact ?? prev.contact ?? '', address: r.address ?? prev.address ?? '', sales: r.sales ?? prev.sales ?? '',
      payment: { timing: r.payment_timing || (prev.payment || {}).timing || 'upfront', method: r.payment_method || (prev.payment || {}).method || 'transfer' },
      termDays: r.termDays !== undefined && r.termDays !== '' ? Math.max(0, Number(r.termDays) || 0) : (prev.termDays || 0),
      creditLimit: r.creditLimit !== undefined && r.creditLimit !== '' ? Math.max(0, Number(r.creditLimit) || 0) : (prev.creditLimit || 0),
    })
  })
  return [...byId.values()]
}

// ---- Products ----
const PROD_COLS = [
  { key: 'id', label: 'id' }, { key: 'name', label: 'name' }, { key: 'accurateName', label: 'accurateName' },
  { key: 'category', label: 'category' }, { key: 'origin', label: 'origin' }, { key: 'grade', label: 'grade' },
  { key: 'brand', label: 'brand' }, { key: 'form', label: 'form' }, { key: 'pack', label: 'pack' },
  { label: 'catchWeight', get: (p) => (p.catchWeight ? 'Y' : 'N') },
  { label: 'fixedPack', get: (p) => (p.fixedPack ? 'Y' : 'N') },
  { key: 'ppn', label: 'ppn' },
]
export const productsToCSV = (products) => objectsToCSV(products, PROD_COLS)
export function csvToProducts(text, existing = []) {
  const byId = new Map(existing.map((p) => [p.id, p]))
  // id-less rows match an existing product by accurateName so a re-import updates instead of duplicating.
  const byKey = new Map(existing.map((p) => [norm(p.accurateName || p.name), p.id]))
  csvToObjects(text).forEach((r) => {
    const id = r.id || byKey.get(norm(r.accurateName || r.name)) || (slug(r.name || r.accurateName) || 'product') + '-' + rid('')
    const prev = byId.get(id) || {}
    const yn = (v, fallback) => (v !== undefined && v !== '') ? /^(y|yes|true|1)/i.test(v) : !!fallback
    byId.set(id, {
      ...prev, id,
      name: r.name || prev.name || r.accurateName || '',
      accurateName: r.accurateName || prev.accurateName || r.name || '',
      category: r.category ?? prev.category ?? '', origin: r.origin ?? prev.origin ?? '',
      grade: r.grade ?? prev.grade ?? '', brand: r.brand ?? prev.brand ?? '',
      form: r.form ?? prev.form ?? '', pack: r.pack ?? prev.pack ?? '',
      catchWeight: yn(r.catchWeight, prev.catchWeight),
      fixedPack: yn(r.fixedPack, prev.fixedPack),
      ppn: r.ppn || prev.ppn || 'standard',
    })
  })
  return [...byId.values()]
}

export { downloadText }
