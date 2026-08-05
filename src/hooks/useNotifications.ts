/**
 * Dashboard-wide activity feed for the NotificationsPopover: recent
 * order_history rows across ALL orders (not just one), joined against
 * `orders` for a human-readable order number, grouped by calendar day.
 */

import { useEffect, useState } from 'react';
import { readOrderHistoryFeed, readOrders } from '../lib/directus';
import type { NotificationEntry, NotificationGroup } from '../types/dashboard';

/** Recent rows only — this is an activity feed, not a full audit log. */
const FEED_LIMIT = 60;

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

interface UseNotificationsResult {
  groups: NotificationGroup[];
  loading: boolean;
  error: string | null;
}

export function useNotifications(): UseNotificationsResult {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const historyRes = await readOrderHistoryFeed({
        fields: ['id', 'order_id', 'at', 'what'],
        sort: ['-at'],
        limit: FEED_LIMIT,
      });

      if (cancelled) return;

      if (historyRes.error !== null) {
        setError(`Failed to load notifications: ${historyRes.error}`);
        setLoading(false);
        return;
      }

      const rows = historyRes.data ?? [];

      // Batch-resolve order UUIDs -> human order numbers (order_history only stores the UUID).
      const orderIds = Array.from(
        new Set(rows.map((r) => r.order_id).filter((id): id is string => !!id)),
      );

      let labelByOrderId = new Map<string, string>();
      if (orderIds.length > 0) {
        const ordersRes = await readOrders({
          filter: { id: { _in: orderIds } },
          fields: ['id', 'no', 'order_id'],
          limit: -1,
        });
        if (!cancelled && ordersRes.data) {
          labelByOrderId = new Map(
            ordersRes.data.map((o) => [o.id, o.no || o.order_id || o.id.slice(0, 8)]),
          );
        }
      }

      if (cancelled) return;

      // Rows are sorted -at desc, so the first time a day is seen it's inserted
      // newest-day-first; Map preserves that insertion order.
      const byDay = new Map<string, { heading: string; entries: NotificationEntry[] }>();
      for (const row of rows) {
        if (!row.at) continue;
        const key = dayKey(row.at);
        const bucket = byDay.get(key) ?? { heading: formatDateHeading(row.at), entries: [] };
        bucket.entries.push({
          id: String(row.id ?? `${row.order_id}-${row.at}`),
          at: row.at,
          time: formatTime(row.at),
          orderId: row.order_id ? (labelByOrderId.get(row.order_id) ?? row.order_id) : '—',
          orderUuid: row.order_id ?? '',
          action: row.what,
        });
        byDay.set(key, bucket);
      }

      setGroups(
        Array.from(byDay.values()).map((b) => ({ date: b.heading, entries: b.entries })),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { groups, loading, error };
}
