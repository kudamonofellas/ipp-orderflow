/**
 * The single source of truth for `order_lines.unit`.
 *
 * The column is free text in Directus (`schemas.ts` validates it as
 * `z.string()`), and before this module every screen kept its own list:
 * New Order wrote lowercase ("loaf", "box", "pack"), Order Edit and
 * AddItemModal's paste parser wrote capitalized ("Loaf", "Box", "Pack"),
 * and Reports' grouping tables were keyed lowercase only — so a
 * capitalized line silently fell out of "Demand by product". Live dev data
 * carries both spellings ("loaf" ×15, "Loaf" ×1).
 *
 * Rules: store the canonical lowercase value (`normalizeUnit` on every
 * write), compare through the helpers here, and never key a lookup table
 * on a raw `unit` string.
 */

/**
 * Canonical units, in the order the dropdowns show them.
 *
 * `box` vs `dus`: both are cartons, but `box` is fixed-weight (counted
 * only) while `dus` is catch-weight — weighed and priced by actual kg, so
 * it classifies with `loaf` in `isWeighedUnit`. Intake picks `box` for a
 * fixed-weight carton and `dus` for a catch-weight one.
 */
export const UNITS = [
  "kg",
  "gram",
  "pack",
  "pcs",
  "box",
  "dus",
  "ekor",
  "loaf",
] as const;

export type Unit = (typeof UNITS)[number];

/**
 * Spellings accepted from free text (AddItemModal's paste parser) and from
 * historical rows. Keys are matched case-insensitively; every canonical
 * unit maps to itself so `normalizeUnit("Loaf")` resolves without a
 * separate pass.
 */
const UNIT_ALIASES: Record<string, Unit> = {
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  gram: "gram",
  grams: "gram",
  g: "gram",
  gr: "gram",
  pack: "pack",
  packs: "pack",
  pak: "pack",
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  box: "box",
  boxes: "box",
  dus: "dus",
  ekor: "ekor",
  loaf: "loaf",
  loaves: "loaf",
};

/**
 * Resolves any stored or typed spelling to its canonical unit, or `null`
 * when it isn't a unit at all (so callers can fall back to a default or
 * treat the text as part of the item name).
 */
export function normalizeUnit(raw: string | null | undefined): Unit | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return UNIT_ALIASES[key] ?? null;
}

/**
 * True weight units only — kg/gram. Matches the prototype's
 * `isWeightUnit` (`Dev-domain.js:32`). The over/under-order tolerance hint
 * and the "held back via `short` instead of `delivered`" rule both key off
 * this, since a loaf's ordered qty is a piece count, not a weight.
 */
export function isWeightUnit(unit: string | null | undefined): boolean {
  const u = normalizeUnit(unit);
  return u === "kg" || u === "gram";
}

/**
 * kg/gram OR loaf OR dus — the prototype's `isWeighed`
 * (`Dev-domain.js:35`), extended with `dus`. Both are counted containers
 * invoiced by catch-weight, so each needs a scale reading at Cold Storage
 * just as a pure weight-unit line does. Being outside `isWeightUnit` is
 * what keeps their Sending box (and leaves out the Short button).
 */
export function isWeighedUnit(unit: string | null | undefined): boolean {
  const u = normalizeUnit(unit);
  return u === "loaf" || u === "dus" || u === "kg" || u === "gram";
}
