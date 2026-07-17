import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import { Card } from '../../components/Card/Card';
import { useCan } from '../../hooks/useAuth';
import { useOrders } from '../../hooks/useOrders';
import { PIPELINE_STAGES, RETURN_STAGES } from '../../lib/pipeline';
import type { OpenOrder } from '../../types/dashboard';
import styles from './Orders.module.css';

const STAGE_OPTIONS = [
  { key: 'all', label: 'All stages' },
  ...PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label })),
  ...RETURN_STAGES.map((s) => ({ key: s.key, label: s.label })),
];

const SORT_OPTIONS = [
  { key: '-order_id', label: 'Order ID (Desc)' },
  { key: 'order_id', label: 'Order ID (Asc)' },
  { key: '-delivery_date', label: 'Delivery Date (Desc)' },
  { key: 'delivery_date', label: 'Delivery Date (Asc)' },
];

const currency = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
});

/** Drives the table headline + empty-state copy based on the selected stage filter. */
const STAGE_COPY: Record<string, { headline: string; empty: string }> = {
  all: { headline: 'All Orders', empty: 'No orders.' },
  intake: { headline: 'New Orders', empty: 'No new orders.' },
  awaiting: { headline: 'Awaiting Pickup', empty: 'No orders awaiting pickup.' },
  cold: { headline: 'Cold Storage Picking', empty: 'No orders in cold storage picking.' },
  finance: { headline: 'Finance Review', empty: 'No orders on finance review.' },
  production: { headline: 'Processing', empty: 'No orders in processing.' },
  packing: { headline: 'Packing', empty: 'No orders in packing.' },
  finalise: { headline: 'Finalising', empty: 'No orders finalising.' },
  dispatch: { headline: 'Dispatched', empty: 'No dispatched orders.' },
  delivered: { headline: 'Delivered', empty: 'No delivered orders.' },
  cancelled: { headline: 'Cancelled', empty: 'No cancelled orders.' },
  returned: { headline: 'Returned', empty: 'No returned orders.' },
  outstanding: { headline: 'Outstanding', empty: 'No outstanding orders.' },
};

const STATUS_PILL: Record<string, { label: string; color: string }> = {
  intake: { label: 'New Order', color: '#3B82F6' },
  awaiting: { label: 'Awaiting Pickup', color: '#F97316' },
  cold: { label: 'Cold Storage Picking', color: '#22C55E' },
  finance: { label: 'Finance Review', color: '#EAB308' },
  production: { label: 'Processing', color: '#A855F7' },
  packing: { label: 'Packing', color: '#A855F7' },
  finalise: { label: 'Finalising', color: '#6366F1' },
  dispatch: { label: 'Dispatched', color: '#F97316' },
  delivered: { label: 'Delivered', color: '#22C55E' },
  cancelled: { label: 'Cancelled', color: '#6B7280' },
  returned: { label: 'Returned', color: '#EF4444' },
  outstanding: { label: 'Outstanding', color: '#EAB308' },
};

/** Full Orders page: searchable, stage-filtered list with expandable rows. */
export function Orders() {
  const location = useLocation();
  const [stage, setStage] = useState(location.state?.stage || 'all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('-order_id');
  const [stageOpen, setStageOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const { orders = [], loading, error, total = 0, page = 1, pageSize = 20, setPage } = useOrders(
    stage,
    search,
    sortBy
  );

  const stageCopy = STAGE_COPY[stage] ?? STAGE_COPY.all;

  useEffect(() => {
    if (!stageOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!stageDropdownRef.current?.contains(event.target as Node)) {
        setStageOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setStageOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [stageOpen]);

  useEffect(() => {
    if (!sortOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!sortDropdownRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSortOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sortOpen]);

  const [prevLocKey, setPrevLocKey] = useState(location.key);
  if (location.key !== prevLocKey) {
    setPrevLocKey(location.key);
    setStage(location.state?.stage || 'all');
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Orders</h1>
        <div className={styles.controls}>
          <div className={styles.dropdownWrapper} ref={stageDropdownRef}>
            <button
              type="button"
              className={styles.stageToggle}
              aria-expanded={stageOpen}
              onClick={() => setStageOpen((o) => !o)}
            >
              {STAGE_OPTIONS.find((o) => o.key === stage)?.label || 'All stages'}
              <Icon name="chevronDown" size={16} />
            </button>
            {stageOpen && (
              <div className={styles.stageDropdown} role="dialog" aria-label="Filter by stage">
                {STAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={[
                      styles.stageDropdownItem,
                      stage === opt.key ? styles.stageDropdownItemActive : '',
                    ].join(' ')}
                    onClick={() => {
                      setStage(opt.key);
                      setStageOpen(false);
                      setPage(1);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.search}>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search # or customer…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search orders"
            />
          </div>
        </div>
      </div>

      <Card>
        <div className={styles.headerWrap}>
          <h3 className={styles.heading}>{stageCopy.headline}</h3>
          <div className={styles.sortContainer} ref={sortDropdownRef}>
            <button
              type="button"
              className={styles.sortToggle}
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((o) => !o)}
            >
              <span>{SORT_OPTIONS.find((o) => o.key === sortBy)?.label || 'Order ID (Desc)'}</span>
              <Icon name="chevronDown" size={16} />
            </button>
            {sortOpen && (
              <div className={styles.sortDropdown} role="dialog" aria-label="Sort options">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={[
                      styles.sortDropdownItem,
                      sortBy === opt.key ? styles.sortDropdownItemActive : '',
                    ].join(' ')}
                    onClick={() => {
                      setSortBy(opt.key);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className={styles.muted}>Loading orders…</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : orders.length === 0 ? (
          <div className={styles.muted}>{stageCopy.empty}</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.arrowHead} aria-label="Expand" />
                    <th style={{ textAlign: 'left' }}>Order ID</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'left' }}>Order Date</th>
                    <th style={{ textAlign: 'left' }}>Delivery Date</th>
                    <th style={{ textAlign: 'left' }}>Sales Rep</th>
                    <th style={{ textAlign: 'left' }}>Customer</th>
                    <th style={{ textAlign: 'left' }}>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: OpenOrder) => (
                    <OrderRows key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>

            <footer className={styles.pagination}>
              <span className={styles.pageInfo}>
                Showing {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className={styles.pageControls}>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setPage?.(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <Icon name="chevronLeft" size={16} />
                </button>
                <span className={styles.pageIndicator}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setPage?.(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </Card>
    </div>
  );
}

function OrderRows({ order }: { order: OpenOrder }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const canSeePrices = useCan()('seePrices');
  const lines = order.lines ?? [];
  const count = lines.length;
  const hasItems = count > 0;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (hasItems) setExpanded((v) => !v);
  }

  function handleRowClick() {
    navigate(`/orders/${order.id}`);
  }

  return (
    <>
      <tr
        className={`${styles.orderRow} ${styles.clickable}`}
        onClick={handleRowClick}
        aria-expanded={hasItems ? expanded : undefined}
      >
        <td className={styles.arrowCell} onClick={toggle}>
          {hasItems && (
            <Icon
              name="chevronRight"
              size={16}
              className={expanded ? styles.chevronOpen : styles.chevron}
            />
          )}
        </td>
        <td className={styles.orderId}>{order.orderId}</td>
        <td>
          <StatusPill status={order.status} />
        </td>
        <td>{order.orderDate}</td>
        <td>{order.deliveryDate}</td>
        <td>{order.salesRep}</td>
        <td>{order.customerName}</td>
        <td className={styles.itemsCount}>
          {count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : '-'}
        </td>
      </tr>
      {expanded && hasItems && (
        <tr>
          <td colSpan={8} className={styles.linesCell}>
            <div className={styles.lines}>
              {lines.map((line) => (
                <div key={line.id} className={styles.lineRow}>
                  <span className={styles.lineName}>
                    {line.name}
                    {line.qty != null && line.qty > 0 && (
                      <span className={styles.lineQty}>
                        {' — '}
                        {line.qty}
                        {line.unit ? ` ${line.unit}` : ''}
                      </span>
                    )}
                  </span>
                  {canSeePrices && line.price != null && line.price > 0 && (
                    <span className={styles.lineAmount}>{currency.format(line.price)}</span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const config = STATUS_PILL[status] ?? { label: status, color: '#6B7280' };
  return (
    <span
      className={styles.statusPill}
      style={{
        backgroundColor: config.color + '22',
        color: config.color,
        borderColor: config.color + '55',
      }}
    >
      {config.label}
    </span>
  );
}
