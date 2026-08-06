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

/**
 * Map a raw DB stage/status string to a dashboard stage key.
 * Returns null if the value doesn't map to any stage pill.
 */
function statusToStage(status: string | null | undefined): Stage | null {
  if (!status) return null;
  const s = status.toLowerCase().trim();
  // Exact stage key matches (main pipeline only — return-workflow counts are
  // computed separately below via returnBucketsForOrder-equivalent filters,
  // since `stage` stays 'returned' the whole time; it never equals these
  // return-bucket keys).
  if (s === 'intake') return 'intake';
  if (s === 'cold') return 'cold';
  if (s === 'finance') return 'finance';
  if (s === 'production') return 'production';
  if (s === 'packing') return 'packing';
  if (s === 'finalise' || s === 'finalize') return 'finalise';
  if (s === 'dispatch') return 'dispatch';
  if (s === 'delivered') return 'delivered';

  // Direct mappings for legacy status values in DB
  if (s === 'open' || s === 'draft' || s === 'new orders') return 'intake';
  if (s === 'cold storage' || s === 'cold storage picking') return 'cold';
  if (s === 'finance gate' || s === 'finance review') return 'finance';
  if (s === 'cutting' || s === 'processing') return 'production';
  if (s === 'print do/si' || s === 'print do') return 'finalise';
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
  { id: 'total', label: 'Total Orders', value: 0, range: 'Today' },
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
  totalRange: RangeWithLabel = { val: { type: 'today' }, label: 'Today' },
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

      // 1. Stage counts (unfiltered by date, grouped by stage)
      const stageResultPromise = aggregateOrders({
        aggregate: { count: ['*'] },
        groupBy: ['stage'],
      });

      // Parallel query for Cold-stage unpaid orders that ALSO count toward Finance Review queue (per domain logic)
      const financeParallelPromise = aggregateOrders({
        filter: {
          _and: [
            { stage: { _eq: 'cold' } },
            { hold: { _neq: true } },
            { payment_confirmed: { _neq: true } },
          ],
        },
        aggregate: { count: ['*'] },
      });

      // Return-workflow buckets are parallel hand-offs, not sequential stage
      // values — `stage` stays 'returned' throughout, so each bucket needs
      // its own field-based filter (mirrors returnBucketsForOrder in pipeline.ts).
      const awaitingReturnPromise = aggregateOrders({
        filter: {
          _and: [
            { stage: { _eq: 'returned' } },
            { _or: [{ return_received: { _neq: true } }, { return_inbound: { _eq: true } }] },
            { return_settle: { _neq: 'done' } },
          ],
        },
        aggregate: { count: ['*'] },
      });
      const adminActionPromise = aggregateOrders({
        filter: {
          _and: [
            { stage: { _eq: 'returned' } },
            { return_settle: { _null: true } },
            { return_doc: { _null: true } },
          ],
        },
        aggregate: { count: ['*'] },
      });
      const awaitingSignedDocPromise = aggregateOrders({
        filter: {
          _and: [{ stage: { _eq: 'returned' } }, { return_settle: { _eq: 'sign' } }],
        },
        aggregate: { count: ['*'] },
      });
      const replacementTransitPromise = aggregateOrders({
        filter: {
          _and: [
            { is_replacement: { _eq: true } },
            { stage: { _nin: ['delivered', 'cancelled'] } },
          ],
        },
        aggregate: { count: ['*'] },
      });

      // 2. Metrics
      // Open Orders: exclude terminal stages ('delivered', 'cancelled', 'returned')
      const openFilter = {
        _and: [
          { cancelled: { _neq: true } },
          { stage: { _nin: ['delivered', 'cancelled', 'returned'] } },
        ],
      };

      // Total Orders: filter by creation date in range
      const totalFilter = getFilterForField(totalRange.val, 'created_at');

      // Delivered Orders: stage === 'delivered', period range
      const deliveredFilter = {
        _and: [
          { stage: { _eq: 'delivered' } },
          getFilterForField(deliveredRange.val, 'delivered_at'),
        ],
      };

      // Cancelled Orders: cancelled === true or stage === 'cancelled', period range
      const cancelledFilter = {
        _and: [
          {
            _or: [
              { cancelled: { _eq: true } },
              { stage: { _eq: 'cancelled' } },
            ],
          },
          getFilterForField(cancelledRange.val, 'updated_at'),
        ],
      };

      const [
        stageRes,
        financeRes,
        awaitingReturnRes,
        adminActionRes,
        awaitingSignedDocRes,
        replacementTransitRes,
        openRes,
        totalRes,
        deliveredRes,
        cancelledRes,
      ] = await Promise.all([
        stageResultPromise,
        financeParallelPromise,
        awaitingReturnPromise,
        adminActionPromise,
        awaitingSignedDocPromise,
        replacementTransitPromise,
        aggregateOrders({ filter: openFilter, aggregate: { count: ['*'] } }),
        aggregateOrders({ filter: totalFilter, aggregate: { count: ['*'] } }),
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
        totalRes.error !== null ||
        deliveredRes.error !== null ||
        cancelledRes.error !== null
      ) {
        setError(
          `Failed to load metrics: ${
            openRes.error || totalRes.error || deliveredRes.error || cancelledRes.error
          }`,
        );
        setLoading(false);
        return;
      }

      // Build stage counts directly from stageRes (avoid double-counting)
      const stageMap = new Map<Stage, number>();
      for (const row of stageRes.data ?? []) {
        const val = (row.stage as string | null) ?? (row.status as string | null) ?? 'Draft';
        const count = extractCount(row.count);
        const stageKey = statusToStage(val);
        if (stageKey) {
          stageMap.set(stageKey, (stageMap.get(stageKey) ?? 0) + count);
        }
      }

      // Add parallel Cold/unpaid orders to Finance Review queue count
      const financeExtra = financeRes.data ? extractCount(financeRes.data[0]?.count) : 0;
      if (financeExtra > 0) {
        stageMap.set('finance', (stageMap.get('finance') ?? 0) + financeExtra);
      }

      // Return-workflow buckets: parallel hand-offs, not stage values — set
      // directly from their own field-based aggregate queries (see above).
      stageMap.set(
        'awaiting_return',
        awaitingReturnRes.data ? extractCount(awaitingReturnRes.data[0]?.count) : 0,
      );
      stageMap.set(
        'admin_action',
        adminActionRes.data ? extractCount(adminActionRes.data[0]?.count) : 0,
      );
      stageMap.set(
        'awaiting_signed_doc',
        awaitingSignedDocRes.data ? extractCount(awaitingSignedDocRes.data[0]?.count) : 0,
      );
      stageMap.set(
        'replacement_transit',
        replacementTransitRes.data ? extractCount(replacementTransitRes.data[0]?.count) : 0,
      );

      setStageCounts(
        STAGE_ORDER.map((stage) => ({
          stage,
          label: STAGE_LABELS[stage],
          count: stageMap.get(stage) ?? 0,
        })),
      );

      // Extract metric values using extractCount
      const openVal = openRes.data ? extractCount(openRes.data[0]?.count) : 0;
      const totalVal = totalRes.data ? extractCount(totalRes.data[0]?.count) : 0;
      const deliveredVal = deliveredRes.data ? extractCount(deliveredRes.data[0]?.count) : 0;
      const cancelledVal = cancelledRes.data ? extractCount(cancelledRes.data[0]?.count) : 0;

      setMetrics([
        { id: 'open', label: 'Open Orders', value: openVal, range: 'All' },
        { id: 'total', label: 'Total Orders', value: totalVal, range: totalRange.label },
        { id: 'delivered', label: 'Delivered Orders', value: deliveredVal, range: deliveredRange.label },
        { id: 'cancelled', label: 'Cancelled Orders', value: cancelledVal, range: cancelledRange.label },
      ]);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce, totalRange, deliveredRange, cancelledRange]);

  return { metrics, stageCounts, loading, error, refetch };
}
