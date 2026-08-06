import { Card } from '../../../components/Card/Card';
import type { Stage } from '../../../lib/pipeline';
import type { StageCount } from '../../../types/dashboard';
import styles from './ReturnWorkflowsPanel.module.css';

interface ReturnWorkflowsPanelProps {
  stages: StageCount[];
  /** Return-bucket keys the current role owns (from `ROLE_FOCUS`); those pills get the accent treatment. */
  focusStages?: Stage[];
  onStageClick?: (stageKey: string) => void;
}

/** Return Workflows panel: vertical list of horizontal pills (count + label). */
export function ReturnWorkflowsPanel({ stages, focusStages = [], onStageClick }: ReturnWorkflowsPanelProps) {
  return (
    <Card style={{ width: '100%' }}>
      <h3 className={styles.heading}>Return Workflows</h3>
      <div className={styles.list}>
        {stages.map((stage) => {
          const highlight = focusStages.includes(stage.stage);
          return (
            <button
              key={stage.stage}
              type="button"
              className={[styles.pill, highlight ? styles.pillHighlight : ''].filter(Boolean).join(' ')}
              onClick={() => onStageClick?.(stage.stage)}
            >
              <span className={stage.count > 0 ? styles.countActive : styles.count}>
                {stage.count}
              </span>
              <span className={styles.label}>{stage.label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
