import { Icon } from "../Icon/Icon";
import styles from "./DigestTile.module.css";

interface DigestTileProps {
  value: number | string;
  label: string;
  loud?: boolean;
  onClick: () => void;
}

/** Single "Needs attention today" tile — MetricCard-style bordered card,
 * with a chevron standing in for MetricCard's range-dropdown control. */
export function DigestTile({ value, label, loud, onClick }: DigestTileProps) {
  return (
    <button
      type="button"
      className={[styles.tile, loud ? styles.tileLoud : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <div className={styles.header}>
        <span className={styles.value}>{value}</span>
        <Icon name="chevronRight" size={20} className={styles.chevron} />
      </div>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
