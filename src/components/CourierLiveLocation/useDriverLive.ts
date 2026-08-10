import { useEffect, useRef } from "react";
import { createCourierLocation } from "../../lib/directus";

const MIN_WRITE_INTERVAL_MS = 20_000;

/**
 * Silent GPS publisher — mount only on the courier's own device while they
 * hold an active own-courier delivery. Watches position via the browser's
 * Geolocation API and persists a `courier_locations` row, throttled to at
 * most one write per ~20s (the browser can report fixes far more often than
 * that; writing every one would be wasteful against a real API/DB, unlike
 * the prototype's free same-tab BroadcastChannel).
 *
 * No UI, no error surfacing — a denied location permission or an offline
 * device just means `CourierLiveLocation` shows "No location yet" elsewhere;
 * that's not worth interrupting the courier's flow over.
 */
export function useDriverLive(active: boolean) {
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastWriteRef.current < MIN_WRITE_INTERVAL_MS) return;
        lastWriteRef.current = now;
        createCourierLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        // Permission denied / unavailable — silent by design, no UI here.
      },
      { enableHighAccuracy: true, maximumAge: 4000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);
}
