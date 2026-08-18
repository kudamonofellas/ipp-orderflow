/**
 * Dashboard-wide activity feed for the NotificationsPopover: recent
 * order_history rows across ALL orders (not just one), joined against
 * `orders` for a human-readable order number, grouped by calendar day.
 *
 * Loaded in batches (`PAGE_SIZE` rows per fetch) rather than one large
 * up-front fetch — the popover calls `loadMore()` as the user scrolls near
 * the bottom of the list, so opening the bell doesn't wait on (or pay for)
 * more rows than what's actually visible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { readOrderHistoryFeed, readOrders } from '../lib/directus';
import { useCan } from './useAuth';
import { redactHistoryPrices } from '../lib/redactHistory';
import type { NotificationEntry, NotificationGroup } from '../types/dashboard';

/** Rows fetched per batch — both the initial load and every `loadMore()`. */
const PAGE_SIZE = 20;

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--.--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--.--';
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Calendar-day bucket key in local time (not UTC — "today" should match the viewer's day). */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface DayBucket {
  heading: string;
  entries: NotificationEntry[];
}

interface UseNotificationsResult {
  groups: NotificationGroup[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
}

export function useNotifications(): UseNotificationsResult {
  const canSeePrices = useCan()('seePrices');
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mutable accumulators, persisted across batches without forcing a
  // useEffect dependency on `groups` (which would re-trigger this hook's own
  // fetch). Insertion order into `byDay` matches arrival order (rows are
  // always fetched sorted -at desc), so days never need re-sorting.
  const byDayRef = useRef<Map<string, DayBucket>>(new Map());
  const labelByOrderIdRef = useRef<Map<string, string>>(new Map());
  const offsetRef = useRef(0);
  // An incrementing generation counter, not a boolean — React 18 StrictMode
  // double-invokes this hook's mount effect in dev (mount → cleanup →
  // mount), and a plain `cancelledRef.current = true/false` boolean gets
  // reset back to false by the *second* mount before the *first* call's
  // async continuation resumes, so its stale results still land and
  // duplicate every entry. Each call captures the epoch at start and only
  // applies its results if the epoch is still current when it resumes.
  const epochRef = useRef(0);

  const fetchBatch = useCallback(async () => {
    const myEpoch = epochRef.current;
    const historyRes = await readOrderHistoryFeed({
      fields: ['id', 'order_id', 'at', 'what'],
      sort: ['-at'],
      limit: PAGE_SIZE,
      offset: offsetRef.current,
    });

    if (epochRef.current !== myEpoch) return;

    if (historyRes.error !== null) {
      setError(`Failed to load notifications: ${historyRes.error}`);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const rows = historyRes.data ?? [];
    offsetRef.current += rows.length;
    setHasMore(rows.length === PAGE_SIZE);

    const unresolvedIds = Array.from(
      new Set(
        rows
          .map((r) => r.order_id)
          .filter((id): id is string => !!id && !labelByOrderIdRef.current.has(id)),
      ),
    );

    if (unresolvedIds.length > 0) {
      const ordersRes = await readOrders({
        filter: { id: { _in: unresolvedIds } },
        fields: ['id', 'no'],
        limit: -1,
      });
      if (epochRef.current !== myEpoch) return;
      if (ordersRes.data) {
        for (const o of ordersRes.data) {
          labelByOrderIdRef.current.set(o.id, o.no || o.id.slice(0, 8));
        }
      }
    }

    for (const row of rows) {
      if (!row.at) continue;
      // A row whose entire content was a price change (e.g. a line-price-only
      // edit) redacts to `null` — drop it rather than show a hollow "Edited —"
      // with nothing after it, per explicit product decision: hide the whole
      // notification, don't just mask the figure.
      const action = canSeePrices ? row.what : redactHistoryPrices(row.what);
      if (action === null) continue;
      const key = dayKey(row.at);
      const bucket = byDayRef.current.get(key) ?? {
        heading: formatDateHeading(row.at),
        entries: [],
      };
      bucket.entries.push({
        id: String(row.id ?? `${row.order_id}-${row.at}`),
        at: row.at,
        time: formatTime(row.at),
        orderId: row.order_id
          ? (labelByOrderIdRef.current.get(row.order_id) ?? row.order_id)
          : '—',
        orderUuid: row.order_id ?? '',
        action,
      });
      byDayRef.current.set(key, bucket);
    }

    setGroups(
      Array.from(byDayRef.current.values()).map((b) => ({
        date: b.heading,
        entries: b.entries,
      })),
    );
  }, [canSeePrices]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const myEpoch = epochRef.current;
    setLoadingMore(true);
    fetchBatch().finally(() => {
      if (epochRef.current === myEpoch) setLoadingMore(false);
    });
  }, [fetchBatch, loading, loadingMore, hasMore]);

  useEffect(() => {
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    fetchBatch().finally(() => {
      if (epochRef.current === myEpoch) setLoading(false);
    });
    return () => {
      epochRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { groups, loading, loadingMore, hasMore, loadMore, error };
}
