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

/** Helper to convert a range type and value to timezone-accurate filter on specific date fields. */
function getFilterForField(rangeVal: DateRangeVal, field: 'order_date' | 'delivered_at' | 'created_at' | 'updated_at'): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const today = new Date();
  const isDatetime = field === 'delivered_at' || field === 'created_at' || field === 'updated_at';

  // Helper to format Date to YYYY-MM-DD
  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let start: Date;
  let end: Date;

  if (rangeVal.type === 'today') {
    start = new Date(today);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 1);
  } else if (rangeVal.type === 'week') {
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    start = new Date(today);
    start.setDate(today.getDate() + distanceToMonday);
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else if (rangeVal.type === 'month') {
    if (rangeVal.month) {
      const [yearStr, monthStr] = rangeVal.month.split('-');
      const year = parseInt(yearStr, 10);
      const monthIndex = parseInt(monthStr, 10) - 1;
      start = new Date(year, monthIndex, 1);
      end = new Date(year, monthIndex + 1, 1);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }
  } else if (rangeVal.type === 'year') {
    const year = rangeVal.year || today.getFullYear();
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
  } else if (rangeVal.type === 'specific') {
    if (rangeVal.date) {
      start = new Date(rangeVal.date + 'T00:00:00');
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    } else {
      start = new Date(today);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    }
  } else {
    start = new Date(today);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 1);
  }

  if (isDatetime) {
    filter[field] = {
      _between: [start.toISOString(), end.toISOString()],
    };
  } else {
    if (rangeVal.type === 'today' || (rangeVal.type === 'specific' && rangeVal.date)) {
      filter[field] = { _eq: format(start) };
    } else {
      const lastDay = new Date(end.getTime() - 1);
      filter[field] = {
        _between: [format(start), format(lastDay)],
      };
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
  { id: 'open', label: 'Open Orders', value: 0, range: 'All' },
  { id: 'today', label: "Today's Orders", value: 0, range: 'Today' },
  { id: 'delivered', label: 'Delivered Orders', value: 0, range: 'Today' },
  { id: 'cancelled', label: 'Cancelled Orders', value: 0, range: 'Today' },
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
  deliveredRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
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

      // 2. Metrics (each has its own filter/logic)
      // Open Orders: exclude terminal stages ('delivered', 'cancelled', 'returned')
      const openFilter = {
        _and: [
          { cancelled: { _neq: true } },
          { stage: { _nin: ['delivered', 'cancelled', 'returned'] } },
        ],
      };

      // Today's Orders: filter by creation date = today
      const todayFilter = getFilterForField({ type: 'today' }, 'created_at');

      // Delivered: stage === 'delivered', period range
      const deliveredFilter = {
        _and: [
          { stage: { _eq: 'delivered' } },
          getFilterForField(deliveredRange.val, 'delivered_at'),
        ],
      };

      // Cancelled: cancelled === true, period range
      const cancelledFilter = {
        _and: [
          { cancelled: { _eq: true } },
          getFilterForField(cancelledRange.val, 'updated_at'),
        ],
      };

      const [stageRes, openRes, todayRes, deliveredRes, cancelledRes] = await Promise.all([
        stageResultPromise,
        aggregateOrders({ filter: openFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: todayFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: deliveredFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: cancelledFilter, aggregate: { count: ['*'] } }),
      ]);

      if (cancelled) return;

      if (stageRes.error !== null) {
        setError(`Failed to load stage counts: ${stageRes.error}`);
        setLoading(false);
        return;
      }
      if (
        openRes.error !== null ||
        todayRes.error !== null ||
        deliveredRes.error !== null ||
        cancelledRes.error !== null
      ) {
        setError(
          `Failed to load metrics: ${
            openRes.error || todayRes.error || deliveredRes.error || cancelledRes.error
          }`,
        );
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
      const openVal = Number(openRes.data[0]?.count ?? 0);
      const todayVal = Number(todayRes.data[0]?.count ?? 0);
      const deliveredVal = Number(deliveredRes.data[0]?.count ?? 0);
      const cancelledVal = Number(cancelledRes.data[0]?.count ?? 0);

      setMetrics([
        { id: 'open', label: 'Open Orders', value: openVal, range: 'All' },
        { id: 'today', label: "Today's Orders", value: todayVal, range: 'Today' },
        { id: 'delivered', label: 'Delivered Orders', value: deliveredVal, range: deliveredRange.label },
        { id: 'cancelled', label: 'Cancelled Orders', value: cancelledVal, range: cancelledRange.label },
      ]);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce, deliveredRange, cancelledRange]);

  return { metrics, stageCounts, loading, error, refetch };
}
