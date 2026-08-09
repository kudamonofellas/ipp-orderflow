/**
 * Cash-up — the desk's COD reconciliation queue. Pools every order out for
 * delivery or delivered (not cancelled) whose customer pays COD
 * (`customers.pay_timing === 'cod'`) and hasn't been reconciled yet
 * (`orders.cod_reconciled`), grouped by the courier holding the cash
 * (`orders.taken_by`), so the desk settles one person at a time.
 *
 * The per-order amount is the order total (sum of `order_lines` qty×price —
 * same calculation as OrderDetail's `orderTotal`), since neither `orders`
 * nor `delivery_proofs` has a dedicated COD-amount column in the live schema.
 *
 * "Confirm" writes `orders.cod_reconciled = true` for real (added 2026-08-09
 * — `orders.cod_reconciled` didn't exist on the live schema before that;
 * Finance's `orders.update` permission was also field-restricted and had to
 * be extended to allow it, mirroring how `payment_confirmed` is granted).
 * A matching `order_history` entry is appended, same as every other order
 * mutation in this app.
 */

import { useEffect, useState } from 'react';
import { readOrders, readCustomers, readOrderLines, readAllUsers, updateOrder, appendOrderHistory } from '../lib/directus';
import { useCurrentUserId } from './useAuth';

export interface CashUpOrderRow {
  orderId: string;
  orderNo: string;
  customerName: string;
  amount: number;
}

export interface CashUpCourierGroup {
  courier: string;
  orders: CashUpOrderRow[];
  subtotal: number;
}

interface UseCashUpResult {
  groups: CashUpCourierGroup[];
  expected: number;
  collected: number;
  remaining: number;
  confirmedIds: Set<string>;
  confirmingIds: Set<string>;
  confirm: (orderId: string) => Promise<{ error: string | null }>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function isCOD(payTiming: string | null | undefined): boolean {
  return (payTiming ?? '').trim().toLowerCase() === 'cod';
}

export function useCashUp(): UseCashUpResult {
  const userId = useCurrentUserId();
  const [rows, setRows] = useState<CashUpOrderRow[]>([]);
  const [rowsByCourier, setRowsByCourier] = useState<Map<string, CashUpOrderRow[]>>(new Map());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const ordersRes = await readOrders({
        filter: {
          _and: [
            { stage: { _in: ['dispatch', 'delivered'] } },
            { cancelled: { _neq: true } },
            { taken_by: { _nnull: true } },
            { cod_reconciled: { _neq: true } },
          ],
        },
        fields: ['id', 'no', 'customer_id', 'customer_name', 'taken_by'],
        sort: ['taken_by'],
        limit: -1,
      });
      if (cancelled) return;
      if (ordersRes.error) {
        setError(`Failed to load cash-up: ${ordersRes.error}`);
        setLoading(false);
        return;
      }
      const orders = ordersRes.data ?? [];
      if (orders.length === 0) {
        setRows([]);
        setRowsByCourier(new Map());
        setLoading(false);
        return;
      }

      const customerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => !!id))];
      const orderIds = orders.map((o) => o.id);

      const [customersRes, linesRes, usersRes] = await Promise.all([
        customerIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : readCustomers({
              filter: { id: { _in: customerIds } },
              // `name` is required (non-optional) in CustomersCollectionSchema —
              // must be requested even though it's unused here, or zod parsing fails.
              fields: ['id', 'name', 'pay_timing'],
              limit: -1,
            }),
        readOrderLines({
          filter: { _and: [{ order_id: { _in: orderIds } }, { removed: { _neq: true } }] },
          // `id` is required (non-optional) in OrderLinesCollectionSchema —
          // must be requested even though it's unused here, or zod parsing fails.
          fields: ['id', 'order_id', 'qty', 'price'],
          limit: -1,
        }),
        // `orders.taken_by` is a UUID FK to directus_users.id, not a courier
        // name — resolve it to a display name the same way OrderDetail does.
        readAllUsers(),
      ]);
      if (cancelled) return;
      if (customersRes.error) {
        setError(`Failed to load cash-up: ${customersRes.error}`);
        setLoading(false);
        return;
      }
      if (linesRes.error) {
        setError(`Failed to load cash-up: ${linesRes.error}`);
        setLoading(false);
        return;
      }

      const nameByUserId = new Map(
        (usersRes.data ?? []).map((u) => [
          u.id,
          `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.id,
        ]),
      );
      const codByCustomer = new Map((customersRes.data ?? []).map((c) => [c.id, isCOD(c.pay_timing)]));
      const totalByOrder = new Map<string, number>();
      for (const line of linesRes.data ?? []) {
        if (!line.order_id) continue;
        const amount = toNumber(line.qty) * toNumber(line.price);
        totalByOrder.set(line.order_id, (totalByOrder.get(line.order_id) ?? 0) + amount);
      }

      const byCourier = new Map<string, CashUpOrderRow[]>();
      const built: CashUpOrderRow[] = [];
      for (const order of orders) {
        if (!order.customer_id || !codByCustomer.get(order.customer_id)) continue;
        const amount = totalByOrder.get(order.id) ?? 0;
        if (amount <= 0) continue;
        const row: CashUpOrderRow = {
          orderId: order.id,
          orderNo: order.no ?? '—',
          customerName: order.customer_name ?? '—',
          amount,
        };
        built.push(row);
        const courier = order.taken_by ? (nameByUserId.get(order.taken_by) ?? order.taken_by) : 'Unassigned';
        const existing = byCourier.get(courier) ?? [];
        existing.push(row);
        byCourier.set(courier, existing);
      }

      setRows(built);
      setRowsByCourier(byCourier);
      setConfirmedIds(new Set());
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  async function confirm(orderId: string): Promise<{ error: string | null }> {
    setConfirmingIds((prev) => new Set(prev).add(orderId));
    const res = await updateOrder(orderId, { cod_reconciled: true });
    if (res.error) {
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      return { error: res.error };
    }
    await appendOrderHistory({
      order_id: orderId,
      what: 'COD cash reconciled',
      who: userId,
      stage: null,
    });
    setConfirmingIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    setConfirmedIds((prev) => new Set(prev).add(orderId));
    return { error: null };
  }

  const groups: CashUpCourierGroup[] = [...rowsByCourier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([courier, courierRows]) => ({
      courier,
      orders: courierRows,
      subtotal: courierRows.reduce((sum, r) => sum + r.amount, 0),
    }));

  const expected = rows.reduce((sum, r) => sum + r.amount, 0);
  const collected = rows.filter((r) => confirmedIds.has(r.orderId)).reduce((sum, r) => sum + r.amount, 0);
  const remaining = expected - collected;

  return { groups, expected, collected, remaining, confirmedIds, confirmingIds, confirm, loading, error, refetch };
}
