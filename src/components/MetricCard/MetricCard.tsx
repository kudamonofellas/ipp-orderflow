import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import styles from './MetricCard.module.css';

interface MetricCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  range: string;
}

/** Top-row metric card: icon + range dropdown, big number, label. */
export function MetricCard({ icon: Icon, value, label, range }: MetricCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={24} strokeWidth={1.75} />
        </span>
        <button type="button" className={styles.rangeToggle}>
          {range}
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <span className={styles.label}>{label}</span>
      </div>
    </article>
  );
}
