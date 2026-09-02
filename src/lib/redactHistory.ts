const HAS_PRICE = /Rp\.?\s?[\d.,]+/i;
const PRICE_LINE_CLAUSE = /^Line ".*" price [\d.,]+→[\d.,]+$/;

/**
 * Strips price-revealing content from an `order_history.what` string, for
 * roles without the `seePrices` capability. Shared by the Notifications
 * feed (`useNotifications.ts`) and `OrderDetail.tsx`'s own History card —
 * both render the same raw `order_history.what` text, so both need the same
 * treatment; both already drop an entry outright when this returns `null`.
 *
 * Per explicit product decision: a price is removed outright, never masked
 * with a placeholder — "Rp •••" still tells a role without `seePrices`
 * "there was a price here," which is exactly what hiding it is meant to
 * prevent. Two shapes exist:
 *
 * 1. OrderEdit.tsx's multi-line edit summary — a "; "-joined clause list
 *    behind a plain, price-free prefix (e.g. `"Edited — Line "X" price
 *    100→200; Line "Y" qty 1→2"`). This is the one shape where a price is
 *    scoped to just *some* clauses, so only the matching clauses are
 *    dropped, keeping the rest of the message intact — falls back to `null`
 *    (drop the whole entry) if nothing survives, or if a price somehow
 *    remains after filtering (a message this function doesn't know how to
 *    partially redact should never leak a masked-looking-safe result).
 * 2. Every other price mention (COD collected/reconciled, Finance cleared,
 *    outstanding-partial, etc.) is a single sentence centrally *about* the
 *    price — there's no meaningful partial redaction of "Paid Rp 1.500.000
 *    — cleared" or "COD Rp 1.500.000 collected", so the whole entry is
 *    dropped whenever a price appears anywhere outside that one recognized
 *    clause-list shape (including inside the "prefix" before the first
 *    " — ", which the old implementation never even scanned — the actual
 *    bug behind "Paid Rp X ... — cleared" leaking the real figure in full
 *    for a role without `seePrices`, found while fixing this).
 */
export function redactHistoryPrices(text: string): string | null {
  const emdashIdx = text.indexOf(' — ');
  if (emdashIdx === -1) {
    return HAS_PRICE.test(text) ? null : text;
  }
  const prefix = text.slice(0, emdashIdx + 3);
  const rest = text.slice(emdashIdx + 3);
  if (HAS_PRICE.test(prefix)) {
    return null;
  }
  const clauses = rest
    .split('; ')
    .filter((clause) => !PRICE_LINE_CLAUSE.test(clause));
  if (clauses.length === 0) return null;
  const joined = clauses.join('; ');
  return HAS_PRICE.test(joined) ? null : prefix + joined;
}
