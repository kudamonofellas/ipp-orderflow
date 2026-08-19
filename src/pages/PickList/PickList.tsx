import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { usePickList, type PickListRow } from "../../hooks/usePickList";
import styles from "./PickList.module.css";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** One product's picking card: checkbox + name + total, then a per-order mini-table. */
function PickListRowCard({
  row,
  pulled,
  onToggle,
}: {
  row: PickListRow;
  pulled: boolean;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  const qtyDisplay = Math.round(row.qty * 100) / 100;

  return (
    <Card className={styles.productCard}>
      <div className={styles.productHeaderRow}>
        <div className={styles.productLeft}>
          <Checkbox
            checked={pulled}
            onChange={onToggle}
            label={`${row.name} — ${pulled ? t("Mark as not pulled") : t("Mark as pulled")}`}
          />
          <div className={styles.productInfo}>
            <span className={styles.productName}>{row.name}</span>
            {row.cutCount > 0 && (
              <span className={styles.cuttingPill}>
                <Icon name="knife" size={12} />
                {row.cutCount} {t("cutting job(s)")}
              </span>
            )}
            {row.catchWeight && (
              <span className={styles.weighCaption}>
                <Icon name="weight" size={12} />
                {t("weigh per order")}
              </span>
            )}
          </div>
        </div>
        <div className={styles.productQty}>
          <span className={styles.qtyValue}>
            {row.catchWeight ? `~${qtyDisplay}` : qtyDisplay}
          </span>
          <span className={styles.qtyUnit}>{row.unit}</span>
        </div>
      </div>

      <hr className={styles.divider} />

      <div className={styles.orderRows}>
        {row.orders.map((o) => (
          <div key={o.orderId} className={styles.orderRow}>
            <div className={styles.orderMeta}>
              <span className={styles.orderNo}>{o.orderNo}</span>
              <span className={styles.orderCustomer}>{o.customerName}</span>
            </div>
            <span className={styles.orderQty}>
              {Math.round(o.qty * 100) / 100} {row.unit}
              {o.cutTexts.length > 0 && ` · cut ${o.cutTexts.join(", ")}`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Aggregate Pick List — sums every line still to be pulled (New Orders / Cold
 * Storage, not on hold) for one delivery date, so the warehouse pulls each
 * product once instead of walking the cold room order by order. Reached from
 * the Dashboard's "Pick list" button (`viewPickList` capability).
 */
export function PickList() {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/";
  const canView = useCan()("viewPickList");
  const { t } = useLanguage();

  // Defence-in-depth: the route is already wrapped in <Guarded cap="viewPickList">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const [day, setDay] = useState(todayISO);
  const { groups, rows, orderCount, loading, error } = usePickList(day);

  // Picked/unpicked state is ephemeral (resets each visit, no persistence) —
  // clear it whenever the date changes. Adjusted during render (not an
  // effect) to avoid a cascading-render setState-in-effect lint error, same
  // pattern as the Orders page's stage-sync before it moved to URL state.
  const [pulled, setPulled] = useState<Set<string>>(() => new Set());
  const [pulledForDay, setPulledForDay] = useState(day);
  if (day !== pulledForDay) {
    setPulledForDay(day);
    setPulled(new Set());
  }

  function togglePulled(key: string) {
    setPulled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const progressPct =
    rows.length === 0 ? 0 : Math.round((pulled.size / rows.length) * 100);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button
            type="button"
            variant="tertiary"
            icon="chevronLeft"
            onClick={() => navigate(backTo)}
          >
            {t("Back")}
          </Button>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{t("Pick list")}</h1>
            <span className={styles.count}>{orderCount}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <span className={styles.dateLabel}>{t("Deliveries on")}</span>
          <div className={styles.dateField}>
            <input
              type="date"
              className={styles.dateInput}
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label={t("Deliveries on")}
            />
            <Icon name="calendar" size={16} className={styles.dateIcon} />
          </div>
        </div>
      </header>
      {rows.length > 0 && (
        <div className={styles.progressRow}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className={styles.progress}>
            {pulled.size} {t("of")} {rows.length} {t("pulled")}
          </p>
        </div>
      )}

      {loading ? (
        <div className={styles.muted}>{t("Loading pick list…")}</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : rows.length === 0 ? (
        <div className={styles.muted}>
          {t(
            "Nothing to pull for this date — orders past Cold Storage are already picked.",
          )}
        </div>
      ) : groups.length > 0 ? (
        groups.map((group) => (
          <section key={group.category} className={styles.sectionRow}>
            <h2 className={styles.categoryHeading}>{group.category}</h2>
            <div className={styles.rowList}>
              {group.rows.map((row) => (
                <PickListRowCard
                  key={row.key}
                  row={row}
                  pulled={pulled.has(row.key)}
                  onToggle={() => togglePulled(row.key)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className={styles.rowList}>
          {rows.map((row) => (
            <PickListRowCard
              key={row.key}
              row={row}
              pulled={pulled.has(row.key)}
              onToggle={() => togglePulled(row.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
