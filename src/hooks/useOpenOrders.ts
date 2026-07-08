/**
 * Fetch open orders from Directus and map them to the OpenOrder view-model.
 *
 * Replaces the `openOrders` mock export. The rest of the dashboard still
 * reads from mockDashboard.ts until each panel is migrated in turn.
 *
 * Per code-standards.md: hooks live in src/hooks/. Directus reads go through
 * the client wrapper (src/lib/directus.ts) which returns { data, error }
 * tuples and validates responses with zod at the boundary.
 */

import { useEffect, useState } from 'react';
import { aggregateOrders, readOrders } from '../lib/directus';
import type { OpenOrder, OpenOrderLine } from '../types/dashboard';

/** Orders considered "open" — only the explicit 'Open' status. */
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

/** Parse the denormalized order_items text blob into display lines. */
function parseOrderItems(raw: string | null | undefined): OpenOrderLine[] {
  if (!raw) return [];
  // The current schema stores order_items as a text blob. Until the
  // normalized order_lines collection exists, we show the raw text as a
  // single line with no amount (amount unknown — prices live in Accurate).
  return [{ id: 'raw', name: raw.slice(0, 80) + (raw.length > 80 ? '…' : ''), amount: 0 }];
}

/** Map a Directus orders row → OpenOrder view-model. */
function toOpenOrder(row: {
  id: string;
  order_id?: string | null;
  status?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  order_items?: string | null;
  created_at?: string | null;
}): OpenOrder {
  return {
    id: row.id,
    orderId: row.order_id ?? '—',
    status: row.status ?? 'Draft',
    orderDate: formatDate(row.order_date ?? row.created_at),
    deliveryDate: formatDate(row.delivery_date),
    lines: parseOrderItems(row.order_items),
  };
}

export function useOpenOrders(): UseOpenOrdersResult {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

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
          sort: ['-order_id'],
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
      } else {
        setOrders(pageResult.data.map(toOpenOrder));
      }

      if (countResult.error === null && countResult.data.length > 0) {
        setTotal(Number(countResult.data[0].count ?? 0));
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return { orders, loading, error, total, page, pageSize: OPEN_ORDERS_PAGE_SIZE, setPage };
}
