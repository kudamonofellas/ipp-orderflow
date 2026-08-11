import { useLanguage } from '../../hooks/useLanguage';
import { statusColor } from '../../lib/pipeline';
import styles from './StatusPill.module.css';

interface StatusPillProps {
    /** The status string from your database, e.g. "intake", "delivered" */
    status?: string | null;
    /** A more specific label that replaces the generic stage label when
     *  present (e.g. dispatch's "Out for delivery" / "Awaiting driver" from
     *  `dispatchSubLabel()` in lib/pipeline.ts) — the pill always shows
     *  exactly one label, never both. Colour still comes from `status`
     *  (the role that owns it), regardless of which text is shown. */
    subLabel?: string | null;
    /** Optional extra CSS class name */
    className?: string;
}

/** Status key → display label only — colour comes exclusively from
 *  `statusColor()` (role-derived), never a per-entry value here. Keeps the
 *  old collision risk (two unrelated stages accidentally sharing a hex)
 *  structurally impossible: one function, one role, one colour. */
const STATUS_LABELS: Record<string, string> = {
    intake: 'New Order',
    cold: 'Cold Storage',
    finance: 'Finance Review',
    production: 'Processing',
    packing: 'Packing',
    finalise: 'Print DO/SI',
    dispatch: 'Dispatch',
    delivered: 'Delivered',
    awaiting_return: 'Awaiting Return',
    admin_action: 'Admin Action',
    awaiting_signed_doc: 'Signed DO/SI Out',
    replacement_transit: 'Replacement Transit',
    cancelled: 'Cancelled',
    returned: 'Returned',
    outstanding: 'Outstanding',
    awaiting: 'Awaiting Stock',
};

/** Helper to format fallback status labels (e.g., "unknown_stage" -> "Unknown Stage") */
function formatFallback(rawStatus: string): string {
    return rawStatus
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusPill({ status, subLabel, className }: StatusPillProps) {
    const { t } = useLanguage();
    const key = status?.toLowerCase().trim() ?? '';
    const fallbackLabel = STATUS_LABELS[key] ?? (key ? formatFallback(key) : 'Unknown');
    // Exactly one label, always — a more specific subLabel (when passed)
    // replaces the generic stage label rather than stacking under it.
    const displayLabel = subLabel ?? fallbackLabel;
    const color = statusColor(key);

    const classes = [styles.statusPill, className].filter(Boolean).join(' ');

    return (
        <span
            className={classes}
            style={{
                backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
                color,
                borderColor: `color-mix(in srgb, ${color} 33%, transparent)`,
            }}
        >
            <span className={styles.dot} style={{ backgroundColor: color }} />
            <span className={styles.label}>{t(displayLabel)}</span>
        </span>
    );
}
