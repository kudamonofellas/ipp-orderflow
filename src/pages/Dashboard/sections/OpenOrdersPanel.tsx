import { useState } from "react";
import { Button } from "../../../components/Button/Button";
import { Card } from "../../../components/Card/Card";
import { OrderRows } from "../../../components/OrderRows/OrderRows";
import { SortableTh } from "../../../components/SortableTh/SortableTh";
import { useLanguage } from "../../../hooks/useLanguage";
import type { OpenOrder } from "../../../types/dashboard";
import styles from "./OpenOrdersPanel.module.css";

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
  sortBy = "no",
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
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.arrowHead} aria-label="Expand" />
                  <SortableTh label={t("Order ID")} sortKey="no" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Stage")} sortKey="stage" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Order Date")} sortKey="order_date" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Delivery Date")} sortKey="delivery_date" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Sales Rep")} sortKey="sales" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Customer")} sortKey="customer_name" activeSort={activeSort} onSort={handleSort} />
                  <SortableTh label={t("Items")} sortKey="items" activeSort={activeSort} onSort={handleSort} />
                </tr>
              </thead>
              {displayOrders.map((order) => (
                <OrderRows key={order.id} order={order} />
              ))}
            </table>
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
