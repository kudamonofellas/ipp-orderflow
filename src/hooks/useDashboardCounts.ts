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

import { useCallback, useEffect, useState } from 'react';
import { aggregateOrders } from '../lib/directus';
import type { DashboardMetric, StageCount, DateRangeVal } from '../types/dashboard';
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

/** Helper to convert a range type and value to a Directus order_date query object. */
function getFilterForDateRange(rangeVal: DateRangeVal): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const today = new Date();

  if (rangeVal.type === 'today') {
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    filter.order_date = { _eq: `${yyyy}-${mm}-${dd}` };
  } else if (rangeVal.type === 'week') {
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const format = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    filter.order_date = {
      _between: [format(monday), format(sunday)],
    };
  } else if (rangeVal.type === 'month') {
    if (rangeVal.month) {
      const [yearStr, monthStr] = rangeVal.month.split('-');
      const year = parseInt(yearStr, 10);
      const monthIndex = parseInt(monthStr, 10) - 1;

      const firstDay = new Date(year, monthIndex, 1);
      const lastDay = new Date(year, monthIndex + 1, 0);

      const format = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      filter.order_date = {
        _between: [format(firstDay), format(lastDay)],
      };
    } else {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      filter.order_date = { _starts_with: `${y}-${m}` };
    }
  } else if (rangeVal.type === 'year') {
    const year = rangeVal.year || today.getFullYear();
    filter.order_date = {
      _between: [`${year}-01-01`, `${year}-12-31`],
    };
  } else if (rangeVal.type === 'specific') {
    if (rangeVal.date) {
      filter.order_date = { _eq: rangeVal.date };
    } else {
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      filter.order_date = { _eq: `${yyyy}-${mm}-${dd}` };
    }
  }
  return filter;
}

interface UseDashboardCountsResult {
  metrics: DashboardMetric[];
  stageCounts: StageCount[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
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

export interface RangeWithLabel {
  val: DateRangeVal;
  label: string;
}

export function useDashboardCounts(
  totalRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
  deliveredRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
  returnedRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
  cancelledRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
): UseDashboardCountsResult {
  const [metrics, setMetrics] = useState<DashboardMetric[]>(EMPTY_METRICS);
  const [stageCounts, setStageCounts] = useState<StageCount[]>(EMPTY_STAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // 1. Stage counts (unfiltered by date, grouped by status)
      const stageResultPromise = aggregateOrders({
        aggregate: { count: ['*'] },
        groupBy: ['status'],
      });

      // 2. Metrics (each has its own date filter)
      const totalFilter = getFilterForDateRange(totalRange.val);
      const deliveredFilter = {
        ...getFilterForDateRange(deliveredRange.val),
        status: { _eq: 'Delivered' },
      };
      const returnedFilter = {
        ...getFilterForDateRange(returnedRange.val),
        status: { _eq: 'Returned' },
      };
      const cancelledFilter = {
        ...getFilterForDateRange(cancelledRange.val),
        cancelled: { _eq: true },
      };

      const [stageRes, totalRes, deliveredRes, returnedRes, cancelledRes] = await Promise.all([
        stageResultPromise,
        aggregateOrders({ filter: totalFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: deliveredFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: returnedFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: cancelledFilter, aggregate: { count: ['*'] } }),
      ]);

      if (cancelled) return;

      if (stageRes.error !== null) {
        setError(`Failed to load stage counts: ${stageRes.error}`);
        setLoading(false);
        return;
      }
      if (totalRes.error !== null || deliveredRes.error !== null || returnedRes.error !== null || cancelledRes.error !== null) {
        setError(`Failed to load metrics: ${totalRes.error || deliveredRes.error || returnedRes.error || cancelledRes.error}`);
        setLoading(false);
        return;
      }

      // Build stage counts
      const stageMap = new Map<Stage, number>();
      for (const row of stageRes.data) {
        const status = (row.status as string | null) ?? 'Draft';
        const count = Number(row.count ?? 0);
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

      // Extract metric values
      const totalVal = Number(totalRes.data[0]?.count ?? 0);
      const deliveredVal = Number(deliveredRes.data[0]?.count ?? 0);
      const returnedVal = Number(returnedRes.data[0]?.count ?? 0);
      const cancelledVal = Number(cancelledRes.data[0]?.count ?? 0);

      setMetrics([
        { id: 'total', label: 'Total Orders', value: totalVal, range: totalRange.label },
        { id: 'delivered', label: 'Delivered Orders', value: deliveredVal, range: deliveredRange.label },
        { id: 'returned', label: 'Returned Orders', value: returnedVal, range: returnedRange.label },
        { id: 'cancelled', label: 'Canceled Orders', value: cancelledVal, range: cancelledRange.label },
      ]);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce, totalRange, deliveredRange, returnedRange, cancelledRange]);

  return { metrics, stageCounts, loading, error, refetch };
}
