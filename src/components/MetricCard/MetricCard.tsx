import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icons';
import type { DateRangeVal } from '../../types/dashboard';
import styles from './MetricCard.module.css';

interface MetricCardProps {
  icon: IconName;
  value: number;
  label: string;
  rangeLabel: string;
  onRangeChange?: (val: DateRangeVal, label: string) => void;
}

/** Top-row metric card: icon + range dropdown, big number, label. */
export function MetricCard({ icon, value, label, rangeLabel, onRangeChange }: MetricCardProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.iconWrap}>
          <Icon name={icon} size={24} />
          <span className={styles.count}>{value}</span>
        </span>
        <div className={styles.rangeContainer} ref={containerRef}>
          {onRangeChange ? (
            <button
              type="button"
              className={styles.rangeToggle}
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {rangeLabel}
              <Icon name="chevronDown" size={16} />
            </button>
          ) : (
            <span className={styles.rangeStatic}>{rangeLabel}</span>
          )}

          {onRangeChange && open && (
            <div className={styles.dropdown} role="dialog" aria-label="Select Date Range">
              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => {
                  onRangeChange?.({ type: 'today' }, 'Today');
                  setOpen(false);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className={styles.dropdownItem}
                onClick={() => {
                  onRangeChange?.({ type: 'week' }, 'This Week');
                  setOpen(false);
                }}
              >
                This Week
              </button>
              <div className={styles.dropdownItemInput}>
                <span>Select Month</span>
                <input
                  type="month"
                  aria-label="Select Month"
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m] = e.target.value.split('-');
                      const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      onRangeChange?.({ type: 'month', month: e.target.value }, monthName);
                      setOpen(false);
                    }
                  }}
                />
              </div>
              <div className={styles.dropdownItemInput}>
                <span>Select Year</span>
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  placeholder="e.g. 2026"
                  aria-label="Select Year"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (val >= 2020 && val <= 2100) {
                        onRangeChange?.({ type: 'year', year: val }, String(val));
                        setOpen(false);
                      }
                    }
                  }}
                />
              </div>
              <div className={styles.dropdownItemInput}>
                <span>Select Specific Date</span>
                <input
                  type="date"
                  aria-label="Select Specific Date"
                  onChange={(e) => {
                    if (e.target.value) {
                      onRangeChange?.({ type: 'specific', date: e.target.value }, e.target.value);
                      setOpen(false);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.body}>
        <span className={styles.label}>{label}</span>
      </div>
    </article>
  );
}
