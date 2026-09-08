/**
 * Reports — aggregates orders/order_lines/customers for one date range into
 * the stat cards, fulfillment donut, receivables, volume-by-customer, and
 * demand-by-product blocks on the Reports page.
 *
 * Reads the whole range client-side (orders + their lines + their
 * customers) rather than per-widget aggregate() calls — the widgets share
 * too much of the same underlying row set (e.g. "Total Orders" and "Volume
 * by customers" both need every order in range) to justify 6+ separate
 * Directus round-trips. Fine at the report-period scale this is meant for;
 * revisit with server-side aggregation if a range routinely spans thousands
 * of orders.
 */

import { useEffect, useState } from 'react';
import { readOrders, readOrderLines, readCustomers, readOrderHistoryFeed } from '../lib/directus';
import { PIPELINE_STAGES, type PipelineStage } from '../lib/pipeline';

export type ReportRangeType = 'today' | '30d' | '90d' | 'all' | 'month' | 'range';

export interface ReportRange {
  type: ReportRangeType;
  /** 'YYYY-MM' — only used when type === 'month'. */
  month?: string;
  /** 'YYYY-MM-DD' — only used when type === 'range'. */
  from?: string;
  /** 'YYYY-MM-DD' — only used when type === 'range'. */
  to?: string;
}

export interface CustomerVolumeRow {
  customerName: string;
  orders: number;
  weighedKg: number;
}

export interface ProductDemandRow {
  name: string;
  qty: number;
}

export interface ProductDemandGroup {
  unit: string;
  rows: ProductDemandRow[];
}

export interface CycleTimeStage {
  stage: PipelineStage;
  label: string;
  n: number;
  avgHours: number;
}

export interface CycleTimeResult {
  stages: CycleTimeStage[];
  slowest: CycleTimeStage | null;
  measured: number;
}

interface UseReportsResult {
  loading: boolean;
  error: string | null;
  totalOrders: number;
  delivered: number;
  returned: number;
  cancelled: number;
  onTime: { onTimeCount: number; lateCount: number } | null;
  fulfillment: { clean: number; closeShort: number; backOrdered: number; total: number };
  weightVariance: { avgVariancePct: number; sampleCount: number } | null;
  termsOutstanding: number;
  termsOverdue: number;
  customerVolume: CustomerVolumeRow[];
  productDemand: ProductDemandGroup[];
  cycleTime: CycleTimeResult;
}

/** Bottleneck-per-stage — ported from the prototype's `cycleTime()`
 *  (`Dev-reports.js:263-304`): walks each order's history entries, crediting
 *  the time between two consecutive entries to whatever stage the order was
 *  IN during that gap (the first entry is always "Order created", so the
 *  order starts life credited to `intake`). Only forward-pipeline stages
 *  are bucketed (matches the prototype's `STAGES` — a detour through
 *  outstanding/awaiting/returned/cancelled advances `curStage` without ever
 *  being measured itself, so time resumes accruing correctly once the order
 *  is back in a forward stage). Unlike the prototype (which falls back to
 *  scanning `history[i].what` for older entries with no explicit stage),
 *  this port's `appendOrderHistory` always writes `stage` explicitly, so no
 *  text-scan fallback is needed. */
function computeCycleTime(
  orders: { id: string }[],
  historyByOrder: Map<string, { at: string | null; stage: string | null }[]>,
): CycleTimeResult {
  const acc = new Map<PipelineStage, { totalMs: number; n: number }>();
  for (const s of PIPELINE_STAGES) acc.set(s.key, { totalMs: 0, n: 0 });

  for (const o of orders) {
    const h = historyByOrder.get(o.id) ?? [];
    if (h.length < 2) continue;
    let curStage: string = 'intake';
    let curAt = new Date(h[0].at ?? 0).getTime();
    for (let i = 1; i < h.length; i++) {
      const at = new Date(h[i].at ?? 0).getTime();
      if (Number.isFinite(curAt) && Number.isFinite(at) && at >= curAt) {
        const bucket = acc.get(curStage as PipelineStage);
        if (bucket) {
          bucket.totalMs += at - curAt;
          bucket.n++;
        }
      }
      curStage = h[i].stage || curStage;
      curAt = at;
    }
  }

  const stages: CycleTimeStage[] = PIPELINE_STAGES.map((s) => {
    const b = acc.get(s.key)!;
    return {
      stage: s.key,
      label: s.label,
      n: b.n,
      avgHours: b.n ? b.totalMs / b.n / (60 * 60 * 1000) : 0,
    };
  });
  const measured = stages.filter((s) => s.n > 0);
  const slowest = measured.reduce<CycleTimeStage | null>(
    (max, s) => (s.avgHours > (max ? max.avgHours : -1) ? s : max),
    null,
  );
  return { stages, slowest, measured: measured.length };
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function isTerms(payTiming: string | null | undefined): boolean {
  return (payTiming ?? '').trim().toLowerCase() === 'terms';
}

/** Resolves a `ReportRange` into an inclusive-start/exclusive-end ISO pair, or `null` for "All". */
function resolveRange(range: ReportRange): { startISO: string; endISO: string } | null {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range.type === 'today') {
    const end = new Date(todayStart);
    end.setDate(end.getDate() + 1);
    return { startISO: todayStart.toISOString(), endISO: end.toISOString() };
  }
  if (range.type === '30d' || range.type === '90d') {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - (range.type === '30d' ? 30 : 90));
    const end = new Date(todayStart);
    end.setDate(end.getDate() + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (range.type === 'month' && range.month) {
    const [y, m] = range.month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (range.type === 'range' && range.from && range.to) {
    const start = new Date(`${range.from}T00:00:00`);
    const end = new Date(`${range.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  return null;
}

export function useReports(range: ReportRange): UseReportsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Omit<UseReportsResult, 'loading' | 'error'>>({
    totalOrders: 0,
    delivered: 0,
    returned: 0,
    cancelled: 0,
    onTime: null,
    fulfillment: { clean: 0, closeShort: 0, backOrdered: 0, total: 0 },
    weightVariance: null,
    termsOutstanding: 0,
    termsOverdue: 0,
    customerVolume: [],
    productDemand: [],
    cycleTime: { stages: [], slowest: null, measured: 0 },
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const bounds = resolveRange(range);
      const filter = bounds
        ? { _and: [{ order_date: { _gte: bounds.startISO } }, { order_date: { _lt: bounds.endISO } }] }
        : {};

      const ordersRes = await readOrders({
        filter,
        fields: [
          'id',
          'customer_id',
          'customer_name',
          'stage',
          'cancelled',
          'partial_return',
          'order_date',
          'deliver_at',
          'delivery_date',
          'delivered_at',
          'payment_confirmed',
        ],
        limit: -1,
      });
      if (cancelled) return;
      if (ordersRes.error) {
        setError(`Failed to load reports: ${ordersRes.error}`);
        setLoading(false);
        return;
      }
      const orders = ordersRes.data ?? [];

      const activeOrders = orders.filter((o) => !o.cancelled);
      const totalOrders = activeOrders.length;
      const delivered = activeOrders.filter((o) => o.stage === 'delivered').length;
      const returnedCount = activeOrders.filter((o) => o.stage === 'returned').length;
      const cancelledCount = orders.filter((o) => o.cancelled).length;

      // On-time delivery: delivered orders where delivered_at <= the scheduled date.
      const deliveredWithDates = activeOrders.filter(
        (o) => o.stage === 'delivered' && o.delivered_at && (o.deliver_at || o.delivery_date),
      );
      let onTime: UseReportsResult['onTime'] = null;
      if (deliveredWithDates.length > 0) {
        let onTimeCount = 0;
        for (const o of deliveredWithDates) {
          const scheduled = new Date((o.deliver_at || o.delivery_date) as string).getTime();
          const actual = new Date(o.delivered_at as string).getTime();
          if (actual <= scheduled) onTimeCount += 1;
        }
        onTime = { onTimeCount, lateCount: deliveredWithDates.length - onTimeCount };
      }

      // Terms receivables — needs each order's customer.pay_timing.
      const customerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => !!id))];
      const customersRes =
        customerIds.length === 0
          ? { data: [], error: null }
          : await readCustomers({
              filter: { id: { _in: customerIds } },
              // `name` is required (non-optional) in CustomersCollectionSchema —
              // must be requested even though it's unused here, or zod parsing fails.
              fields: ['id', 'name', 'pay_timing'],
              limit: -1,
            });
      if (cancelled) return;
      if (customersRes.error) {
        setError(`Failed to load reports: ${customersRes.error}`);
        setLoading(false);
        return;
      }
      const termsByCustomer = new Map((customersRes.data ?? []).map((c) => [c.id, isTerms(c.pay_timing)]));

      const todayISO = new Date().toISOString();
      let termsOutstanding = 0;
      let termsOverdue = 0;
      for (const o of activeOrders) {
        if (!o.customer_id || !termsByCustomer.get(o.customer_id)) continue;
        if (o.payment_confirmed) continue;
        termsOutstanding += 1;
        const due = o.deliver_at || o.delivery_date;
        if (due && due < todayISO) termsOverdue += 1;
      }

      // Lines for fulfillment status, weight variance, volume-by-customer kg, and demand-by-product.
      const orderIds = orders.map((o) => o.id);
      const linesRes =
        orderIds.length === 0
          ? { data: [], error: null }
          : await readOrderLines({
              filter: { _and: [{ order_id: { _in: orderIds } }, { removed: { _neq: true } }] },
              // `id` is required (non-optional) in OrderLinesCollectionSchema —
              // must be requested even though it's unused here, or zod parsing fails.
              fields: ['id', 'order_id', 'name', 'qty', 'unit', 'weight', 'short'],
              limit: -1,
            });
      if (cancelled) return;
      if (linesRes.error) {
        setError(`Failed to load reports: ${linesRes.error}`);
        setLoading(false);
        return;
      }
      const lines = linesRes.data ?? [];
      const linesByOrder = new Map<string, typeof lines>();
      for (const line of lines) {
        if (!line.order_id) continue;
        const existing = linesByOrder.get(line.order_id) ?? [];
        existing.push(line);
        linesByOrder.set(line.order_id, existing);
      }

      // Fulfillment donut: back-ordered (returned/partial_return) takes priority
      // over close-short (any line flagged short at weigh) over clean.
      let closeShort = 0;
      let backOrdered = 0;
      for (const o of activeOrders) {
        if (o.stage === 'returned' || o.partial_return) {
          backOrdered += 1;
          continue;
        }
        const orderLines = linesByOrder.get(o.id) ?? [];
        if (orderLines.some((l) => l.short)) closeShort += 1;
      }
      const clean = Math.max(0, totalOrders - closeShort - backOrdered);

      // Weight variance: catch-weight lines with both an ordered qty and an actual weighed figure.
      const weighedLines = lines.filter((l) => toNumber(l.qty) > 0 && toNumber(l.weight) > 0);
      let weightVariance: UseReportsResult['weightVariance'] = null;
      if (weighedLines.length > 0) {
        const pctSum = weighedLines.reduce((sum, l) => {
          const ordered = toNumber(l.qty);
          const actual = toNumber(l.weight);
          return sum + ((actual - ordered) / ordered) * 100;
        }, 0);
        weightVariance = {
          avgVariancePct: pctSum / weighedLines.length,
          sampleCount: weighedLines.length,
        };
      }

      // Volume by customer: order count + summed weighed kg per customer.
      const volumeByCustomer = new Map<string, CustomerVolumeRow>();
      for (const o of activeOrders) {
        const key = o.customer_name ?? '—';
        const row = volumeByCustomer.get(key) ?? { customerName: key, orders: 0, weighedKg: 0 };
        row.orders += 1;
        const orderLines = linesByOrder.get(o.id) ?? [];
        for (const l of orderLines) {
          if ((l.unit ?? '').toLowerCase() === 'kg') row.weighedKg += toNumber(l.weight || l.qty);
        }
        volumeByCustomer.set(key, row);
      }
      const customerVolume = [...volumeByCustomer.values()].sort((a, b) => b.orders - a.orders);

      // Demand by product: qty summed per (unit, product name), grouped by unit.
      const demandByUnit = new Map<string, Map<string, number>>();
      for (const o of activeOrders) {
        const orderLines = linesByOrder.get(o.id) ?? [];
        for (const l of orderLines) {
          const unit = (l.unit ?? 'unit').toLowerCase();
          const byName = demandByUnit.get(unit) ?? new Map<string, number>();
          byName.set(l.name, (byName.get(l.name) ?? 0) + toNumber(l.qty));
          demandByUnit.set(unit, byName);
        }
      }
      const productDemand: ProductDemandGroup[] = [...demandByUnit.entries()]
        // 'pcs' is excluded per an explicit product decision — counted-unit
        // items sold individually aren't a meaningful "demand" leaderboard
        // the way weighed/boxed/packed goods are.
        .filter(([unit]) => unit !== 'pcs')
        .map(([unit, byName]) => ({
          unit,
          rows: [...byName.entries()]
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty),
        }))
        .sort((a, b) => b.rows.length - a.rows.length);

      // Cycle time — needs every order's history entries. One bulk query
      // across the whole scoped order set rather than one round-trip per
      // order (this report can easily span hundreds of orders).
      const historyRes =
        orderIds.length === 0
          ? { data: [], error: null }
          : await readOrderHistoryFeed({
              filter: { order_id: { _in: orderIds } },
              fields: ['order_id', 'at', 'stage'],
              sort: ['order_id', 'at'],
              limit: -1,
            });
      if (cancelled) return;
      const historyByOrder = new Map<string, { at: string | null; stage: string | null }[]>();
      if (!historyRes.error) {
        for (const row of historyRes.data ?? []) {
          if (!row.order_id) continue;
          const existing = historyByOrder.get(row.order_id) ?? [];
          existing.push({ at: row.at ?? null, stage: row.stage ?? null });
          historyByOrder.set(row.order_id, existing);
        }
      }
      const cycleTime = computeCycleTime(orders, historyByOrder);

      if (cancelled) return;
      setResult({
        totalOrders,
        delivered,
        returned: returnedCount,
        cancelled: cancelledCount,
        onTime,
        fulfillment: { clean, closeShort, backOrdered, total: totalOrders },
        weightVariance,
        termsOutstanding,
        termsOverdue,
        customerVolume,
        productDemand,
        cycleTime,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return { ...result, loading, error };
}
