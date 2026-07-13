import { Icon } from '../../../components/Icon/Icon';
import { Card } from '../../../components/Card/Card';
import type { AttentionItem } from '../../../types/dashboard';
import styles from './AttentionPanel.module.css';

interface AttentionPanelProps {
  items: AttentionItem[];
}

/**
 * "Need attention" panel: buckets of items the current role must process
 * (e.g. orders to print DO/SI for, drafts to review, returns needing an
 * admin action). Replaces the old "Need approval" panel.
 */
export function AttentionPanel({ items }: AttentionPanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>Needs Attention</h3>
      <div className={styles.list}>
        {items.map((item) => (
          <button key={item.id} type="button" className={styles.row}>
            <span className={styles.content}>
              <Icon name="alert" size={16} className={styles.alertIcon} />
              <span className={styles.label}>{item.label}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
