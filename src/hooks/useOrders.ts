/**
 * Fetch orders from Directus with optional stage + search filters.
 *
 * Used by the Orders page (full order list with filtering). The dashboard's
 * "Open Orders" panel uses `useOpenOrders` instead (filtered to status='Open').
 *
 * Per code-standards.md: hooks live in src/hooks/. Directus reads go through
 * the client wrapper (src/lib/directus.ts) which returns { data, error }
 * tuples and validates responses with zod at the boundary.
 */

import { useCallback, useEffect, useState } from 'react';
import { aggregateOrders, readOrderLines, readOrders } from '../lib/directus';
import type { OpenOrder, OpenOrderLine } from '../types/dashboard';

/** Max orders per page in the Orders list. */
export const ORDERS_PAGE_SIZE = 20;

interface UseOrdersResult {
  orders: OpenOrder[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  refetch: () => void;
}

/** Format an ISO date string as "July 1st, 2026". */
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
  return map;
}

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
    orderId: row.no ?? row.order_id ?? '—',
    status: row.stage ?? row.status ?? 'Draft',
    orderDate: formatDate(row.order_date ?? row.created_at),
    deliveryDate: formatDate(row.delivery_date),
    salesRep: row.sales_rep ?? '—',
    customerName: row.customer_name ?? '—',
    lines: linesByOrderId.get(row.id) ?? [],
  };
}

/**
 * @param stageFilter  'all' = all orders, or a specific stage key from the pipeline enum.
 * @param search       Free-text search on order number or customer name.
 */
export function useOrders(stageFilter: string = 'all', search: string = ''): UseOrdersResult {
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

      const filter: Record<string, unknown> = {};

      if (stageFilter !== 'all') {
        // Try the new `stage` field first; fall back to legacy `status` for old rows.
        filter._or = [
          { stage: { _eq: stageFilter } },
          { status: { _eq: stageFilter } },
        ];
      }

      if (search.trim()) {
        const q = search.trim();
        filter._and = [
          {
            _or: [
              { no: { _icontains: q } },
              { order_id: { _icontains: q } },
              { customer_name: { _icontains: q } },
            ],
          },
        ];
      }

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
          sort: ['-order_id'],
          limit: ORDERS_PAGE_SIZE,
          offset: (page - 1) * ORDERS_PAGE_SIZE,
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
  }, [page, nonce, stageFilter, search]);

  return { orders, loading, error, total, page, pageSize: ORDERS_PAGE_SIZE, setPage, refetch };
}
