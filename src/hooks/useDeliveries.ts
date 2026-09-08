/**
 * Deliveries — the current courier's run-sheet, split into `mine` (assigned
 * to the signed-in user, or unassigned — ported from the prototype's
 * `myDeliveries`/`takenByMe` predicate: unassigned dispatch orders count as
 * "mine" for anyone, same caveat the prototype had) and `others` (assigned to
 * a different courier, read-only — "With other drivers").
 *
 * Two job types feed the run-sheet, merged into one list exactly like the
 * prototype (`Dev-Deliveries.jsx:16-21`): normal `stage='dispatch'` orders,
 * and revised-DO/SI signing runs (`stage==='returned' && return_settle==='sign'`)
 * — Dashboard's "My deliveries" count already includes the latter, so the
 * run-sheet itself must list them too, or a courier has a job counted but
 * nowhere to see it.
 *
 * Stop order within `mine` follows `orders.run_seq` (courier-chosen, via
 * `moveStop`) — unsequenced runs sink to the bottom in delivery-date order,
 * matching the prototype's `bySeq` comparator.
 *
 * COD-ness and the amount to collect use the same source as `useCashUp`:
 * `customers.pay_timing === 'cod'` and the order total (`order_lines`
 * qty×price), since neither `orders` nor `delivery_proofs` has a dedicated
 * COD-amount column. Sign-runs never show a COD chip (matches the
 * prototype's `!sign && ...` guard) — nothing is being collected on a
 * signing-only stop.
 */

import { useEffect, useState } from 'react';
import {
  readOrders,
  readCustomers,
  readOrderLines,
  readAllUsers,
  updateOrder,
  appendOrderHistory,
} from '../lib/directus';

export interface DeliveryStop {
  orderId: string;
  orderNo: string;
  customerName: string;
  address: string | null;
  isCOD: boolean;
  amount: number;
  sequence: number;
  /** Display name of the courier holding this stop, or null if unassigned. */
  takenByName: string | null;
  /** A revised-DO/SI-for-signing job, not a normal delivery. */
  isSignRun: boolean;
  /** True only when THIS courier is the one who actually took the stop
   *  (not merely "unassigned, so it's in my list too") — only own-run
   *  stops can be reordered, matching the prototype's `ownRun`. */
  isOwnRun: boolean;
  runSeq: number | null;
}

interface UseDeliveriesResult {
  mine: DeliveryStop[];
  others: DeliveryStop[];
  loading: boolean;
  error: string | null;
  markDelivered: (orderId: string, userId: string | null) => Promise<{ error: string | null }>;
  /** Moves a stop up (-1) or down (+1) within the courier's own reorderable
   *  run — ported from the prototype's `move()` (`Dev-Deliveries.jsx:28-37`):
   *  swaps the two `run_seq` values, then renumbers the rest of the own-run
   *  stops densely so a later mixed reorder doesn't leave gaps. */
  moveStop: (orderId: string, direction: -1 | 1) => Promise<void>;
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

interface RunOrder {
  id: string;
  no: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  deliver_at: string | null;
  delivery_date: string | null;
  taken_by: string | null;
  stage: string | null;
  return_settle: string | null;
  return_dispatch: { taken_by?: string | null } | null;
  run_seq: number | null;
}

export function useDeliveries(courierId: string | null): UseDeliveriesResult {
  const [mine, setMine] = useState<DeliveryStop[]>([]);
  const [others, setOthers] = useState<DeliveryStop[]>([]);
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
            {
              _or: [
                { stage: { _eq: 'dispatch' } },
                {
                  _and: [
                    { stage: { _eq: 'returned' } },
                    { return_settle: { _eq: 'sign' } },
                  ],
                },
              ],
            },
            { cancelled: { _neq: true } },
          ],
        },
        fields: [
          'id',
          'no',
          'customer_id',
          'customer_name',
          'customer_address',
          'deliver_at',
          'delivery_date',
          'taken_by',
          'stage',
          'return_settle',
          'return_dispatch',
          'run_seq',
        ],
        sort: ['deliver_at'],
        limit: -1,
      });
      if (cancelled) return;
      if (ordersRes.error) {
        setError(`Failed to load deliveries: ${ordersRes.error}`);
        setLoading(false);
        return;
      }
      const orders = (ordersRes.data ?? []) as unknown as RunOrder[];
      if (orders.length === 0) {
        setMine([]);
        setOthers([]);
        setLoading(false);
        return;
      }

      const customerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => !!id))];
      // Sign-runs carry no billable items of their own to collect — skip
      // them from the order-total lookup (their `amount` always renders 0/
      // no-chip anyway, per `isSignRun` below).
      const dispatchOrderIds = orders.filter((o) => o.stage === 'dispatch').map((o) => o.id);

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
        dispatchOrderIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : readOrderLines({
              filter: { _and: [{ order_id: { _in: dispatchOrderIds } }, { removed: { _neq: true } }] },
              // `id` and `name` are required (non-optional) in
              // OrderLinesCollectionSchema — must be requested even though
              // `name` is unused here, or zod parsing fails.
              fields: ['id', 'order_id', 'name', 'qty', 'price'],
              limit: -1,
            }),
        readAllUsers(),
      ]);
      if (cancelled) return;
      if (customersRes.error) {
        setError(`Failed to load deliveries: ${customersRes.error}`);
        setLoading(false);
        return;
      }
      if (linesRes.error) {
        setError(`Failed to load deliveries: ${linesRes.error}`);
        setLoading(false);
        return;
      }

      const codByCustomer = new Map((customersRes.data ?? []).map((c) => [c.id, isCOD(c.pay_timing)]));
      const totalByOrder = new Map<string, number>();
      for (const line of linesRes.data ?? []) {
        if (!line.order_id) continue;
        totalByOrder.set(
          line.order_id,
          (totalByOrder.get(line.order_id) ?? 0) + toNumber(line.qty) * toNumber(line.price),
        );
      }
      const nameByUserId = new Map(
        (usersRes.data ?? []).map((u) => [
          u.id,
          `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email,
        ]),
      );

      const bySeq = (a: RunOrder, b: RunOrder) => {
        const seqDiff = (a.run_seq ?? 999) - (b.run_seq ?? 999);
        if (seqDiff !== 0) return seqDiff;
        return new Date(a.deliver_at ?? 0).getTime() - new Date(b.deliver_at ?? 0).getTime();
      };

      const mineOrders: RunOrder[] = [];
      const othersOrders: RunOrder[] = [];
      orders.forEach((order) => {
        const isSignRun = order.stage === 'returned';
        const heldBy = isSignRun ? (order.return_dispatch?.taken_by ?? null) : order.taken_by;
        const isMine = !heldBy || heldBy === courierId;
        (isMine ? mineOrders : othersOrders).push(order);
      });
      mineOrders.sort(bySeq);

      function buildStop(order: RunOrder, sequence: number): DeliveryStop {
        const isSignRun = order.stage === 'returned';
        const heldBy = isSignRun ? (order.return_dispatch?.taken_by ?? null) : order.taken_by;
        return {
          orderId: order.id,
          orderNo: order.no ?? '—',
          customerName: order.customer_name ?? '—',
          address: order.customer_address ?? null,
          isCOD: !isSignRun && order.customer_id ? (codByCustomer.get(order.customer_id) ?? false) : false,
          amount: isSignRun ? 0 : (totalByOrder.get(order.id) ?? 0),
          sequence,
          takenByName: heldBy ? (nameByUserId.get(heldBy) ?? null) : null,
          isSignRun,
          isOwnRun: !!heldBy && heldBy === courierId,
          runSeq: order.run_seq ?? null,
        };
      }

      setMine(mineOrders.map((o, i) => buildStop(o, i + 1)));
      setOthers(othersOrders.map((o, i) => buildStop(o, i + 1)));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [courierId, nonce]);

  async function markDelivered(orderId: string, userId: string | null) {
    const res = await updateOrder(orderId, {
      stage: 'delivered',
      delivered_at: new Date().toISOString(),
    });
    if (res.error) return { error: res.error };
    await appendOrderHistory({
      order_id: orderId,
      what: 'Stage advanced: dispatch → delivered',
      who: userId,
      stage: 'delivered',
    });
    refetch();
    return { error: null };
  }

  async function moveStop(orderId: string, direction: -1 | 1) {
    const ownRun = mine.filter((s) => s.isOwnRun);
    const i = ownRun.findIndex((s) => s.orderId === orderId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ownRun.length) return;
    const a = ownRun[i];
    const b = ownRun[j];
    const writes = [updateOrder(a.orderId, { run_seq: j }), updateOrder(b.orderId, { run_seq: i })];
    // Renumber the rest so sequences stay dense after mixed moves — matches
    // the prototype's own `seq.forEach(...)` cleanup pass (index `k` is the
    // position in the FULL own-run list, not a filtered sub-list).
    ownRun.forEach((s, k) => {
      if (s.orderId !== a.orderId && s.orderId !== b.orderId && s.runSeq !== k) {
        writes.push(updateOrder(s.orderId, { run_seq: k }));
      }
    });
    await Promise.all(writes);
    refetch();
  }

  return { mine, others, loading, error, markDelivered, moveStop, refetch };
}
