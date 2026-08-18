/**
 * Normalizes free-text item input into a stable lookup key for the
 * `corrections` "learned matches" table, used by AddItemModal's manual
 * match flow (the "Add Item" button on New Order and Order Edit). Strips a
 * leading qty + unit ("2 kg ", "1 box ") and normalizes case/whitespace, so
 * "2 kg short rib" and "3  Kg  Short Rib" resolve to the same learned
 * match. Deliberately simpler than the WhatsApp-paste flow's own tokenizer
 * (a separate service outside this repo, called via parseOrderText) — this
 * key only has to be self-consistent between AddItemModal's own save and
 * lookup, not compatible with that other service's keys.
 */
export function normalizeItemToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const stripped = trimmed
    .replace(/^\d+(?:[.,]\d+)?\s*[a-zA-Z]*\s*/, "")
    .trim();
  return (stripped || trimmed).toLowerCase().replace(/\s+/g, " ");
}
