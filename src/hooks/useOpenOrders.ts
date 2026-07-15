/**
 * Fetch open orders from Directus and map them to the OpenOrder view-model.
 *
 * Reads the `orders` collection + fetches `order_lines` for each page of
 * orders in a single batch query (filter by order_id _in [ids]). The lines
 * are grouped by order_id and attached to each order's `lines` array so the
 * OpenOrdersPanel can render expandable per-item rows.
 *
 * Per code-standards.md: hooks live in src/hooks/. Directus reads go through
 * the client wrapper (src/lib/directus.ts) which returns { data, error }
 * tuples and validates responses with zod at the boundary.
 */

import { useCallback, useEffect, useState } from 'react';
import { aggregateOrders, readOrderLines, readOrders } from '../lib/directus';
import type { OpenOrder, OpenOrderLine } from '../types/dashboard';

/** Orders considered "open" — only the explicit 'Open' status (legacy field).
 *  TODO: migrate to `stage` enum in a separate unit per ai-workflow-rules.md. */
const OPEN_STATUSES = ['Open'];

/** Max orders per page in the Open Orders panel. */
export const OPEN_ORDERS_PAGE_SIZE = 20;

interface UseOpenOrdersResult {
  orders: OpenOrder[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  refetch: () => void;
}

/** Format an ISO date string as "July 1st, 2026" (matches the mock format). */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).replace(
    /\d+$/,
    `${day}${suffix}`,
  ) + `, ${d.getFullYear()}`;
}

/** Map a raw order_lines row → OpenOrderLine view-model. */
function toOpenOrderLine(row: {
  id: string;
  name: string;
  qty?: number | string | null;
  unit?: string | null;
  price?: number | string | null;
  sort_order?: number | string | null;
}): OpenOrderLine {
  const qtyNum = typeof row.qty === 'string' ? parseFloat(row.qty) : row.qty;
  const priceNum = typeof row.price === 'string' ? parseFloat(row.price) : row.price;
  return {
    id: row.id,
    name: row.name,
    amount: priceNum ?? 0,
    qty: qtyNum ?? null,
    unit: row.unit ?? null,
    price: priceNum ?? null,
  };
}

/** Group order_lines by their order_id so we can attach them to each order. */
function groupLinesByOrderId(
  lines: { id: string; order_id?: string | null; name: string; qty?: number | string | null; unit?: string | null; price?: number | string | null; sort_order?: number | string | null }[],
): Map<string, OpenOrderLine[]> {
  const map = new Map<string, OpenOrderLine[]>();
  for (const line of lines) {
    if (!line.order_id) continue;
    const existing = map.get(line.order_id) ?? [];
    existing.push(toOpenOrderLine(line));
    map.set(line.order_id, existing);
  }
  // Sort lines within each order by sort_order
  for (const [, list] of map) {
    list.sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0));
  }
  return map;
}

/** Map a Directus orders row → OpenOrder view-model, with attached lines. */
function toOpenOrder(
  row: {
    id: string;
    order_id?: string | null;
    no?: string | null;
    stage?: string | null;
    status?: string | null;
    order_date?: string | null;
    delivery_date?: string | null;
    sales_rep?: string | null;
    customer_name?: string | null;
    created_at?: string | null;
  },
  linesByOrderId: Map<string, OpenOrderLine[]>,
): OpenOrder {
  return {
    id: row.id,
    orderId: row.order_id ?? '—',
    status: row.stage ?? row.status ?? 'Draft',
    orderDate: formatDate(row.order_date ?? row.created_at),
    deliveryDate: formatDate(row.delivery_date),
    salesRep: row.sales_rep ?? '—',
    customerName: row.customer_name ?? '—',
    lines: linesByOrderId.get(row.id) ?? [],
  };
}

export function useOpenOrders(sort: string = '-order_id'): UseOpenOrdersResult {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const filter = { status: { _in: OPEN_STATUSES } };

      // Fetch the current page of orders + the total count in parallel.
      const [pageResult, countResult] = await Promise.all([
        readOrders({
          filter,
          fields: [
            'id',
            'order_id',
            'no',
            'stage',
            'status',
            'order_date',
            'delivery_date',
            'sales_rep',
            'customer_name',
            'created_at',
          ],
          sort: [sort],
          limit: OPEN_ORDERS_PAGE_SIZE,
          offset: (page - 1) * OPEN_ORDERS_PAGE_SIZE,
        }),
        aggregateOrders({
          filter,
          aggregate: { count: ['*'] },
        }),
      ]);

      if (cancelled) return;

      if (pageResult.error !== null) {
        setError(`Failed to load orders: ${pageResult.error}`);
        setLoading(false);
        return;
      }

      const pageOrders = pageResult.data;
      const orderIds = pageOrders.map((o) => o.id);

      // Fetch order_lines for all orders on this page in a single batch query.
      let linesByOrderId = new Map<string, OpenOrderLine[]>();
      if (orderIds.length > 0) {
        const linesResult = await readOrderLines({
          filter: { order_id: { _in: orderIds } },
          fields: ['id', 'order_id', 'name', 'qty', 'unit', 'price', 'sort_order'],
          sort: ['sort_order'],
          limit: -1,
        });
        if (linesResult.error === null && linesResult.data) {
          linesByOrderId = groupLinesByOrderId(linesResult.data);
        }
      }

      if (cancelled) return;

      setOrders(pageOrders.map((row) => toOpenOrder(row, linesByOrderId)));

      if (countResult.error === null && countResult.data.length > 0) {
        setTotal(Number(countResult.data[0].count ?? 0));
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, nonce, sort]);

  return { orders, loading, error, total, page, pageSize: OPEN_ORDERS_PAGE_SIZE, setPage, refetch };
}
