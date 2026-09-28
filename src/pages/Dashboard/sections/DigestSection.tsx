import { Icon } from "../../../components/Icon/Icon";
import { DigestTile } from "../../../components/DigestTile/DigestTile";
import { useLanguage } from "../../../hooks/useLanguage";
import styles from "./DigestSection.module.css";

export interface DigestTileData {
  key: string;
  value: string | number;
  label: string;
  loud: boolean;
  onClick: () => void;
}

interface DigestSectionProps {
  tiles: DigestTileData[];
  deliveredToday: number;
  codCollectedTodayLabel: string;
}

/**
 * "Needs attention today" digest — Owner-only quick-glance tiles plus a
 * "Done today" summary row. Purely presentational: the parent computes
 * `tiles` (each already carrying its own click handler) and the two
 * "Done today" figures, since building them needs data (cash-up groups,
 * digest hook, navigate) that doesn't belong in a display component.
 */
export function DigestSection({
  tiles,
  deliveredToday,
  codCollectedTodayLabel,
}: DigestSectionProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.section}>
      {/* Mobile-only section title (hidden on desktop via CSS, same pattern
          as DashboardHeader's avatarSlot). On a phone this section stacks,
          so "Done today" is demoted to a subheading under a proper title
          matching the other sections' uppercase-with-rule headings. On
          desktop "Done today" stays the heading, as before. */}
      <div className={styles.mobileTitleRow}>
        <span className={styles.sectionHeading}>
          {t("Needs attention today")}
        </span>
        <span className={styles.separator} />
      </div>
      <div className={styles.sectionHeadingRow}>
        <span className={styles.sectionHeading}>{t("Done today")}</span>
        <span className={styles.separator} />
        <span className={styles.doneItemsGroup}>
          <span className={styles.doneItem}>
            <Icon name="check" size={16} />
            {deliveredToday} {t("delivered")}
          </span>
          <span className={styles.doneItem}>
            <Icon name="cash" size={16} />
            {codCollectedTodayLabel} {t("collected")}
          </span>
        </span>
      </div>
      <div className={styles.digestGrid}>
        {tiles.map((tile) => (
          <DigestTile
            key={tile.key}
            value={tile.value}
            label={tile.label}
            loud={tile.loud}
            onClick={tile.onClick}
          />
        ))}
      </div>
    </div>
  );
}
