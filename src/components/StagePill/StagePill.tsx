import styles from './StagePill.module.css';

interface StagePillProps {
  count: number;
  label: string;
  /** When true the pill is rendered in the main blue accent (role-owned stage). */
  highlight?: boolean;
  onClick?: () => void;
}

/** Clickable dashboard stage pill: stacked count (top) + label (below). */
export function StagePill({ count, label, highlight = false, onClick }: StagePillProps) {
  return (
    <button
      type="button"
      className={[styles.pill, highlight ? styles.pillHighlight : ''].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
