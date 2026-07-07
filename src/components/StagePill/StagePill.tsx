import styles from './StagePill.module.css';

interface StagePillProps {
  count: number;
  label: string;
  onClick?: () => void;
}

/** Clickable dashboard stage pill: count + label. */
export function StagePill({ count, label, onClick }: StagePillProps) {
  return (
    <button type="button" className={styles.pill} onClick={onClick}>
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
