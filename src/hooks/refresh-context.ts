/**
 * App-wide "refetch your data now" signal.
 *
 * Every data hook already exposes its own `refetch`, but nothing told them
 * when the underlying rows changed — a page fetched once on mount and then
 * went stale while someone else moved orders through the pipeline. Instead
 * of wiring each page to each hook, hooks subscribe to the counter here and
 * include it in their fetch effect's deps: bumping it refetches everything
 * mounted, at once.
 *
 * Kept separate from the provider component so this file exports no
 * component (react-refresh/only-export-components).
 */

import { createContext } from 'react';

export interface RefreshState {
  /** Monotonic counter — a data hook lists this in its effect deps. */
  signal: number;
  /** Bump the counter (pull-to-refresh, or any explicit "refresh" control). */
  refresh: () => void;
  /** True for a moment after a refresh, for spinners. */
  refreshing: boolean;
}

export const RefreshContext = createContext<RefreshState | null>(null);
