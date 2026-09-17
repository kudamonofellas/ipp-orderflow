import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../Icon/Icon";
import { StatusPill } from "../StatusPill/StatusPill";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { dispatchSubLabel } from "../../lib/pipeline";
import type { OpenOrder } from "../../types/dashboard";
import styles from "./MobileOrderRow.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/**
 * Card row for the mobile "Open Orders" list — same fields as the desktop
 * `OrderRow` table, just in a div layout since `OrderRow` is fundamentally
 * table-shaped (`<tbody>`/`<tr>`), not something that can also render as a
 * card at a narrower width.
 *
 * Column widths (`.orderId`/`.cellStage`/`.cellDate`/`.cellSales`/
 * `.cellCustomer`/`.cellItems`) are fixed pixel widths driven by CSS custom
 * properties (`--col-*`) declared once on `OpenOrdersPanel`'s `.mobileList`
 * — the header row (also a plain flex row, not a real `<table>`) uses the
 * *same* variables for its own column widths, which is what keeps the two
 * aligned. A div-based layout has no native column coordination the way a
 * `<table>` does, so without this, each row's cell widths would be
 * determined independently by their own content and drift out of sync
 * with the header (and with each other).
 *
 * Renders a fragment (`.rowGroup` + the expanded `.linesRow`, as siblings,
 * not nested) rather than one wrapping element: both `.arrow` and
 * `.linesRow` are `position: sticky; left: 0`, and a sticky element only
 * stays stuck for as long as its own containing block (normally its direct
 * parent) is still in view — if `.linesRow` were nested inside `.rowGroup`,
 * `.rowGroup`'s auto width (which stays container-width even though `.row`
 * overflows it — overflowing content doesn't enlarge an ancestor's box)
 * would scroll out of view and break `.linesRow`'s stickiness partway
 * through a scroll. As a direct child of `.mobileList` (the scroll
 * container itself) instead, its containing block never leaves view, so it
 * stays correctly stuck — and, as a bonus, naturally renders at the
 * container's width rather than needing an explicit override. `.arrow`
 * doesn't have this problem since its containing block is `.row`, which is
 * given `width: max-content` specifically so it (and therefore `.arrow`)
 * stays in view for the same reason.
 */
export function MobileOrderRow({
  order,
  isLast,
  hideCustomerColumns = false,
}: {
  order: OpenOrder;
  isLast?: boolean;
  /** Drop the Sales Rep + Customer cells, for lists already scoped to one customer. */
  hideCustomerColumns?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const canSeePrices = useCan()("seePrices");
  const { t } = useLanguage();
  const lines = order.lines ?? [];
  const count = lines.length;
  const hasItems = count > 0;
  const orderTotal = lines.reduce(
    (sum, line) => sum + (line.price ?? 0) * (line.qty ?? 0),
    0,
  );
  const subLabel = dispatchSubLabel({
    stage: order.status,
    taken_by: order.takenBy,
    pickup: order.pickup,
    third_party: order.thirdParty,
  });

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (hasItems) setExpanded((v) => !v);
  }

  function handleRowClick() {
    navigate(`/orders/${order.id}`, {
      state: { from: location.pathname + location.search },
    });
  }

  return (
    <>
      <div
        className={styles.rowGroup}
        style={{
          borderBottom:
            isLast || (expanded && hasItems)
              ? "none"
              : "1px solid var(--border-subtle)",
        }}
      >
        <div
          className={styles.row}
          onClick={handleRowClick}
          aria-expanded={hasItems ? expanded : undefined}
        >
          <button
            type="button"
            className={styles.arrow}
            onClick={toggle}
            aria-label={expanded ? t("Collapse") : t("Expand")}
          >
            {hasItems && (
              <Icon
                name="circleArrowRight"
                size={16}
                style={{ flexShrink: 0 }}
                className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
              />
            )}
          </button>
          <span className={styles.orderId}>{order.no}</span>
          <span className={styles.cellStage}>
            <StatusPill
              status={order.status}
              subLabel={subLabel}
              isReplacement={order.isReplacement}
              pendingDocs={order.pendingDocs}
              isHold={order.hold}
            />
          </span>
          <span className={styles.cellDate}>{order.orderDate}</span>
          <span className={styles.cellDate}>{order.deliveryDate}</span>
          {!hideCustomerColumns && (
            <>
              <span className={styles.cellSales}>{order.salesRep}</span>
              <span className={styles.cellCustomer}>{order.customerName}</span>
            </>
          )}
          <span className={styles.cellItems}>
            {count > 0
              ? `${count} ${count === 1 ? t("item") : t("items")}`
              : "-"}
          </span>
        </div>
      </div>
      {expanded && hasItems && (
        <div className={styles.linesRow}>
          <div className={styles.linesCell}>
            <div className={styles.lines}>
              {lines.map((line) => {
                const hasPrice = line.price != null && line.price > 0;
                const qty = line.qty ?? 0;
                const subtotal = hasPrice ? (line.price ?? 0) * qty : null;
                return (
                  <div key={line.id} className={styles.lineRow}>
                    <span className={styles.lineName}>{line.name}</span>
                    <span className={styles.lineQty}>{qty > 0 ? qty : ""}</span>
                    <span className={styles.lineUnit}>{line.unit ?? ""}</span>
                    {canSeePrices && (
                      <span className={styles.lineSubtotal}>
                        {hasPrice && subtotal != null
                          ? currency.format(subtotal)
                          : ""}
                      </span>
                    )}
                  </div>
                );
              })}
              {canSeePrices && orderTotal > 0 && (
                <div className={`${styles.lineRow} ${styles.totalRow}`}>
                  <span className={styles.totalLabel}>{t("Total")}</span>
                  <span className={styles.totalValue}>
                    {currency.format(orderTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
