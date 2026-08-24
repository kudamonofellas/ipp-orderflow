import { Icon } from "../Icon/Icon";
import { useLanguage } from "../../hooks/useLanguage";
import { statusColor, STAGE_LABELS } from "../../lib/pipeline";
import styles from "./StatusPill.module.css";

interface StatusPillProps {
  /** The status string from your database, e.g. "intake", "delivered" */
  status?: string | null;
  /** A more specific label that replaces the generic stage label when
   *  present (e.g. dispatch's "Out for delivery" / "Awaiting driver" from
   *  `dispatchSubLabel()` in lib/pipeline.ts) — the pill always shows
   *  exactly one label, never both. Colour still comes from `status`
   *  (the role that owns it), regardless of which text is shown. */
  subLabel?: string | null;
  /** When true, renders a small "Replacement" badge next to the pill
   *  (`order.is_replacement`) — a separate chip, not merged into the
   *  pill's own label, since a replacement order's stage/colour is still
   *  whichever role currently holds it (see the note on
   *  `RETURN_BUCKET_ACTOR` in lib/pipeline.ts for why this isn't a colour
   *  by itself). */
  isReplacement?: boolean;
  /** When true, renders a small "Signed DO/SI not returned yet" badge */
  pendingDocs?: boolean;
  /** When true, renders a small "On hold" badge with pause icon */
  isHold?: boolean;
  /** Optional extra CSS class name */
  className?: string;
}

export interface SubStatusBadgesProps {
  isReplacement?: boolean;
  pendingDocs?: boolean;
  isHold?: boolean;
  className?: string;
}

export function SubStatusBadges({
  isReplacement,
  pendingDocs,
  isHold,
  className,
}: SubStatusBadgesProps) {
  const { t } = useLanguage();

  if (!isReplacement && !pendingDocs && !isHold) {
    return null;
  }

  return (
    <span className={[styles.subStatusWrap, className].filter(Boolean).join(" ")}>
      {isReplacement && (
        <span className={styles.subStatusBadge} title={t("Replacement")}>
          <Icon name="reload" size={11} />
          {t("Replacement")}
        </span>
      )}
      {pendingDocs && (
        <span
          className={styles.subStatusBadge}
          title={t("Signed DO/SI not returned yet")}
        >
          <Icon name="document" size={11} />
          {t("Signed DO/SI not returned yet")}
        </span>
      )}
      {isHold && (
        <span
          className={styles.subStatusBadge}
          title={t("On hold")}
        >
          <Icon name="pause" size={11} />
          {t("On hold")}
        </span>
      )}
    </span>
  );
}

/** Helper to format fallback status labels (e.g., "unknown_stage" -> "Unknown Stage") */
function formatFallback(rawStatus: string): string {
  return rawStatus
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusPill({
  status,
  subLabel,
  isReplacement,
  pendingDocs,
  isHold,
  className,
}: StatusPillProps) {
  const { t } = useLanguage();
  const key = status?.toLowerCase().trim() ?? "";
  // Single source of truth for every stage/return-bucket label — see
  // `STAGE_LABELS` in `lib/pipeline.ts`. Previously duplicated here with
  // its own (slightly different, prototype-mismatching) values —
  // reported directly.
  const fallbackLabel =
    STAGE_LABELS[key as keyof typeof STAGE_LABELS] ??
    (key ? formatFallback(key) : "Unknown");
  // Exactly one label, always — a more specific subLabel (when passed)
  // replaces the generic stage label rather than stacking under it.
  const displayLabel = subLabel ?? fallbackLabel;
  const color = statusColor(key);

  const classes = [styles.statusPill, className].filter(Boolean).join(" ");

  return (
    <span className={styles.wrap}>
      <span
        className={classes}
        style={{
          color,
        }}
      >
        <span className={styles.dot} style={{ backgroundColor: color }} />
        <span className={styles.label}>{t(displayLabel)}</span>
      </span>
      <SubStatusBadges
        isReplacement={isReplacement}
        pendingDocs={pendingDocs}
        isHold={isHold}
      />
    </span>
  );
}
