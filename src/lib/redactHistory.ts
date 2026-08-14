/**
 * Strips price-revealing content from an `order_history.what` string, for
 * roles without the `seePrices` capability. Shared by the Notifications
 * feed (`useNotifications.ts`) and `OrderDetail.tsx`'s own History card —
 * both render the same raw `order_history.what` text, so both need the same
 * treatment.
 *
 * Two distinct shapes leak a price: a "Line "X" price A→B" clause inside an
 * OrderEdit.tsx `buildEditSummary()` list (joined with "; ", prefixed with
 * "Edited — " or similar), and a formatted "Rp 1.500.000" figure elsewhere
 * (COD reconcile / delivered / outstanding COD in OrderDetail.tsx). Per
 * explicit product decision: price clauses are removed outright, not masked
 * with a placeholder — "price ###→###" read as a censored figure either
 * way, so showing "price •••→•••" gains nothing over just not mentioning
 * price changed at all. Returns `null` when removing the price clause(s)
 * leaves nothing else in the message (a purely price-only edit) — the
 * caller should drop that entry entirely rather than show a hollow
 * "Edited — " with no content.
 */
export function redactHistoryPrices(text: string): string | null {
  const emdashIdx = text.indexOf(' — ');
  if (emdashIdx === -1) {
    return text.replace(/Rp\.?\s?[\d.,]+/gi, 'Rp •••');
  }
  const prefix = text.slice(0, emdashIdx + 3);
  const rest = text.slice(emdashIdx + 3);
  const clauses = rest
    .split('; ')
    .filter((clause) => !/^Line ".*" price [\d.,]+→[\d.,]+$/.test(clause));
  if (clauses.length === 0) return null;
  return prefix + clauses.join('; ').replace(/Rp\.?\s?[\d.,]+/gi, 'Rp •••');
}
