import { Card } from '../../../components/Card/Card';
import { useLanguage } from '../../../hooks/useLanguage';
import { statusColor, type Stage } from '../../../lib/pipeline';
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
  const { t } = useLanguage();
  return (
    <Card style={{ width: '100%' }}>
      <h3 className={styles.heading}>{t('Return Workflows')}</h3>
      <div className={styles.list}>
        {stages.map((stage) => {
          const highlight = focusStages.includes(stage.stage);
          // `replacement_transit` spans every role (Warehouse/Production/Courier/
          // Admin can all "own" it depending on where the replacement order
          // currently sits), so `statusColor()` deliberately can't claim a single
          // role's colour for it (falls through to neutral) — but the tile still
          // needs to read as urgent when it's highlighted. Danger-red here is
          // local to this one bucket tile, not routed through `statusColor()`,
          // so it can't affect a replacement order's own `StatusPill` (which
          // colours by its real current stage, with a separate `isReplacement`
          // badge — see pipeline.ts's `RETURN_BUCKET_ACTOR` doc comment).
          const color = !highlight
            ? undefined
            : stage.stage === 'replacement_transit'
              ? 'var(--state-error)'
              : statusColor(stage.stage);
          const style = color
            ? ({
                '--stage-color': color,
                backgroundColor: `color-mix(in srgb, ${color} 12%, var(--bg-surface))`,
                borderColor: color,
              } as React.CSSProperties)
            : undefined;
          return (
            <button
              key={stage.stage}
              type="button"
              className={[styles.pill, highlight ? styles.pillHighlight : ''].filter(Boolean).join(' ')}
              style={style}
              onClick={() => onStageClick?.(stage.stage)}
            >
              <span
                className={stage.count > 0 ? styles.countActive : styles.count}
                style={color ? { color } : undefined}
              >
                {stage.count}
              </span>
              <span className={styles.label} style={color ? { color } : undefined}>
                {t(stage.label)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
