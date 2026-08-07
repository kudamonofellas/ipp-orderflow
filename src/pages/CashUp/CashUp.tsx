import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Button } from "../../components/Button/Button";
import { Avatar } from "../../components/Avatar/Avatar";
import { StatCard } from "../../components/StatCard/StatCard";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useCashUp } from "../../hooks/useCashUp";
import { getInitials } from "../../lib/initials";
import styles from "./CashUp.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/**
 * Cash-up — the desk's COD reconciliation queue, grouped by courier so the
 * desk settles one person at a time. Reached from the Dashboard's "Cash Up"
 * button (`reconcileCOD` capability).
 */
export function CashUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/";
  const canView = useCan()("reconcileCOD");
  const { t } = useLanguage();

  // Defence-in-depth: the route is already wrapped in <Guarded cap="reconcileCOD">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const { groups, expected, collected, remaining, confirmedIds, confirm, loading, error } = useCashUp();

  function handleConfirm(orderId: string, customerName: string, amount: number) {
    if (window.confirm(`Confirm ${currency.format(amount)} received from ${customerName}?`)) {
      confirm(orderId);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button type="button" variant="tertiary" icon="chevronLeft" onClick={() => navigate(backTo)}>
            {t("Back")}
          </Button>
          <h1 className={styles.title}>{t("Cash-up")}</h1>
        </div>
      </header>

      <div className={styles.statsRow}>
        <StatCard value={currency.format(expected)} label={t("Expected")} />
        <StatCard value={currency.format(collected)} label={t("Collected")} />
        <StatCard value={currency.format(remaining)} label={t("Remaining")} />
      </div>

      {loading ? (
        <div className={styles.muted}>{t("Loading cash-up…")}</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : groups.length === 0 ? (
        <div className={styles.muted}>{t("Nothing to reconcile — no COD orders out for delivery right now.")}</div>
      ) : (
        groups.map((group) => (
          <div key={group.courier} className={styles.courierGroup}>
            <div className={styles.courierHeader}>
              <div className={styles.courierLeft}>
                <Avatar initials={getInitials(group.courier)} label={group.courier} size="md" />
                <span className={styles.courierName}>{group.courier}</span>
                <span className={styles.dropCount}>
                  {group.orders.length} {t("drop(s)")}
                </span>
              </div>
              <span className={styles.courierSubtotal}>{currency.format(group.subtotal)}</span>
            </div>

            <Card flush className={styles.ordersCard}>
              {group.orders.map((o) => {
                const isConfirmed = confirmedIds.has(o.orderId);
                return (
                  <div
                    key={o.orderId}
                    className={[styles.orderRow, isConfirmed ? styles.orderRowConfirmed : ""].join(" ")}
                  >
                    <div className={styles.orderLeft}>
                      <span className={styles.customerName}>{o.customerName}</span>
                      <span className={styles.orderNo}>{o.orderNo}</span>
                    </div>
                    <span className={styles.amount}>{currency.format(o.amount)}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon="tick"
                      disabled={isConfirmed}
                      onClick={() => handleConfirm(o.orderId, o.customerName, o.amount)}
                    >
                      {isConfirmed ? t("Confirmed") : t("Confirm")}
                    </Button>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
