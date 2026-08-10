/**
 * "Needs attention today" / "Done today" digest — Admin + Owner only (see
 * `Dashboard.tsx`). Every number here reuses a filter shape that already
 * exists elsewhere in the app (Orders page stage filters, `useAttentionItems`,
 * `useCashUp`, `returnsInFlightFilter`) so the digest can never disagree with
 * what a click-through actually shows — the same bug class fixed for the
 * Pick List count earlier this session.
 */

import { useEffect, useState } from 'react';
import { aggregateOrders, readOrderHistoryFeed, readOrderLines } from '../lib/directus';
import { returnsInFlightFilter } from '../lib/pipeline';

export interface TodayDigest {
  newOrdersToday: number;
  onTheRoad: number;
  returnsInFlight: number;
  docsNotBack: number;
  deliveredToday: number;
  codCollectedTodayCount: number;
  codCollectedTodayAmount: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: Omit<TodayDigest, 'loading' | 'error'> = {
  newOrdersToday: 0,
  onTheRoad: 0,
  returnsInFlight: 0,
  docsNotBack: 0,
  deliveredToday: 0,
  codCollectedTodayCount: 0,
  codCollectedTodayAmount: 0,
};

function extractCount(val: unknown): number {
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return extractCount(obj['*'] ?? Object.values(obj)[0]);
  }
  return 0;
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

/** Only fetched when `enabled` — callers should pass `role === 'Admin' || role === 'Owner'`. */
export function useTodayDigest(enabled: boolean): TodayDigest {
  const [digest, setDigest] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      const startISO = todayStart.toISOString();
      const endISO = todayEnd.toISOString();

      const [
        newOrdersRes,
        onTheRoadRes,
        returnsRes,
        docsNotBackRes,
        deliveredRes,
        codHistoryRes,
      ] = await Promise.all([
        aggregateOrders({
          filter: {
            _or: [
              { _and: [{ order_date: { _gte: startISO } }, { order_date: { _lt: endISO } }] },
              { _and: [{ created_at: { _gte: startISO } }, { created_at: { _lt: endISO } }] },
            ],
          },
          aggregate: { count: ['*'] },
        }),
        aggregateOrders({
          filter: {
            _and: [
              { stage: { _eq: 'dispatch' } },
              {
                _or: [
                  { taken_by: { _nnull: true } },
                  { pickup: { _eq: true } },
                  { third_party: { _eq: true } },
                ],
              },
            ],
          },
          aggregate: { count: ['*'] },
        }),
        aggregateOrders({
          filter: returnsInFlightFilter(),
          aggregate: { count: ['*'] },
        }),
        aggregateOrders({
          filter: {
            _and: [{ stage: { _eq: 'delivered' } }, { docs_returned: { _neq: true } }],
          },
          aggregate: { count: ['*'] },
        }),
        aggregateOrders({
          filter: {
            _and: [
              { stage: { _eq: 'delivered' } },
              { delivered_at: { _gte: startISO } },
              { delivered_at: { _lt: endISO } },
            ],
          },
          aggregate: { count: ['*'] },
        }),
        readOrderHistoryFeed({
          filter: {
            _and: [
              { what: { _eq: 'COD cash reconciled' } },
              { at: { _gte: startISO } },
              { at: { _lt: endISO } },
            ],
          },
          fields: ['id', 'order_id', 'at', 'what'],
          limit: -1,
        }),
      ]);
      if (cancelled) return;

      const firstError = [
        newOrdersRes,
        onTheRoadRes,
        returnsRes,
        docsNotBackRes,
        deliveredRes,
        codHistoryRes,
      ].find((r) => r.error)?.error;
      if (firstError) {
        setError(`Failed to load today's digest: ${firstError}`);
        setLoading(false);
        return;
      }

      // COD collected today: order_history gives us which orders were
      // reconciled today (with a real timestamp, no new column needed) — the
      // amount still requires summing each order's lines, same qty×price
      // calc `useCashUp`/`useDeliveries` already use.
      const codOrderIds = [
        ...new Set(
          (codHistoryRes.data ?? [])
            .map((h) => h.order_id)
            .filter((id): id is string => !!id),
        ),
      ];
      let codCollectedTodayAmount = 0;
      if (codOrderIds.length > 0) {
        const linesRes = await readOrderLines({
          filter: { _and: [{ order_id: { _in: codOrderIds } }, { removed: { _neq: true } }] },
          fields: ['id', 'order_id', 'qty', 'price'],
          limit: -1,
        });
        if (!cancelled && linesRes.data) {
          codCollectedTodayAmount = linesRes.data.reduce(
            (sum, l) => sum + toNumber(l.qty) * toNumber(l.price),
            0,
          );
        }
      }
      if (cancelled) return;

      setDigest({
        newOrdersToday: extractCount(newOrdersRes.data?.[0]?.count),
        onTheRoad: extractCount(onTheRoadRes.data?.[0]?.count),
        returnsInFlight: extractCount(returnsRes.data?.[0]?.count),
        docsNotBack: extractCount(docsNotBackRes.data?.[0]?.count),
        deliveredToday: extractCount(deliveredRes.data?.[0]?.count),
        codCollectedTodayCount: codOrderIds.length,
        codCollectedTodayAmount,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // `loading` state only ever gets driven by the fetch effect above, which
  // never runs when disabled — AND with `enabled` here instead of setting it
  // false from the effect body (that would be a synchronous setState-in-effect).
  return { ...digest, loading: enabled && loading, error };
}
