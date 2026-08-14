import { Icon } from "../Icon/Icon";
import styles from "./SortableTh.module.css";

interface SortableThProps {
  label: string;
  /** The bare Directus sort field this column drives, e.g. "no" or "customer_name" — never prefixed with "-". */
  sortKey: string;
  /** The table's current sort string, e.g. "no" (ascending) or "-no" (descending). */
  activeSort: string;
  onSort: (nextSort: string) => void;
  className?: string;
}

/**
 * A sortable `<th>` — click (or Enter/Space) to sort by this column; a
 * second click flips direction. Replaces the old separate sort-dropdown
 * `Button` pattern with per-column headers, matching how spreadsheet-style
 * tables usually sort. Only the active column shows an icon (a single
 * `circleArrowUp` glyph, rotated 180° via CSS for descending — cheaper and
 * smoother than swapping between two separate icon assets).
 */
export function SortableTh({
  label,
  sortKey,
  activeSort,
  onSort,
  className,
}: SortableThProps) {
  const isAsc = activeSort === sortKey;
  const isDesc = activeSort === `-${sortKey}`;
  const isActive = isAsc || isDesc;

  function toggle() {
    onSort(isAsc ? `-${sortKey}` : sortKey);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <th
      className={[styles.th, isActive ? styles.active : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : undefined}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <span className={styles.inner}>
        <span className={isActive ? styles.active : ""}>{label}</span>
        {isActive && (
          <span
            className={[styles.iconWrap, isDesc ? styles.iconDesc : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <Icon name="chevronUp" size={14} />
          </span>
        )}
      </span>
    </th>
  );
}
