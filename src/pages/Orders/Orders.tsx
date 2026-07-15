import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const [stage, setStage] = useState(location.state?.stage || 'all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('-order_id');
  const [stageOpen, setStageOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);

  const { orders, loading, error, total, page, pageSize, setPage } = useOrders(stage, search, sortBy);

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

  const [prevLocKey, setPrevLocKey] = useState(location.key);
  if (location.key !== prevLocKey) {
    setPrevLocKey(location.key);
    setStage(location.state?.stage || 'all');
  }

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

      <OpenOrdersPanel
        orders={orders}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
    </div>
  );
}
