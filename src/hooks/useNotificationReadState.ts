/**
 * Local read-state for the notifications feed: a "last read" cursor plus a
 * small set of individually-read entry ids newer than that cursor.
 *
 * `order_history` has no read-tracking field in Directus (adding one is a
 * schema-first unit of its own — see ai-workflow-rules.md), so this is a
 * per-browser UI cache, not a source of truth for business data
 * (architecture.md invariant #2: Directus/Postgres remains authoritative for
 * the actual notification data — this only remembers where the viewer left off).
 *
 * Why cursor + id set, not just one or the other:
 * - A single cursor alone can't represent "I read this one specific item but
 *   not the newer ones above it" — clicking one entry would have to move the
 *   cursor past it, silently marking every other unread entry above it read too.
 * - A bare id set alone would grow forever as history accumulates.
 * "Mark all as read" bumps the cursor forward *and* clears the id set (now
 * redundant — the cursor already covers everything up to that point), so the
 * set only ever holds ids for items newer than the cursor that were opened
 * individually.
 *
 * `markAllRead` takes the latest entry's own `at` (not just `Date.now()`):
 * `at` is a server-generated Directus timestamp, and if the viewer's local
 * clock is behind the server's, a client-only "now" cursor could never catch
 * up to a recent entry's `at`, leaving it permanently stuck as unread.
 */

import { useCallback, useState } from 'react';

const CURSOR_KEY = 'ipp_notifications_last_read_at';
const READ_IDS_KEY = 'ipp_notifications_read_ids';
const EPOCH = new Date(0).toISOString();

function readStoredCursor(): string {
  try {
    return localStorage.getItem(CURSOR_KEY) ?? EPOCH;
  } catch {
    return EPOCH;
  }
}

function readStoredReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable (private mode, etc.) — state still updates for this session.
  }
}

export interface ReadableEntry {
  id: string;
  at: string;
}

export function useNotificationReadState() {
  const [lastReadAt, setLastReadAt] = useState<string>(readStoredCursor);
  const [readIds, setReadIds] = useState<Set<string>>(readStoredReadIds);

  /** Mark exactly one entry read — does not affect any other entry. */
  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback((latestEntryAt?: string) => {
    const now = new Date().toISOString();
    const next = latestEntryAt && latestEntryAt > now ? latestEntryAt : now;
    try {
      localStorage.setItem(CURSOR_KEY, next);
      localStorage.removeItem(READ_IDS_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — state still updates for this session.
    }
    setLastReadAt(next);
    setReadIds(new Set());
  }, []);

  const isUnread = useCallback(
    (entry: ReadableEntry) => entry.at > lastReadAt && !readIds.has(entry.id),
    [lastReadAt, readIds],
  );

  return { isUnread, markAllRead, markRead };
}
