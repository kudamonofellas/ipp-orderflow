/**
 * CSV import/export for the Customer + Product master databases. Export
 * opens cleanly in Excel; import is an UPSERT by id (existing rows are
 * updated, new rows added â€” nothing is silently deleted). Ported from the
 * prototype's `Dev-csv.js`, adapted for this port's live Directus CRUD
 * (async create/update calls per row) instead of one synchronous in-memory
 * reducer dispatch.
 */
import type { CustomersCollection, ProductsCollection } from "../types/directus";

function esc(v: unknown): string {
  let s = String(v ?? "");
  // Neutralize spreadsheet formula injection (a cell starting with = + - @
  // runs as a formula in Excel).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

interface Column<T> {
  key?: keyof T;
  label: string;
  get?: (item: T) => unknown;
}

export function objectsToCSV<T>(items: T[], columns: Column<T>[]): string {
  const header = columns.map((c) => esc(c.label)).join(",");
  const rows = items.map((it) =>
    columns
      .map((c) => esc(c.get ? c.get(it) : c.key ? it[c.key] : ""))
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}

/** Tolerant CSV parser: quoted fields, doubled quotes ("") inside,
 *  commas/newlines in quotes, LF or CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const s = String(text || "").replace(/^\uFEFF/, ""); // strip a leading BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      /* swallow â€” \r\n handled by the \n branch */
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text).filter((r) =>
    r.some((c) => (c || "").trim() !== ""),
  );
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => (h || "").trim());
  return rows
    .slice(1)
    .map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, ((r[i] ?? "") + "").trim()])),
    );
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/* ---- Customers ---- */

const CUST_COLS: Column<CustomersCollection>[] = [
  { key: "id", label: "id" },
  { key: "name", label: "name" },
  { key: "company_name", label: "company" },
  { key: "area", label: "area" },
  { key: "contact", label: "contact" },
  { key: "address", label: "address" },
  { key: "sales", label: "sales" },
  { label: "payment_timing", get: (c) => c.pay_timing ?? "" },
  { label: "payment_method", get: (c) => c.pay_method ?? "" },
  { label: "term_days", get: (c) => c.term_days ?? "" },
  { label: "credit_limit", get: (c) => c.credit_limit ?? "" },
];

export function customersToCSV(customers: CustomersCollection[]): string {
  return objectsToCSV(customers, CUST_COLS);
}

export interface CustomerImportRow {
  /** Present + matching an existing id â†’ update; absent/unmatched â†’ create. */
  id: string | null;
  patch: Omit<CustomersCollection, "id" | "created_at" | "updated_at">;
}

/** Parses a customer CSV against the currently-loaded list â€” id-less rows
 *  match an existing customer by name+company so a re-import updates
 *  instead of duplicating, exactly like the prototype's `csvToCustomers`. */
export function parseCustomerCSV(
  text: string,
  existing: CustomersCollection[],
): CustomerImportRow[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byKey = new Map(
    existing.map((c) => [`${norm(c.name)}|${norm(c.company_name)}`, c.id]),
  );
  return csvToObjects(text).map((r) => {
    const matchedId =
      (r.id && byId.has(r.id) ? r.id : null) ??
      byKey.get(`${norm(r.name)}|${norm(r.company)}`) ??
      null;
    const prev = matchedId ? byId.get(matchedId) : undefined;
    return {
      id: matchedId,
      patch: {
        name: r.name || prev?.name || "",
        company_name: r.company || prev?.company_name || null,
        channel: prev?.channel ?? null,
        area: r.area || prev?.area || null,
        contact: r.contact || prev?.contact || null,
        address: r.address || prev?.address || null,
        address_geo: prev?.address_geo ?? null,
        sales: r.sales || prev?.sales || null,
        pay_timing: r.payment_timing || prev?.pay_timing || "upfront",
        pay_method: r.payment_method || prev?.pay_method || "transfer",
        term_days:
          r.term_days !== undefined && r.term_days !== ""
            ? Math.max(0, Number(r.term_days) || 0)
            : (prev?.term_days ?? 0),
        credit_limit:
          r.credit_limit !== undefined && r.credit_limit !== ""
            ? Math.max(0, Number(r.credit_limit) || 0)
            : (prev?.credit_limit ?? 0),
      },
    };
  });
}

/* ---- Products ---- */

const PROD_COLS: Column<ProductsCollection>[] = [
  { key: "id", label: "id" },
  { key: "name", label: "name" },
  { key: "accurate_name", label: "accurateName" },
  { key: "category", label: "category" },
  { key: "origin", label: "origin" },
  { key: "grade", label: "grade" },
  { key: "brand", label: "brand" },
  { key: "form", label: "form" },
  { key: "pack", label: "pack" },
  { label: "catchWeight", get: (p) => (p.catch_weight ? "Y" : "N") },
  { label: "fixedPack", get: (p) => (p.fixed_pack ? "Y" : "N") },
  { key: "ppn", label: "ppn" },
];

export function productsToCSV(products: ProductsCollection[]): string {
  return objectsToCSV(products, PROD_COLS);
}

export interface ProductImportRow {
  id: string | null;
  patch: Omit<ProductsCollection, "id" | "date_created" | "date_updated">;
}

/** id-less rows match an existing product by accurateName (falling back to
 *  name) so a re-import updates instead of duplicating, like the
 *  prototype's `csvToProducts`. */
export function parseProductCSV(
  text: string,
  existing: ProductsCollection[],
): ProductImportRow[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const byKey = new Map(
    existing.map((p) => [norm(p.accurate_name || p.name), p.id]),
  );
  const yn = (v: string | undefined, fallback: boolean | null | undefined) =>
    v !== undefined && v !== "" ? /^(y|yes|true|1)/i.test(v) : !!fallback;
  return csvToObjects(text).map((r) => {
    const matchedId =
      (r.id && byId.has(r.id) ? r.id : null) ??
      byKey.get(norm(r.accurateName || r.name)) ??
      null;
    const prev = matchedId ? byId.get(matchedId) : undefined;
    return {
      id: matchedId,
      patch: {
        name: r.name || prev?.name || r.accurateName || "",
        accurate_name: r.accurateName || prev?.accurate_name || r.name || null,
        category: r.category || prev?.category || null,
        origin: r.origin || prev?.origin || null,
        grade: r.grade || prev?.grade || null,
        brand: r.brand || prev?.brand || null,
        form: r.form || prev?.form || null,
        pack: r.pack || prev?.pack || null,
        catch_weight: yn(r.catchWeight, prev?.catch_weight),
        fixed_pack: yn(r.fixedPack, prev?.fixed_pack),
        ppn: r.ppn || prev?.ppn || "standard",
        oos: prev?.oos ?? false,
      },
    };
  });
}
