import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../../../components/Card/Card';
import type { OpenOrder } from '../../../types/dashboard';
import styles from './OpenOrdersPanel.module.css';

interface OpenOrdersPanelProps {
  orders: OpenOrder[];
  loading?: boolean;
  error?: string | null;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

const currency = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
});

/** Open Orders panel: table of orders with expandable line rows + pagination. */
export function OpenOrdersPanel({
  orders,
  loading,
  error,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
}: OpenOrdersPanelProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <Card>
      <h3 className={styles.heading}>Open Orders</h3>
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : loading ? (
        <p className={styles.muted}>Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className={styles.muted}>No open orders.</p>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Status</th>
                <th>Order Date</th>
                <th>Delivery Date</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRows key={order.id} order={order} />
              ))}
            </tbody>
          </table>
          <footer className={styles.pagination}>
            <span className={styles.pageInfo}>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className={styles.pageControls}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </>
      )}
    </Card>
  );
}

function OrderRows({ order }: { order: OpenOrder }) {
  const [expanded, setExpanded] = useState(false);
  const count = order.lines.length;
  const hasItems = count > 0;

  return (
    <>
      <tr className={styles.orderRow}>
        <td className={styles.orderId}>{order.orderId}</td>
        <td>{order.status}</td>
        <td>{order.orderDate}</td>
        <td>{order.deliveryDate}</td>
        <td className={styles.itemsCell}>
          <button
            type="button"
            className={styles.itemsToggle}
            onClick={() => hasItems && setExpanded((v) => !v)}
            disabled={!hasItems}
            aria-expanded={hasItems && expanded}
            aria-label={hasItems ? `Toggle ${count} item${count === 1 ? '' : 's'}` : 'No items'}
          >
            <span className={styles.itemsCount}>
              {count} {count === 1 ? 'item' : 'items'}
            </span>
            {hasItems && (
              <ChevronDown
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={expanded ? styles.chevronOpen : styles.chevron}
              />
            )}
          </button>
        </td>
      </tr>
      {expanded && hasItems && (
        <tr>
          <td colSpan={5} className={styles.linesCell}>
            <div className={styles.lines}>
              {order.lines.map((line) => (
                <div key={line.id} className={styles.lineRow}>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={styles.lineAmount}>{currency.format(line.amount)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
