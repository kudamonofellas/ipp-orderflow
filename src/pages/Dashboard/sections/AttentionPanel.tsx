import { Icon } from '../../../components/Icon/Icon';
import { Card } from '../../../components/Card/Card';
import type { AttentionItem } from '../../../types/dashboard';
import styles from './AttentionPanel.module.css';

interface AttentionPanelProps {
  items: AttentionItem[];
  /** Called with the item's `id` — doubles as the Orders-page stage filter key. */
  onItemClick?: (stageKey: string) => void;
}

/**
 * "Need attention" panel: buckets of items the current role must process
 * (e.g. orders to print DO/SI for, drafts to review, returns needing an
 * admin action). Replaces the old "Need approval" panel.
 */
export function AttentionPanel({ items, onItemClick }: AttentionPanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>Needs Attention</h3>
      {items.length === 0 ? (
        <p className={styles.empty}>Nothing needs attention right now.</p>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.row}
              onClick={() => onItemClick?.(item.id)}
            >
              <span className={styles.content}>
                <Icon name="alert" size={16} className={styles.alertIcon} />
                <span className={styles.label}>{item.label}</span>
              </span>
              <span className={styles.countBadge}>{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
