import { useEffect, useState } from "react";
import { readLatestCourierLocation } from "../../lib/directus";
import { formatTakenAt } from "../../lib/format";
import { useLanguage } from "../../hooks/useLanguage";
import { Card } from "../Card/Card";
import { Button } from "../Button/Button";
import type { GeoStamp } from "../../types/directus";
import styles from "./CourierLiveLocation.module.css";

const POLL_INTERVAL_MS = 20_000;

function toNumber(v: number | string | null | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

interface CourierLiveLocationProps {
  /** `directus_users.id` of the courier holding this delivery. */
  courierId: string;
  /** Display name, resolved by the caller (e.g. OrderDetail's own
   *  `displayName()`) — this component has no independent access to the
   *  `directus_users` list, so it never re-fetches this itself. */
  courierName?: string | null;
  /** The one-time GPS stamp taken when the courier captured the
   *  item-condition photo (`orders.pickup_geo`) — distinct from the live
   *  ping this component polls for below. Ported from the prototype's own
   *  "Picked up · {lat,lng} · {time}" row (`Dev-OrderDetail.jsx:1520`). */
  pickupGeo?: GeoStamp | null;
}

/**
 * Badge + keyless Google Maps iframe for a courier's most recent GPS ping,
 * plus the one-time pickup stamp (design: `context/designs/customer-return/
 * live-location.png`). Polls `courier_locations` on the same ~20s cadence
 * `useDriverLive` writes on, so the badge age never lags more than one poll
 * behind reality. Shown only to `trackCourier` capability holders (Admin/
 * Finance by default), only for the own-courier hand-off mode — no
 * location is captured for pickup or 3rd-party hand-offs.
 */
export function CourierLiveLocation({
  courierId,
  courierName,
  pickupGeo,
}: CourierLiveLocationProps) {
  const { t } = useLanguage();
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  // Computed at poll time (inside the effect, not render) so the component
  // stays pure — "seconds ago" only advances when the next poll lands, not
  // on every render.
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await readLatestCourierLocation(courierId);
      if (cancelled) return;
      if (res.data) {
        setLat(toNumber(res.data.lat));
        setLng(toNumber(res.data.lng));
        setSecondsAgo(
          res.data.at
            ? Math.max(
                0,
                Math.round(
                  (Date.now() - new Date(res.data.at).getTime()) / 1000,
                ),
              )
            : null,
        );
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [courierId]);

  if (loading) return null;
  if (lat === null || lng === null) {
    return (
      <p className={`tiny muted ${styles.noLocation}`}>
        {t("No location yet")}
      </p>
    );
  }

  return (
    <Card>
      <h3 className={styles.heading}>{t("Location")}</h3>
      <div className={styles.row} style={{ marginBottom: "var(--space-md)" }}>
        <div className={styles.badge}>
          <span className={styles.dot} />
          <span className={styles.liveLabel}>{t("live")}</span>
          {courierName && (
            <span className={styles.courierName}>{courierName}</span>
          )}
        </div>
        {secondsAgo !== null && (
          <span className={styles.secondsAgo}>
            Last updated {""}
            {secondsAgo}s {t("ago")}
          </span>
        )}
      </div>

      <iframe
        className={styles.map}
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        title={t("Courier location")}
        loading="lazy"
      />

      {pickupGeo && (
        <div className={styles.row}>
          <span className={styles.text}>
            {t("Picked up")} {t("on")} {formatTakenAt(pickupGeo.at)}
          </span>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            onClick={() =>
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${pickupGeo.lat},${pickupGeo.lng}`,
                "_blank",
                "noopener",
              )
            }
          >
            {t("Map")}
          </Button>
        </div>
      )}
    </Card>
  );
}
