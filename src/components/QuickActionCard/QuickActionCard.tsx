import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";
import styles from "./QuickActionCard.module.css";

interface QuickActionCardProps {
  icon: IconName;
  label: string;
  /** Pass "-" (or any non-numeric placeholder) when there's nothing to act on yet. */
  value: string | number;
  suffix: string;
  onClick: () => void;
  title?: string;
}

/** Deliveries / Pick list / Cash-up row card — icon+label left, value+suffix right, `--bg-surface-hover` background. */
export function QuickActionCard({
  icon,
  label,
  value,
  suffix,
  onClick,
  title,
}: QuickActionCardProps) {
  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      title={title}
    >
      <span className={styles.left}>
        <span className={styles.iconWrap}>
          <Icon name={icon} size={24} />
        </span>
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.right}>
        <span className={styles.value}>{value}</span>
        <span className={styles.suffix}>{suffix}</span>
      </span>
    </button>
  );
}
