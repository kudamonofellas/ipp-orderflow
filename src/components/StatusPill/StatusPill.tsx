import styles from './StatusPill.module.css';

interface StatusPillProps {
    /** The status string from your database, e.g. "intake", "delivered" */
    status?: string | null;
    /** Optional extra CSS class name */
    className?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
    intake: { label: 'New Order', color: '#3B82F6' },
    cold: { label: 'Cold Storage', color: '#06B6D4' },
    finance: { label: 'Finance Review', color: '#8B5CF6' },
    production: { label: 'Processing', color: '#F59E0B' },
    packing: { label: 'Packing', color: '#10B981' },
    finalise: { label: 'Print DO/SI', color: '#6366F1' },
    dispatch: { label: 'Dispatch', color: '#3B82F6' },
    delivered: { label: 'Delivered', color: '#10B981' },
    awaiting_return: { label: 'Awaiting Return', color: '#EF4444' },
    admin_action: { label: 'Admin Action', color: '#F59E0B' },
    awaiting_signed_doc: { label: 'Signed DO/SI Out', color: '#6366F1' },
    replacement_transit: { label: 'Replacement Transit', color: '#3B82F6' },
    cancelled: { label: 'Cancelled', color: '#6B7280' },
    returned: { label: 'Returned', color: '#EF4444' },
    outstanding: { label: 'Outstanding', color: '#EAB308' },
    awaiting: { label: 'Awaiting Stock', color: '#9CA3AF' },
};

/** Helper to format fallback status labels (e.g., "unknown_stage" -> "Unknown Stage") */
function formatFallback(rawStatus: string): string {
    return rawStatus
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusPill({ status, className }: StatusPillProps) {
    const key = status?.toLowerCase().trim() ?? '';
    const config = STATUS_MAP[key] ?? {
        label: key ? formatFallback(key) : 'Unknown',
        color: '#6B7280',
    };

    const classes = [styles.statusPill, className].filter(Boolean).join(' ');

    return (
        <span
            className={classes}
            style={{
                backgroundColor: `${config.color}22`, // ~13% transparency
                color: config.color,
                borderColor: `${config.color}55`, // ~33% transparency
            }}
        >
            {config.label}
        </span>
    );
}