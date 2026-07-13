import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icons';
import styles from './MetricCard.module.css';

interface MetricCardProps {
  icon: IconName;
  value: number;
  label: string;
  range: string;
}

/** Top-row metric card: icon + range dropdown, big number, label. */
export function MetricCard({ icon, value, label, range }: MetricCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.iconWrap}>
          <Icon name={icon} size={24} />
        </span>
        <button type="button" className={styles.rangeToggle}>
          {range}
          <Icon name="chevronDown" size={16} />
        </button>
      </div>
      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <span className={styles.label}>{label}</span>
      </div>
    </article>
  );
}
