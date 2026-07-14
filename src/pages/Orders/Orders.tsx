import { useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { OpenOrdersPanel } from '../Dashboard/sections/OpenOrdersPanel';
import { useOrders } from '../../hooks/useOrders';
import { PIPELINE_STAGES, RETURN_STAGES } from '../../lib/pipeline';
import styles from './Orders.module.css';

const STAGE_OPTIONS = [
  { key: 'all', label: 'All stages' },
  ...PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label })),
  ...RETURN_STAGES.map((s) => ({ key: s.key, label: s.label })),
];

/** Full Orders page: searchable, stage-filtered list with expandable rows. */
export function Orders() {
  const [stage, setStage] = useState('all');
  const [search, setSearch] = useState('');
  const { orders, loading, error, total, page, pageSize, setPage } = useOrders(stage, search);

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Orders</h1>
        <div className={styles.controls}>
          <select
            className={styles.stageSelect}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Filter by stage"
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className={styles.search}>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search # or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search orders"
            />
          </div>
        </div>
      </div>

      <OpenOrdersPanel
        orders={orders}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
