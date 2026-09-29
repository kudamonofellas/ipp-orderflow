import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshContext } from './refresh-context';

/** Quiet background poll while a screen is open and visible. Long enough to
 *  be invisible on a phone's battery and on Directus, short enough that a
 *  pipeline someone else is moving stays believable. */
const POLL_MS = 45_000;

/** Ignore a trigger that lands within this of the last refresh — returning
 *  to the app fires `visibilitychange` and `focus` together, and a poll can
 *  land in the same instant. */
const MIN_GAP_MS = 5_000;

/** How long `refreshing` stays true, purely so a spinner is perceptible. */
const SPINNER_MS = 600;

/**
 * Drives the app-wide refresh signal from three sources:
 *
 *  1. the app returning to the foreground (Android fires `visibilitychange`
 *     on the WebView when it resumes) or the window regaining focus,
 *  2. a quiet poll while the app is visible,
 *  3. an explicit `refresh()` — pull-to-refresh today.
 *
 * Polling is stopped whenever the app is hidden, so a backgrounded phone
 * does no network at all.
 */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [signal, setSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastRun = useRef(0);
  const spinnerTimer = useRef<number | null>(null);

  const bump = useCallback((options?: { showSpinner?: boolean }) => {
    const now = Date.now();
    if (now - lastRun.current < MIN_GAP_MS) return;
    lastRun.current = now;
    setSignal((n) => n + 1);
    if (options?.showSpinner) {
      setRefreshing(true);
      if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
      spinnerTimer.current = window.setTimeout(
        () => setRefreshing(false),
        SPINNER_MS,
      );
    }
  }, []);

  const refresh = useCallback(() => {
    // An explicit pull must always do something visible, so it bypasses the
    // gap check that exists only to collapse duplicate automatic triggers.
    lastRun.current = 0;
    bump({ showSpinner: true });
  }, [bump]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    const onFocus = () => bump();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    let interval: number | null = null;
    const startPolling = () => {
      if (interval !== null) return;
      interval = window.setInterval(() => {
        if (document.visibilityState === 'visible') bump();
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityForPolling = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', onVisibilityForPolling);
    if (document.visibilityState === 'visible') startPolling();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('visibilitychange', onVisibilityForPolling);
      window.removeEventListener('focus', onFocus);
      stopPolling();
      if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
    };
  }, [bump]);

  const value = useMemo(
    () => ({ signal, refresh, refreshing }),
    [signal, refresh, refreshing],
  );

  return (
    <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>
  );
}
