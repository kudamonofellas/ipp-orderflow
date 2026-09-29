import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon/Icon";
import { useRefresh } from "../../hooks/useRefresh";
import styles from "./PullToRefresh.module.css";

/** How far the finger must travel past the top before a pull counts, in
 *  indicator pixels (so ~120px of actual finger travel at the ratio below). */
const THRESHOLD = 60;
/** The indicator moves at half finger speed, so the gesture feels weighted
 *  rather than stuck to the thumb. */
const DRAG_RATIO = 0.5;

/**
 * Pull-past-the-top to refresh, for touch devices.
 *
 * The app scrolls the document (the shell sets no overflow of its own), so
 * this listens on `window` and only engages at `scrollY === 0`. It renders
 * nothing but the indicator — the page content is untouched, so no page
 * needs to know it exists.
 *
 * Gesture state lives in refs, and the listeners are attached once: with
 * `pull` in the effect's deps instead, the first `setPull` re-ran the effect
 * mid-drag and reset `startY`/`active`, so every later move was ignored and
 * the pull never reached the threshold.
 *
 * Touch only by design: on desktop the automatic foreground/poll refresh
 * covers it, and hijacking a mouse wheel at the top of a page is hostile.
 */
export function PullToRefresh() {
  const { refresh, refreshing } = useRefresh();
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  // Read through a ref so the listeners never need re-attaching when the
  // provider hands back a new `refresh` identity.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const setPullValue = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      startYRef.current = e.touches[0]?.clientY ?? null;
      activeRef.current = startYRef.current !== null;
    };

    const onMove = (e: TouchEvent) => {
      if (!activeRef.current || startYRef.current === null) return;
      const y = e.touches[0]?.clientY ?? 0;
      const distance = (y - startYRef.current) * DRAG_RATIO;
      // An upward drag is an ordinary scroll: bail out and stay out until
      // the next touch, so the page doesn't feel caught.
      if (distance <= 0) {
        activeRef.current = false;
        setPullValue(0);
        return;
      }
      setPullValue(Math.min(distance, THRESHOLD * 1.5));
    };

    const onEnd = () => {
      if (activeRef.current && pullRef.current >= THRESHOLD) {
        refreshRef.current();
      }
      activeRef.current = false;
      startYRef.current = null;
      setPullValue(0);
    };

    // Passive: this never calls preventDefault — the browser's own
    // overscroll animation stays, and scrolling is never blocked.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const visible = refreshing || pull > 0;
  if (!visible) return null;

  const ready = pull >= THRESHOLD;

  return (
    <div
      className={styles.indicator}
      style={{ transform: `translateY(${refreshing ? THRESHOLD : pull}px)` }}
      aria-hidden="true"
    >
      <span
        className={`${styles.icon} ${refreshing ? styles.spinning : ""} ${
          ready ? styles.ready : ""
        }`}
      >
        <Icon name="reload" size={18} />
      </span>
    </div>
  );
}
