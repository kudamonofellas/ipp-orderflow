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

import { useCallback, useEffect, useState } from "react";
import { aggregateOrders, readOrderLines, readOrders } from "../lib/directus";
import { financeParallelQueueFilter, openOrdersFilter } from "../lib/pipeline";
import type { OpenOrder, OpenOrderLine } from "../types/dashboard";
import { useCan } from "./useAuth";

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
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return (
    d
      .toLocaleDateString("en-US", { month: "long", day: "numeric" })
      .replace(/\d+$/, `${day}${suffix}`) + `, ${d.getFullYear()}`
  );
}

function toOpenOrderLine(row: {
  id: string;
  name: string;
  qty?: number | string | null;
  unit?: string | null;
  price?: number | string | null;
  sort_order?: number | string | null;
}): OpenOrderLine {
  const qtyNum = typeof row.qty === "string" ? parseFloat(row.qty) : row.qty;
  const priceNum =
    typeof row.price === "string" ? parseFloat(row.price) : row.price;
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
  lines: {
    id: string;
    order_id?: string | null;
    name: string;
    qty?: number | string | null;
    unit?: string | null;
    price?: number | string | null;
    sort_order?: number | string | null;
  }[],
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
    no: row.no ?? "—",
    status: row.stage ?? row.status ?? "Draft",
    orderDate: formatDate(row.order_date ?? row.created_at),
    deliveryDate: formatDate(row.delivery_date),
    salesRep: row.sales_rep ?? "—",
    customerName: row.customer_name ?? "—",
    lines: linesByOrderId.get(row.id) ?? [],
  };
}

/**
 * @param stageFilter  'all' = all orders, or a specific stage key from the pipeline enum.
 * @param search       Free-text search on order number or customer name.
 * @param sort         Directus sort order string (e.g. '-no').
 */
export function useOrders(
  stageFilter: string = "all",
  search: string = "",
  sort: string = "-no",
): UseOrdersResult {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const can = useCan();
  const seeCustomerContact = can("seeCustomerContact");
  const seePrices = can("seePrices");

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const filter: Record<string, unknown> = {};

      if (stageFilter === "active") {
        Object.assign(filter, openOrdersFilter());
      } else if (stageFilter === "pending-docs") {
        filter._and = [
          { stage: { _eq: "delivered" } },
          { docs_returned: { _neq: true } },
        ];
      } else if (stageFilter === "completed") {
        filter._and = [
          { stage: { _eq: "delivered" } },
          { docs_returned: { _eq: true } },
        ];
      } else if (stageFilter === "finance") {
        filter._or = [
          { stage: { _eq: "finance" } },
          financeParallelQueueFilter(),
        ];
      } else if (stageFilter === "cancelled") {
        filter._or = [
          { cancelled: { _eq: true } },
          { stage: { _eq: "cancelled" } },
        ];
      } else if (stageFilter === "awaiting_return") {
        // Return-workflow buckets are parallel hand-offs, not stage values —
        // `stage` stays 'returned' throughout (see returnBucketsForOrder in pipeline.ts).
        filter._and = [
          { stage: { _eq: "returned" } },
          {
            _or: [
              { return_received: { _neq: true } },
              { return_inbound: { _eq: true } },
            ],
          },
          { return_settle: { _neq: "done" } },
        ];
      } else if (stageFilter === "admin_action") {
        filter._and = [
          { stage: { _eq: "returned" } },
          { return_settle: { _null: true } },
          { return_doc: { _null: true } },
        ];
      } else if (stageFilter === "awaiting_signed_doc") {
        filter._and = [
          { stage: { _eq: "returned" } },
          { return_settle: { _eq: "sign" } },
        ];
      } else if (stageFilter === "replacement_transit") {
        filter._and = [
          { is_replacement: { _eq: true } },
          { stage: { _nin: ["delivered", "cancelled"] } },
        ];
      } else if (stageFilter === "late") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const cutoff = todayStart.toISOString();
        const { _and: openConds } = openOrdersFilter() as { _and: unknown[] };
        filter._and = [
          ...openConds,
          {
            _or: [
              { delivery_date: { _lt: cutoff } },
              { deliver_at: { _lt: cutoff } },
            ],
          },
        ];
      } else if (stageFilter === "today") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        filter._or = [
          {
            _and: [
              { order_date: { _gte: todayStart.toISOString() } },
              { order_date: { _lt: todayEnd.toISOString() } },
            ],
          },
          {
            _and: [
              { created_at: { _gte: todayStart.toISOString() } },
              { created_at: { _lt: todayEnd.toISOString() } },
            ],
          },
        ];
      } else if (stageFilter !== "all") {
        // Try the `stage` field first; fall back to legacy `status` for old rows.
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
              { customer_name: { _icontains: q } },
            ],
          },
        ];
      }

      // Only request fields the current role's Directus ACL actually allows
      // reading — Warehouse/Production can't read `sales_rep` (matches their
      // denied seeCustomerContact), Courier can't read `price` (matches its
      // denied seePrices). Directus rejects the *whole* request if it names a
      // field outside a restricted role's field list, so requesting these
      // unconditionally 403'd the entire query for those roles.
      const orderFields = [
        "id",
        "no",
        "stage",
        "status",
        "order_date",
        "delivery_date",
        "customer_name",
        "created_at",
        ...(seeCustomerContact ? ["sales_rep"] : []),
      ];
      const lineFields = [
        "id",
        "order_id",
        "name",
        "qty",
        "unit",
        "sort_order",
        ...(seePrices ? ["price"] : []),
      ];

      const [pageResult, countResult] = await Promise.all([
        readOrders({
          filter,
          fields: orderFields,
          sort: [sort],
          limit: ORDERS_PAGE_SIZE,
          offset: (page - 1) * ORDERS_PAGE_SIZE,
        }),
        aggregateOrders({
          filter,
          aggregate: { count: ["*"] },
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
          fields: lineFields,
          sort: ["sort_order"],
          limit: -1,
        });
        if (linesResult.error === null && linesResult.data) {
          linesByOrderId = groupLinesByOrderId(linesResult.data);
        }
      }

      if (cancelled) return;

      setOrders(pageOrders.map((row) => toOpenOrder(row, linesByOrderId)));

      if (countResult.error === null && countResult.data.length > 0) {
        const raw = countResult.data[0].count;
        const val =
          raw && typeof raw === "object"
            ? ((raw as Record<string, unknown>)["*"] ??
              Object.values(raw as Record<string, unknown>)[0])
            : raw;
        const n = typeof val === "string" ? parseInt(val, 10) : (val as number);
        setTotal(Number.isNaN(n) ? 0 : n);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, nonce, stageFilter, search, sort, seeCustomerContact, seePrices]);

  return {
    orders,
    loading,
    error,
    total,
    page,
    pageSize: ORDERS_PAGE_SIZE,
    setPage,
    refetch,
  };
}
