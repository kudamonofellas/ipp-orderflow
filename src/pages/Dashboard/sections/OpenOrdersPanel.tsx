import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button/Button";
import { Card } from "../../../components/Card/Card";
import { OrderRows } from "../../../components/OrderRows/OrderRows";
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

const SORT_OPTIONS = [
  { key: "-order_id", label: "Order ID (Desc)" },
  { key: "order_id", label: "Order ID (Asc)" },
  { key: "-delivery_date", label: "Delivery Date (Desc)" },
  { key: "delivery_date", label: "Delivery Date (Asc)" },
];

/** Open Orders panel: table of orders with expandable line rows + pagination. */
export function OpenOrdersPanel({
  orders,
  loading,
  error,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  sortBy = "-order_id",
  onSortChange,
}: OpenOrdersPanelProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!sortDropdownRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSortOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortOpen]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <Card>
      <div className={styles.headerWrap}>
        <h3 className={styles.heading}>Open Orders</h3>
        {onSortChange && (
          <div className={styles.sortContainer} ref={sortDropdownRef}>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={sortOpen}
              icon="chevronDown"
              size="md"
              iconPosition="right"
              isActive={sortOpen}
              onClick={() => setSortOpen((prev) => !prev)}
            >
              <span>
                {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ||
                  "Order ID (Desc)"}
              </span>
            </Button>
            {sortOpen && (
              <div
                className={styles.sortDropdown}
                role="dialog"
                aria-label="Sort options"
              >
                {SORT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.key}
                    variant="ghost"
                    type="button"
                    className={[
                      styles.sortDropdownItem,
                      sortBy === opt.key ? styles.sortDropdownItemActive : "",
                    ].join(" ")}
                    onClick={() => {
                      onSortChange(opt.key);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
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
                  <th style={{ textAlign: "left" }}>Order ID</th>
                  <th style={{ textAlign: "left" }}>Stage</th>
                  <th style={{ textAlign: "left" }}>Order Date</th>
                  <th style={{ textAlign: "left" }}>Delivery Date</th>
                  <th style={{ textAlign: "left" }}>Sales Rep</th>
                  <th style={{ textAlign: "left" }}>Customer</th>
                  <th style={{ textAlign: "left" }}>Items</th>
                </tr>
              </thead>
              {orders.map((order) => (
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
