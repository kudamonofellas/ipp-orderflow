import { ChevronDown } from 'lucide-react';
import { Card } from '../../../components/Card/Card';
import type { ApprovalItem } from '../../../types/dashboard';
import styles from './ApprovalPanel.module.css';

interface ApprovalPanelProps {
  items: ApprovalItem[];
}

/** Need approval panel: collapsible action-item buckets. */
export function ApprovalPanel({ items }: ApprovalPanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>Need approval</h3>
      <div className={styles.list}>
        {items.map((item) => (
          <button key={item.id} type="button" className={styles.row}>
            <span className={styles.label}>
              {item.label} ({item.count})
            </span>
            <ChevronDown size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        ))}
      </div>
    </Card>
  );
}
