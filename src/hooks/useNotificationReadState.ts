/**
 * Local "last read" cursor for the notifications feed.
 *
 * `order_history` has no read-tracking field in Directus (adding one is a
 * schema-first unit of its own — see ai-workflow-rules.md), so this is a
 * per-browser UI cache, not a source of truth for business data
 * (architecture.md invariant #2: Directus/Postgres remains authoritative for
 * the actual notification data — this only remembers where the viewer left off).
 *
 * A single timestamp cursor rather than a per-entry read set: "Mark as read"
 * bumps the cursor forward, and anything with `at` after the cursor is unread.
 * ISO 8601 UTC timestamps sort correctly with plain string comparison.
 *
 * `markAllRead` takes the latest entry's own `at` (not just `Date.now()`):
 * `at` is a server-generated Directus timestamp, and if the viewer's local
 * clock is behind the server's, a client-only "now" cursor could never catch
 * up to a recent entry's `at`, leaving it permanently stuck as unread.
 */

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'ipp_notifications_last_read_at';
const EPOCH = new Date(0).toISOString();

function readStoredCursor(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? EPOCH;
  } catch {
    return EPOCH;
  }
}

export function useNotificationReadState() {
  const [lastReadAt, setLastReadAt] = useState<string>(readStoredCursor);

  const markAllRead = useCallback((latestEntryAt?: string) => {
    const now = new Date().toISOString();
    const next = latestEntryAt && latestEntryAt > now ? latestEntryAt : now;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, etc.) — cursor still updates for this session.
    }
    setLastReadAt(next);
  }, []);

  const isUnread = useCallback((at: string) => at > lastReadAt, [lastReadAt]);

  return { isUnread, markAllRead };
}
