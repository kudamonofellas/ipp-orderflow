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
import { PIPELINE_STAGES, RETURN_STAGES, STAGE_LABELS, type Stage } from '../lib/pipeline';

/** Ordered stage keys for the grid: main pipeline then return workflow. */
const STAGE_ORDER: Stage[] = [
  ...PIPELINE_STAGES.map((s) => s.key),
  ...RETURN_STAGES.map((s) => s.key),
];

/**
 * Map a raw DB status string to a dashboard stage key.
 * Returns null if the status doesn't map to any stage pill.
 */
function statusToStage(status: string | null | undefined): Stage | null {
  if (!status) return null;
  const s = status.toLowerCase();
  // Direct mappings for the values currently in the DB + the new stage names.
  if (s === 'open' || s === 'draft' || s === 'intake' || s === 'new orders') return 'intake';
  if (s === 'cold' || s === 'cold storage' || s === 'cold storage picking') return 'cold';
  if (s === 'finance' || s === 'finance gate' || s === 'finance review') return 'finance';
  if (s === 'production' || s === 'cutting' || s === 'processing')
    return 'production';
  if (s === 'packing') return 'packing';
  if (s === 'finalise' || s === 'finalize' || s === 'print do/si' || s === 'print do')
    return 'finalise';
  if (s === 'dispatch') return 'dispatch';
  if (s === 'delivered') return 'delivered';
  // Return workflow.
  if (s === 'awaiting return') return 'awaiting_return';
  if (s === 'admin action required' || s === 'admin action') return 'admin_action';
  if (s === 'awaiting signed do/si' || s === 'awaiting signed doc') return 'awaiting_signed_doc';
  if (s === 'replacement in transit' || s === 'replacement transit') return 'replacement_transit';
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
  { id: 'cancelled', label: 'Canceled Orders', value: 0, range: 'Today' },
];

const EMPTY_STAGES: StageCount[] = STAGE_ORDER.map((stage) => ({
  stage,
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

      // Metrics: total / delivered / returned / canceled.
      const delivered = byStatus.get('Delivered') ?? 0;
      const returned = byStatus.get('Returned') ?? 0;
      const cancelledCount = (byStatus.get('Cancelled') ?? 0) + (byStatus.get('Canceled') ?? 0);
      setMetrics([
        { id: 'total', label: 'Total Orders', value: total, range: 'Today' },
        { id: 'delivered', label: 'Delivered Orders', value: delivered, range: 'Today' },
        { id: 'returned', label: 'Returned Orders', value: returned, range: 'Today' },
        { id: 'cancelled', label: 'Canceled Orders', value: cancelledCount, range: 'Today' },
      ]);

      // Stage pills: map each status to a stage and sum.
      const stageMap = new Map<Stage, number>();
      for (const [status, count] of byStatus) {
        const stage = statusToStage(status);
        if (stage) {
          stageMap.set(stage, (stageMap.get(stage) ?? 0) + count);
        }
      }
      setStageCounts(
        STAGE_ORDER.map((stage) => ({
          stage,
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
