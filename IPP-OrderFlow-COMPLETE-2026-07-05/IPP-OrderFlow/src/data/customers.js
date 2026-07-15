// Sample Horeca (B2B) customers. The NAMES are kept as stand-ins; contact, address and
// area are intentionally left BLANK (no fabricated phone numbers / addresses) — fill them
// from your real records, or they'll fill in from orders as you go.
// Payment terms drive each order's Finance gate. creditLimit (Rp, 0 = no limit set) and
// termDays (net payment days for "terms" accounts) feed the Finance credit check.
export const customers = [
  { id: 'saffron', name: 'Saffron Kitchen', channel: 'horeca',
    payment: { timing: 'upfront', method: 'transfer' },
    contact: '', address: '', area: '', sales: '', creditLimit: 0, termDays: 0 },
  { id: 'ducking', name: 'Ducking Setiabudi', channel: 'horeca',
    payment: { timing: 'cod', method: 'cash' },
    contact: '', address: '', area: '', sales: '', creditLimit: 0, termDays: 0 },
  { id: 'ivy', name: 'Ivy Restaurant', channel: 'horeca',
    payment: { timing: 'terms', method: 'transfer' },
    contact: '', address: '', area: '', sales: '', creditLimit: 30000000, termDays: 14 },
  { id: 'munro', name: 'Munro Resto', channel: 'horeca',
    payment: { timing: 'terms', method: 'transfer' },
    contact: '', address: '', area: '', sales: '', creditLimit: 20000000, termDays: 7 },
  { id: 'rifai', name: 'Rifai', channel: 'horeca',
    payment: { timing: 'cod', method: 'cash' },
    contact: '', address: '', area: '', sales: '', creditLimit: 0, termDays: 0 },
  { id: 'wolfgang', name: "Wolfgang's Teppan", channel: 'horeca',
    payment: { timing: 'terms', method: 'transfer' },
    contact: '', address: '', area: '', sales: '', creditLimit: 25000000, termDays: 14 },
]
