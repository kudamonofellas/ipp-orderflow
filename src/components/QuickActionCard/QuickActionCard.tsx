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

/** Deliveries / Pick list / Cash-up card: icon + label left, value right.
 *  One layout at every width — on mobile the cards stack vertically (see
 *  DashboardHeader.module.css) rather than switching to a separate compact
 *  variant, which was removed 2026-09-28. */
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
