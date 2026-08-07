/**
 * Aggregate Pick List — "today needs ~31 kg lamb leg across 3 orders". Sums
 * every line still to be pulled (orders at New Orders / Cold Storage, not on
 * hold) for one delivery date, so the warehouse pulls each product ONCE
 * instead of walking the cold room order by order.
 *
 * Ported from the prototype's `Dev-PickList.jsx` onto real Directus reads:
 * `orders` (the pool) → `order_lines` (batched by order id) → `line_cuts`
 * (batched by line id, for the cutting-job badge) → `products` (batched by
 * product id, for `category` + `catch_weight`).
 */

import { useEffect, useState } from 'react';
import { readOrders, readOrderLines, readLineCuts, readProducts } from '../lib/directus';

export interface PickListOrderRow {
  orderId: string;
  orderNo: string;
  customerName: string;
  qty: number;
  cutTexts: string[];
}

export interface PickListRow {
  /** `(productId ?? name) + '|' + unit` — same composite used for the picked/unpicked checklist state. */
  key: string;
  name: string;
  unit: string;
  qty: number;
  /** True when the product is weighed per order (catch-weight) — the total is a target, not an invoice figure. */
  catchWeight: boolean;
  category: string | null;
  cutCount: number;
  orders: PickListOrderRow[];
}

export interface PickListGroup {
  category: string;
  rows: PickListRow[];
}

interface UsePickListResult {
  /** Empty when no product has a populated category — render a flat list instead. */
  groups: PickListGroup[];
  /** Flat row list regardless of category — used when `groups` is empty. */
  rows: PickListRow[];
  /** Distinct orders actually contributing to `rows` (not the raw pool size — an order with every line removed doesn't count). */
  orderCount: number;
  loading: boolean;
  error: string | null;
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export function usePickList(day: string): UsePickListResult {
  const [rows, setRows] = useState<PickListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const dayStart = new Date(`${day}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const startISO = dayStart.toISOString();
      const endISO = dayEnd.toISOString();
      const inRange = (field: string) => ({
        _and: [{ [field]: { _gte: startISO } }, { [field]: { _lt: endISO } }],
      });

      const ordersRes = await readOrders({
        filter: {
          _and: [
            { stage: { _in: ['intake', 'cold'] } },
            { hold: { _neq: true } },
            { cancelled: { _neq: true } },
            { _or: [inRange('deliver_at'), inRange('delivery_date')] },
          ],
        },
        fields: ['id', 'no', 'customer_name'],
        sort: ['no'],
        limit: -1,
      });
      if (cancelled) return;
      if (ordersRes.error) {
        setError(`Failed to load pick list: ${ordersRes.error}`);
        setLoading(false);
        return;
      }

      const orders = ordersRes.data ?? [];
      if (orders.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const orderIds = orders.map((o) => o.id);
      const linesRes = await readOrderLines({
        filter: { _and: [{ order_id: { _in: orderIds } }, { removed: { _neq: true } }] },
        fields: ['id', 'order_id', 'product_id', 'name', 'qty', 'unit'],
        limit: -1,
      });
      if (cancelled) return;
      if (linesRes.error) {
        setError(`Failed to load pick list: ${linesRes.error}`);
        setLoading(false);
        return;
      }
      const lines = linesRes.data ?? [];

      const lineIds = lines.map((l) => l.id);
      const [cutsRes, productsRes] = await Promise.all([
        readLineCuts(lineIds),
        (() => {
          const productIds = [...new Set(lines.map((l) => l.product_id).filter((id): id is string => !!id))];
          return productIds.length === 0
            ? Promise.resolve({ data: [], error: null })
            : readProducts({
                filter: { id: { _in: productIds } },
                // `name` is required (non-optional) in ProductsCollectionSchema —
                // must be requested even though it's unused here, or zod parsing fails.
                fields: ['id', 'name', 'category', 'catch_weight'],
                limit: -1,
              });
        })(),
      ]);
      if (cancelled) return;

      const cutTextsByLine = new Map<string, string[]>();
      for (const cut of cutsRes.data ?? []) {
        if (!cut.text?.trim()) continue;
        const existing = cutTextsByLine.get(cut.line_id) ?? [];
        existing.push(cut.text.trim());
        cutTextsByLine.set(cut.line_id, existing);
      }

      const productById = new Map<string, { category: string | null; catchWeight: boolean }>();
      for (const p of productsRes.data ?? []) {
        productById.set(p.id, { category: p.category ?? null, catchWeight: p.catch_weight === true });
      }

      const orderById = new Map(orders.map((o) => [o.id, o]));
      const rowMap = new Map<string, PickListRow>();

      for (const line of lines) {
        if (!line.order_id) continue;
        const order = orderById.get(line.order_id);
        if (!order) continue;

        const unit = line.unit ?? '';
        const key = `${line.product_id ?? line.name}|${unit}`;
        const product = line.product_id ? productById.get(line.product_id) : undefined;
        const cutTexts = cutTextsByLine.get(line.id) ?? [];
        const qty = toNumber(line.qty);

        const row = rowMap.get(key) ?? {
          key,
          name: line.name,
          unit,
          qty: 0,
          catchWeight: product?.catchWeight ?? false,
          category: product?.category ?? null,
          cutCount: 0,
          orders: [],
        };
        row.qty += qty;
        row.cutCount += cutTexts.length;
        row.orders.push({
          orderId: order.id,
          orderNo: order.no ?? '—',
          customerName: order.customer_name ?? '—',
          qty,
          cutTexts,
        });
        rowMap.set(key, row);
      }

      const built = [...rowMap.values()].sort((a, b) => a.name.localeCompare(b.name));
      setRows(built);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [day]);

  const distinctCategories = new Set(rows.map((r) => r.category).filter((c): c is string => !!c));
  const groups: PickListGroup[] =
    distinctCategories.size === 0
      ? []
      : [...distinctCategories]
          .sort((a, b) => a.localeCompare(b))
          .map((category) => ({ category, rows: rows.filter((r) => r.category === category) }))
          .concat(
            rows.some((r) => !r.category)
              ? [{ category: 'Other', rows: rows.filter((r) => !r.category) }]
              : [],
          );

  const orderCount = new Set(rows.flatMap((r) => r.orders.map((o) => o.orderId))).size;

  return { groups, rows, orderCount, loading, error };
}
