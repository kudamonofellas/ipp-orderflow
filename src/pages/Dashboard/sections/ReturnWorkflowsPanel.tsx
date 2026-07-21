import { Card } from '../../../components/Card/Card';
import type { StageCount } from '../../../types/dashboard';
import styles from './ReturnWorkflowsPanel.module.css';

interface ReturnWorkflowsPanelProps {
  stages: StageCount[];
  onStageClick?: (stageKey: string) => void;
}

/** Return Workflows panel: vertical list of horizontal pills (count + label). */
export function ReturnWorkflowsPanel({ stages, onStageClick }: ReturnWorkflowsPanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>Return Workflows</h3>
      <div className={styles.list}>
        {stages.map((stage) => (
          <button
            key={stage.stage}
            type="button"
            className={styles.pill}
            onClick={() => onStageClick?.(stage.stage)}
          >
            <span className={stage.count > 0 ? styles.countActive : styles.count}>
              {stage.count}
            </span>
            <span className={styles.label}>{stage.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
