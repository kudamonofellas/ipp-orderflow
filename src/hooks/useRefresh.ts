/**
 * Accessors for the app-wide refresh signal (see `refresh-context.ts`).
 *
 * `useRefreshSignal()` is what data hooks use: list it in the fetch effect's
 * deps and the hook refetches whenever the app refreshes. It returns 0 when
 * no provider is mounted (tests, isolated stories), so a hook stays usable
 * outside the app shell.
 */

import { useContext } from 'react';
import { RefreshContext, type RefreshState } from './refresh-context';

export function useRefreshSignal(): number {
  return useContext(RefreshContext)?.signal ?? 0;
}

export function useRefresh(): RefreshState {
  const ctx = useContext(RefreshContext);
  return (
    ctx ?? { signal: 0, refresh: () => {}, refreshing: false }
  );
}
