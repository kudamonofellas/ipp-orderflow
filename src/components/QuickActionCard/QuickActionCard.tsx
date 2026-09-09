import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";
import styles from "./QuickActionCard.module.css";

interface QuickActionCardProps {
  icon: IconName;
  label: string;
  /** Pass "-" (or any non-numeric placeholder) when there's nothing to act on yet. */
  value: string | number;
  onClick: () => void;
  title?: string;
}

/** Deliveries / Pick list / Cash-up card. Desktop: icon+label left, value right.
 *  Mobile (`context/designs/Mobile - Dashboard.png`): value+icon on one line,
 *  label below — same flat markup, reordered via CSS (see .module.css). */
export function QuickActionCard({
  icon,
  label,
  value,
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
      <span className={styles.iconWrap}>
        <Icon name={icon} size={24} />
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </button>
  );
}
