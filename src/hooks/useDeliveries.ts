/**
 * Deliveries — the current courier's run-sheet. Pools orders at `dispatch`
 * assigned to the signed-in user (matched by `taken_by`, a UUID FK to
 * `directus_users.id` — not the display name) or unassigned (ported from the
 * prototype's `myDeliveries`/`takenByMe` predicate — unassigned dispatch
 * orders count as "mine" for anyone, same caveat the prototype had), ordered
 * by delivery time as a stand-in sequence (the live schema has no
 * `runSeq`-style column yet — see prototype-audit.md's Deliveries notes).
 *
 * COD-ness and the amount to collect use the same source as `useCashUp`:
 * `customers.pay_timing === 'cod'` and the order total (`order_lines`
 * qty×price), since neither `orders` nor `delivery_proofs` has a dedicated
 * COD-amount column.
 */

import { useEffect, useState } from 'react';
import { readOrders, readCustomers, readOrderLines, updateOrder, appendOrderHistory } from '../lib/directus';

export interface DeliveryStop {
  orderId: string;
  orderNo: string;
  customerName: string;
  address: string | null;
  isCOD: boolean;
  amount: number;
  sequence: number;
}

interface UseDeliveriesResult {
  stops: DeliveryStop[];
  loading: boolean;
  error: string | null;
  markDelivered: (orderId: string, userId: string | null) => Promise<{ error: string | null }>;
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

export function useDeliveries(courierId: string | null): UseDeliveriesResult {
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // `orders.taken_by` is a UUID FK to directus_users.id, not a display
      // name — comparing it against a name string makes Postgres reject the
      // uuid cast (surfaces as a generic "unexpected error"). Filter on the
      // signed-in user's id instead.
      const takenByOr: Record<string, unknown>[] = [{ taken_by: { _null: true } }];
      if (courierId) takenByOr.push({ taken_by: { _eq: courierId } });

      const ordersRes = await readOrders({
        filter: {
          _and: [
            { stage: { _eq: 'dispatch' } },
            { cancelled: { _neq: true } },
            { _or: takenByOr },
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
      const orders = ordersRes.data ?? [];
      if (orders.length === 0) {
        setStops([]);
        setLoading(false);
        return;
      }

      const customerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => !!id))];
      const orderIds = orders.map((o) => o.id);

      const [customersRes, linesRes] = await Promise.all([
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

      const built: DeliveryStop[] = orders.map((order, i) => ({
        orderId: order.id,
        orderNo: order.no ?? '—',
        customerName: order.customer_name ?? '—',
        address: order.customer_address ?? null,
        isCOD: order.customer_id ? (codByCustomer.get(order.customer_id) ?? false) : false,
        amount: totalByOrder.get(order.id) ?? 0,
        sequence: i + 1,
      }));

      setStops(built);
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

  return { stops, loading, error, markDelivered, refetch };
}
