/**
 * "Needs Attention" buckets — high-signal action items per
 * project-overview.md ("late deliveries, unpaid due today, missing weigh
 * photo, return pending receive" + "Finance approval, Print DO, Delivery
 * proof missing — with counts").
 *
 * Each bucket's `id` doubles as the Orders-page stage filter key so a click
 * can `navigate('/orders', { state: { stage: item.id } })` — same pattern as
 * the Dashboard's StagePill / ReturnWorkflowsPanel clicks.
 */

import { useEffect, useState } from 'react';
import { aggregateOrders } from '../lib/directus';
import type { AttentionItem } from '../types/dashboard';

function extractCount(val: unknown): number {
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const star = obj['*'] ?? Object.values(obj)[0];
    return extractCount(star);
  }
  return 0;
}

interface Bucket {
  key: string;
  label: string;
  filter: Record<string, unknown>;
}

/** Buckets with a static filter (the "late" bucket needs a fresh cutoff each load — see `lateBucket()`). */
const BUCKETS: Bucket[] = [
  {
    key: 'pending-docs',
    label: 'Signed DO/SI not returned yet',
    filter: { _and: [{ stage: { _eq: 'delivered' } }, { docs_returned: { _neq: true } }] },
  },
  {
    key: 'finance',
    label: 'Orders awaiting finance approval',
    filter: {
      _or: [
        { stage: { _eq: 'finance' } },
        {
          _and: [
            { stage: { _eq: 'cold' } },
            { hold: { _neq: true } },
            { payment_confirmed: { _neq: true } },
          ],
        },
      ],
    },
  },
  {
    key: 'finalise',
    label: 'Orders ready to print DO/SI',
    filter: { stage: { _eq: 'finalise' } },
  },
  {
    key: 'awaiting_return',
    label: 'Returns awaiting warehouse receipt',
    filter: { stage: { _eq: 'awaiting_return' } },
  },
  {
    key: 'admin_action',
    label: 'Returns needing admin action',
    filter: { stage: { _eq: 'admin_action' } },
  },
];

/** Orders whose delivery date has passed but aren't in a terminal stage yet. */
function lateBucket(): Bucket {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.toISOString();
  return {
    key: 'late',
    label: 'Orders past their delivery date',
    filter: {
      _and: [
        { stage: { _nin: ['delivered', 'cancelled', 'returned'] } },
        { cancelled: { _neq: true } },
        {
          _or: [
            { delivery_date: { _lt: cutoff } },
            { deliver_at: { _lt: cutoff } },
          ],
        },
      ],
    },
  };
}

interface UseAttentionItemsResult {
  items: AttentionItem[];
  loading: boolean;
  error: string | null;
}

export function useAttentionItems(): UseAttentionItemsResult {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const buckets = [...BUCKETS, lateBucket()];
      const results = await Promise.all(
        buckets.map((b) =>
          aggregateOrders({ filter: b.filter, aggregate: { count: ['*'] } }),
        ),
      );

      if (cancelled) return;

      const failed = results.find((r) => r.error !== null);
      if (failed) {
        setError(`Failed to load attention items: ${failed.error}`);
        setLoading(false);
        return;
      }

      const built = buckets
        .map((b, i) => ({
          id: b.key,
          label: b.label,
          count: results[i].data ? extractCount(results[i].data[0]?.count) : 0,
        }))
        .filter((item) => item.count > 0);

      setItems(built);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}
