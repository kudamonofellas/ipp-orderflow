import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../../components/Button/Button";
import { Card } from "../../../components/Card/Card";
import { Icon } from "../../../components/Icon/Icon";
import { OrderRow } from "../../../components/OrderRow/OrderRow";
import { SortableTh } from "../../../components/SortableTh/SortableTh";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { useCan } from "../../../hooks/useAuth";
import { useLanguage } from "../../../hooks/useLanguage";
import { dispatchSubLabel } from "../../../lib/pipeline";
import type { OpenOrder } from "../../../types/dashboard";
import styles from "./OpenOrdersPanel.module.css";

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/**
 * Compact 2-column (Order ID / Status) card row for the mobile "Open
 * Orders" list — matches `context/designs/Mobile - Dashboard.png`. A
 * separate component from `OrderRow` (not a responsive reflow of it)
 * because `OrderRow` is fundamentally table-shaped (`<tbody>`/`<tr>`), not
 * something that can also render as a `<div>` card at a narrower width.
 * Shares the same expand-for-line-items idea, just in a div layout.
 */
function MobileOrderRow({ order }: { order: OpenOrder }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const canSeePrices = useCan()("seePrices");
  const { t } = useLanguage();
  const lines = order.lines ?? [];
  const hasItems = lines.length > 0;
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
    <div className={styles.mobileRowGroup}>
      <div
        className={styles.mobileRow}
        onClick={handleRowClick}
        aria-expanded={hasItems ? expanded : undefined}
      >
        <button
          type="button"
          className={styles.mobileArrow}
          onClick={toggle}
          aria-label={expanded ? t("Collapse") : t("Expand")}
        >
          {hasItems && (
            <Icon
              name="circleArrowRight"
              size={16}
              className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
            />
          )}
        </button>
        <span className={styles.mobileOrderId}>{order.no}</span>
        <StatusPill
          status={order.status}
          subLabel={subLabel}
          isReplacement={order.isReplacement}
          pendingDocs={order.pendingDocs}
          isHold={order.hold}
        />
      </div>
      {expanded && hasItems && (
        <div className={styles.mobileLines}>
          {lines.map((line) => {
            const hasPrice = line.price != null && line.price > 0;
            const qty = line.qty ?? 0;
            const subtotal = hasPrice ? (line.price ?? 0) * qty : null;
            return (
              <div key={line.id} className={styles.mobileLineRow}>
                <span className={styles.mobileLineName}>{line.name}</span>
                <span className={styles.mobileLineQty}>
                  {qty > 0 ? `${qty} ${line.unit ?? ""}` : ""}
                  {canSeePrices && subtotal != null
                    ? ` · ${currency.format(subtotal)}`
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface OpenOrdersPanelProps {
  orders: OpenOrder[];
  loading?: boolean;
  error?: string | null;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  sortBy?: string;
  onSortChange?: (sort: string) => void;
}

/** Open Orders panel: table of orders with expandable line rows + pagination. */
export function OpenOrdersPanel({
  orders,
  loading,
  error,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  sortBy = "-no",
  onSortChange,
}: OpenOrdersPanelProps) {
  const { t } = useLanguage();

  // "Items" has no backing DB column (it's a joined line count) — sorting it
  // is client-side, on just the current page, shadowing the server `sortBy`
  // rather than being sent to it. `null` means the server sort (`sortBy`) is
  // the active one.
  const [itemsSort, setItemsSort] = useState<string | null>(null);
  const activeSort = itemsSort ?? sortBy;

  function handleSort(nextKey: string) {
    if (nextKey.replace(/^-/, "") === "items") {
      setItemsSort(nextKey);
      return;
    }
    setItemsSort(null);
    onSortChange?.(nextKey);
  }

  const displayOrders = itemsSort
    ? [...orders].sort((a, b) => {
        const diff = a.lines.length - b.lines.length;
        return itemsSort.startsWith("-") ? -diff : diff;
      })
    : orders;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <Card>
      <div className={styles.headerWrap}>
        <h3 className={styles.heading}>{t("Open Orders")}</h3>
      </div>

      {loading ? (
        <div className={styles.muted}>Loading orders…</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : orders.length === 0 ? (
        <div className={styles.muted}>No open orders.</div>
      ) : (
        <>
          <div className={styles.desktopTableWrap} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.arrowHead} aria-label="Expand" />
                  <SortableTh
                    label={t("Order ID")}
                    sortKey="no"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Stage")}
                    sortKey="stage"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Order Date")}
                    sortKey="order_date"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Delivery Date")}
                    sortKey="delivery_date"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Sales Rep")}
                    sortKey="sales"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Customer")}
                    sortKey="customer_name"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={t("Items")}
                    sortKey="items"
                    activeSort={activeSort}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              {displayOrders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </table>
          </div>

          <div className={styles.mobileList}>
            {displayOrders.map((order) => (
              <MobileOrderRow key={order.id} order={order} />
            ))}
          </div>

          <footer className={styles.pagination}>
            <span className={styles.pageInfo}>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className={styles.pageControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="chevronLeft"
                iconOnly
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              ></Button>
              <span className={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="chevronRight"
                iconOnly
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              ></Button>
            </div>
          </footer>
        </>
      )}
    </Card>
  );
}
