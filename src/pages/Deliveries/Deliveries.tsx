import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { useCan, useCurrentUserId } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useDeliveries } from "../../hooks/useDeliveries";
import styles from "./Deliveries.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Deliveries — the current courier's run-sheet: one unmistakable "Next stop"
 * hero card, then a compact "Then" list, then a read-only "With other
 * drivers" list. Reached from the Dashboard's "Deliveries" button
 * (`viewDeliveryRun` capability).
 */
export function Deliveries() {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/";
  const userId = useCurrentUserId();
  const can = useCan();
  const canMarkDelivered = can("dispatch");
  const canView = can("viewDeliveryRun");
  const { t } = useLanguage();

  // Defence-in-depth: the route is already wrapped in <Guarded cap="viewDeliveryRun">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const { mine, others, loading, error } = useDeliveries(userId);

  // The real hand-off/proof-capture flow lives on the order's own detail
  // page (OrderDetail.tsx) — this page used to bare-flip the stage directly,
  // bypassing that flow entirely. Route there instead so there's a single
  // source of truth for "how does this order actually get marked delivered."
  function goToOrder(orderId: string) {
    navigate(`/orders/${orderId}`, { state: { from: location.pathname } });
  }

  const [nextStop, ...rest] = mine;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button type="button" variant="tertiary" icon="chevronLeft" onClick={() => navigate(backTo)}>
            {t("Back")}
          </Button>
          <h1 className={styles.title}>{t("Deliveries")}</h1>
        </div>
      </header>

      {loading ? (
        <div className={styles.muted}>{t("Loading deliveries…")}</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          {mine.length === 0 ? (
            <div className={styles.muted}>{t("No stops on your run right now.")}</div>
          ) : (
            <>
              <div>
                <h2 className={styles.sectionLabel}>{t("Next stop")}</h2>
                <Card className={styles.heroCard}>
                  <div className={styles.heroTop}>
                    <div className={styles.heroLeft}>
                      <span className={styles.badgeFilled}>{nextStop.sequence}</span>
                      <div className={styles.heroInfo}>
                        <span className={styles.stopName}>{nextStop.customerName}</span>
                        <span className={styles.orderNo}>{nextStop.orderNo}</span>
                        {nextStop.address && (
                          <span className={styles.address}>
                            <Icon name="location" size={16} />
                            {nextStop.address}
                          </span>
                        )}
                      </div>
                    </div>
                    {nextStop.isCOD ? (
                      <span className={styles.codChip}>
                        <Icon name="cash" size={16} />
                        {currency.format(nextStop.amount)}
                      </span>
                    ) : (
                      <span className={styles.noCash}>{t("No Cash")}</span>
                    )}
                  </div>
                  <div className={styles.heroActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      icon="navigation"
                      buttonStyle="fullWidth"
                      onClick={() => window.open(mapsUrl(nextStop.address ?? nextStop.customerName), "_blank", "noopener")}
                    >
                      {t("Navigate")}
                    </Button>
                    {canMarkDelivered && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        icon="tick"
                        buttonStyle="fullWidth"
                        onClick={() => goToOrder(nextStop.orderId)}
                      >
                        {t("Mark delivered")}
                      </Button>
                    )}
                  </div>
                </Card>
              </div>

              {rest.length > 0 && (
                <div>
                  <h2 className={styles.sectionLabel}>{t("Then")}</h2>
                  <div className={styles.thenList}>
                    {rest.map((stop) => (
                      <Card
                        key={stop.orderId}
                        className={styles.stopCard}
                        onClick={() => goToOrder(stop.orderId)}
                        style={{ cursor: "pointer" }}
                      >
                        <span className={styles.badgeOutline}>{stop.sequence}</span>
                        <div className={styles.stopInfo}>
                          <span className={styles.stopName}>{stop.customerName}</span>
                          <span className={styles.orderNo}>{stop.orderNo}</span>
                          {stop.address && (
                            <span className={styles.addressCompact}>
                              <Icon name="location" size={14} />
                              {stop.address}
                            </span>
                          )}
                        </div>
                        {stop.isCOD ? (
                          <span className={styles.codAmountLight}>{currency.format(stop.amount)}</span>
                        ) : (
                          <span className={styles.noCashLight}>{t("No Cash")}</span>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon="navigation"
                          iconOnly
                          aria-label={`${t("Navigate")} — ${stop.customerName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(mapsUrl(stop.address ?? stop.customerName), "_blank", "noopener");
                          }}
                        />
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {others.length > 0 && (
            <div>
              <h2 className={styles.sectionLabel}>{t("With other drivers")}</h2>
              <div className={styles.thenList}>
                {others.map((stop) => (
                  <Card key={stop.orderId} className={styles.stopCard}>
                    <span className={styles.badgeOutline}>{stop.sequence}</span>
                    <div className={styles.stopInfo}>
                      <span className={styles.stopName}>{stop.customerName}</span>
                      <span className={styles.orderNo}>
                        {stop.orderNo}
                        {stop.takenByName ? ` · ${t("Taken by")} ${stop.takenByName}` : ""}
                      </span>
                      {stop.address && (
                        <span className={styles.addressCompact}>
                          <Icon name="location" size={14} />
                          {stop.address}
                        </span>
                      )}
                    </div>
                    {stop.isCOD ? (
                      <span className={styles.codAmountLight}>{currency.format(stop.amount)}</span>
                    ) : (
                      <span className={styles.noCashLight}>{t("No Cash")}</span>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
