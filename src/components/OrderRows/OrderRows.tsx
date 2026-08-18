import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../Icon/Icon";
import { StatusPill } from "../StatusPill/StatusPill";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { dispatchSubLabel } from "../../lib/pipeline";
import type { OpenOrder } from "../../types/dashboard";
import styles from "./OrderRows.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
});

/**
 * One expandable order row (+ line items) for an 8-column orders table:
 * arrow, Order ID, Stage, Order Date, Delivery Date, Sales Rep, Customer, Items.
 * Shared by the Orders page and the Dashboard's Open Orders panel — both
 * render `<table>{orders.map(o => <OrderRows key={o.id} order={o} />)}</table>`
 * with no wrapping `<tbody>` of their own, since each row owns its `<tbody>`.
 */
export function OrderRows({ order }: { order: OpenOrder }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const canSeePrices = useCan()("seePrices");
  const { t } = useLanguage();
  const lines = order.lines ?? [];
  const count = lines.length;
  const hasItems = count > 0;
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
        <td>
          <StatusPill
            status={order.status}
            subLabel={subLabel}
            isReplacement={order.isReplacement}
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
              {lines.map((line) => (
                <div key={line.id} className={styles.lineRow}>
                  <span className={styles.lineName}>
                    {line.qty != null && line.qty > 0 && (
                      <span className={styles.lineQty}>
                        {line.qty}
                        {line.unit ? ` ${line.unit}` : ""}
                        {" — "}
                      </span>
                    )}
                    {line.name}
                  </span>
                  {canSeePrices && line.price != null && line.price > 0 && (
                    <span className={styles.lineAmount}>
                      {currency.format(line.price)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
