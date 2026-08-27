import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../Icon/Icon";
import { StatusPill } from "../StatusPill/StatusPill";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { dispatchSubLabel } from "../../lib/pipeline";
import type { OpenOrder } from "../../types/dashboard";
import styles from "./OrderRow.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/**
 * One expandable order row (+ line items) for an 8-column orders table:
 * arrow, Order ID, Stage, Order Date, Delivery Date, Sales Rep, Customer, Items.
 * Shared by the Orders page and the Dashboard's Open Orders panel — both
 * render `<table>{orders.map(o => <OrderRow key={o.id} order={o} />)}</table>`
 * with no wrapping `<tbody>` of their own, since each row owns its `<tbody>`.
 */
export function OrderRow({ order }: { order: OpenOrder }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const canSeePrices = useCan()("seePrices");
  const { t } = useLanguage();
  const lines = order.lines ?? [];
  const count = lines.length;
  const hasItems = count > 0;
  const orderTotal = lines.reduce(
    (sum, line) =>
      sum + (line.price ?? 0) * (line.qty ?? 0),
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
    // Include the query string (`?stage=...&search=...`), not just the
    // pathname — otherwise Orders.tsx's stage/search filter is dropped when
    // the Back button on OrderDetail navigates here.
    navigate(`/orders/${order.id}`, {
      state: { from: location.pathname + location.search },
    });
  }

  return (
    <tbody
      className={`${styles.orderGroup} ${styles.clickable} ${expanded ? styles.expandedGroup : ""}`}
      onClick={handleRowClick}
    >
      <tr
        className={styles.orderRow}
        aria-expanded={hasItems ? expanded : undefined}
      >
        <td className={styles.arrowCell} onClick={toggle}>
          {hasItems && (
            <Icon
              name="circleArrowRight"
              size={16}
              className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
            />
          )}
        </td>
        <td className={styles.orderId}>{order.no}</td>
        <td className={styles.statusCell}>
          <StatusPill
            status={order.status}
            subLabel={subLabel}
            isReplacement={order.isReplacement}
            pendingDocs={order.pendingDocs}
            isHold={order.hold}
          />
        </td>
        <td>{order.orderDate}</td>
        <td>{order.deliveryDate}</td>
        <td>{order.salesRep}</td>
        <td>{order.customerName}</td>
        <td className={styles.itemsCount}>
          {count > 0 ? `${count} ${count === 1 ? t("item") : t("items")}` : "-"}
        </td>
      </tr>
      {expanded && hasItems && (
        <tr className={styles.linesRow}>
          <td colSpan={8} className={styles.linesCell}>
            <div className={styles.lines}>
              {lines.map((line) => {
                const hasPrice = line.price != null && line.price > 0;
                const qty = line.qty ?? 0;
                const subtotal = hasPrice ? (line.price ?? 0) * qty : null;
                return (
                  <div key={line.id} className={styles.lineRow}>
                    <span className={styles.lineName}>{line.name}</span>
                    <span className={styles.lineQty}>
                      {qty > 0 ? qty : ""}
                    </span>
                    <span className={styles.lineUnit}>{line.unit ?? ""}</span>
                    {canSeePrices && (
                      <span className={styles.lineUnitPrice}>
                        {hasPrice ? `@ ${currency.format(line.price!)}` : ""}
                      </span>
                    )}
                    {canSeePrices && (
                      <span className={styles.lineSubtotal}>
                        {subtotal != null ? currency.format(subtotal) : ""}
                      </span>
                    )}
                  </div>
                );
              })}
              {canSeePrices && orderTotal > 0 && (
                <div className={`${styles.lineRow} ${styles.totalRow}`}>
                  <span className={styles.lineName} />
                  <span className={styles.lineQty} />
                  <span className={styles.lineUnit} />
                  <span className={styles.totalLabel}>{t("Total")}</span>
                  <span className={styles.totalValue}>
                    {currency.format(orderTotal)}
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
