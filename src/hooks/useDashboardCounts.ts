/**
 * Fetch real order counts from Directus for the dashboard metrics + stage pills.
 *
 * Replaces the mock `metrics` and `stageCounts` exports from mockDashboard.ts.
 * Uses a single aggregate() call grouped by `status` (per code-standards.md:
 * use aggregate() for counts, never readItems() + .length).
 *
 * The real `orders.status` column is a free-text varchar (default 'Draft').
 * The values currently in the DB map to the dashboard as:
 *   - 'Open'    → intake stage + Total Orders metric
 *   - 'Delivered' → delivered stage + Delivered Orders metric
 *   - 'Returned'  → returned (off-pipeline) + Returned Orders metric
 *   - other statuses are counted into their matching stage pill where the
 *     label matches, otherwise ignored.
 *
 * As the pipeline is wired and `orders.stage` replaces `orders.status`, this
 * mapping will move into the domain layer (src/lib/domain.ts).
 */

import { useEffect, useState } from 'react';
import { aggregateOrders } from '../lib/directus';
import type { DashboardMetric, StageCount } from '../types/dashboard';

/** Stage pill labels (order matches the dashboard grid). */
const STAGE_LABELS: Record<string, string> = {
  intake: 'Intake',
  cold: 'Cold Storage',
  finance: 'Finance Gate',
  production: 'Production',
  packing: 'Packing',
  finalise: 'Finalize',
  dispatch: 'Dispatch',
  delivered: 'Delivered',
};

/** Ordered stage keys for the 2×4 grid. */
const STAGE_ORDER: string[] = [
  'intake',
  'cold',
  'finance',
  'production',
  'packing',
  'finalise',
  'dispatch',
  'delivered',
];

/**
 * Map a raw DB status string to a dashboard stage key.
 * Returns null if the status doesn't map to any stage pill.
 */
function statusToStage(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  // Direct mappings for the values currently in the DB.
  if (s === 'open' || s === 'draft' || s === 'intake') return 'intake';
  if (s === 'cold' || s === 'cold storage') return 'cold';
  if (s === 'finance' || s === 'finance gate') return 'finance';
  if (s === 'production' || s === 'cutting' || s === 'packing') return 'production';
  if (s === 'finalise' || s === 'finalize') return 'finalise';
  if (s === 'dispatch') return 'dispatch';
  if (s === 'delivered') return 'delivered';
  return null;
}

interface UseDashboardCountsResult {
  metrics: DashboardMetric[];
  stageCounts: StageCount[];
  loading: boolean;
  error: string | null;
}

/** Empty state used while loading. */
const EMPTY_METRICS: DashboardMetric[] = [
  { id: 'total', label: 'Total Orders', value: 0, range: 'Today' },
  { id: 'delivered', label: 'Delivered Orders', value: 0, range: 'Today' },
  { id: 'returned', label: 'Returned Orders', value: 0, range: 'Today' },
];

const EMPTY_STAGES: StageCount[] = STAGE_ORDER.map((stage) => ({
  stage: stage as StageCount['stage'],
  label: STAGE_LABELS[stage],
  count: 0,
}));

export function useDashboardCounts(): UseDashboardCountsResult {
  const [metrics, setMetrics] = useState<DashboardMetric[]>(EMPTY_METRICS);
  const [stageCounts, setStageCounts] = useState<StageCount[]>(EMPTY_STAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // Single aggregate call: count all orders grouped by status.
      const result = await aggregateOrders({
        aggregate: { count: ['*'] },
        groupBy: ['status'],
      });

      if (cancelled) return;

      if (result.error !== null) {
        setError(`Failed to load counts: ${result.error}`);
        setLoading(false);
        return;
      }

      // Build a status → count lookup.
      const byStatus = new Map<string, number>();
      let total = 0;
      for (const row of result.data) {
        const status = (row.status as string | null) ?? 'Draft';
        const count = Number(row.count ?? 0);
        byStatus.set(status, count);
        total += count;
      }

      // Metrics: total / delivered / returned.
      const delivered = byStatus.get('Delivered') ?? 0;
      const returned = byStatus.get('Returned') ?? 0;
      setMetrics([
        { id: 'total', label: 'Total Orders', value: total, range: 'Today' },
        { id: 'delivered', label: 'Delivered Orders', value: delivered, range: 'Today' },
        { id: 'returned', label: 'Returned Orders', value: returned, range: 'Today' },
      ]);

      // Stage pills: map each status to a stage and sum.
      const stageMap = new Map<string, number>();
      for (const [status, count] of byStatus) {
        const stage = statusToStage(status);
        if (stage) {
          stageMap.set(stage, (stageMap.get(stage) ?? 0) + count);
        }
      }
      setStageCounts(
        STAGE_ORDER.map((stage) => ({
          stage: stage as StageCount['stage'],
          label: STAGE_LABELS[stage],
          count: stageMap.get(stage) ?? 0,
        })),
      );

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { metrics, stageCounts, loading, error };
}
