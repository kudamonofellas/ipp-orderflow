/**
 * "Needs Attention" buckets — high-signal action items per
 * project-overview.md ("late deliveries, unpaid due today, missing weigh
 * photo, return pending receive" + "Finance approval, Print DO, Delivery
 * proof missing — with counts").
 *
 * Each bucket's `id` doubles as the Orders-page stage filter key so a click
 * can `navigate(\`/orders?stage=${item.id}\`)` — same pattern as the
 * Dashboard's StagePill / ReturnWorkflowsPanel clicks.
 */

import { useEffect, useState } from 'react';
import { aggregateOrders } from '../lib/directus';
import { useCan } from './useAuth';
import type { Capability } from '../lib/domain';
import { financeParallelQueueFilter, openOrdersFilter } from '../lib/pipeline';
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
  /**
   * Capability that "owns" this bucket — used to surface the current role's
   * own items first (see F-03 in prototype-audit.md: role-owned items were
   * buried at a fixed list length). Buckets without one (e.g. `late`) are
   * relevant to every role, matching the prototype's own attention list,
   * where most entries are intentionally left unfiltered.
   */
  capability?: Capability;
}

/** Buckets with a static filter (the "late" bucket needs a fresh cutoff each load — see `lateBucket()`). */
const BUCKETS: Bucket[] = [
  {
    key: 'pending-docs',
    label: 'Signed DO/SI not returned yet',
    filter: { _and: [{ stage: { _eq: 'delivered' } }, { docs_returned: { _neq: true } }] },
    capability: 'printDocuments',
  },
  {
    key: 'finance',
    label: 'Orders awaiting finance approval',
    filter: {
      _or: [{ stage: { _eq: 'finance' } }, financeParallelQueueFilter()],
    },
    capability: 'approveFinance',
  },
  {
    key: 'finalise',
    label: 'Orders ready to print DO/SI',
    filter: { stage: { _eq: 'finalise' } },
    capability: 'printDocuments',
  },
  {
    key: 'awaiting_return',
    label: 'Returns awaiting warehouse receipt',
    filter: { stage: { _eq: 'awaiting_return' } },
    capability: 'receiveReturns',
  },
  {
    key: 'admin_action',
    label: 'Returns needing admin action',
    filter: { stage: { _eq: 'admin_action' } },
    capability: 'decideReturns',
  },
];

/** Orders whose delivery date has passed but aren't in a terminal stage yet. */
function lateBucket(): Bucket {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.toISOString();
  const { _and: openConds } = openOrdersFilter() as { _and: unknown[] };
  return {
    key: 'late',
    label: 'Orders past their delivery date',
    filter: {
      _and: [
        ...openConds,
        {
          _or: [
            { delivery_date: { _lt: cutoff } },
            { deliver_at: { _lt: cutoff } },
          ],
        },
      ],
    },
    // No capability — a past-due delivery is relevant to everyone coordinating
    // the order, not one specific role (matches the prototype, where this
    // exact bucket is also left unfiltered).
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
  const can = useCan();

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
          mine: b.capability ? can(b.capability) : true,
        }))
        .filter((item) => item.count > 0);

      // Role-owned buckets (and role-agnostic ones like `late`) surface first;
      // buckets another role owns sort after. `Array.prototype.sort` is
      // stable, so relative order within each group is preserved. Fixes the
      // role-blindness half of F-03 (prototype-audit.md) — previously every
      // role saw the identical, unordered set of buckets.
      built.sort((a, b) => Number(b.mine) - Number(a.mine));

      setItems(built.map((item) => ({ id: item.id, label: item.label, count: item.count })));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [can]);

  return { items, loading, error };
}
