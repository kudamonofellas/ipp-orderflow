import { Card } from '../../../components/Card/Card';
import { useLanguage } from '../../../hooks/useLanguage';
import { statusColor, ROLE_COLOR, type Stage } from '../../../lib/pipeline';
import type { Role } from '../../../lib/domain';
import type { StageCount } from '../../../types/dashboard';
import styles from './ReturnWorkflowsPanel.module.css';

interface ReturnWorkflowsPanelProps {
  stages: StageCount[];
  /** Return-bucket keys the current role owns (from `ROLE_FOCUS`); those pills get the accent treatment. */
  focusStages?: Stage[];
  /** The signed-in role — only needed to colour the `replacement_transit`
   *  tile (see below); every other bucket colours itself via `statusColor()`. */
  currentRole?: Role | null;
  onStageClick?: (stageKey: string) => void;
}

/** Return Workflows panel: vertical list of horizontal pills (count + label). */
export function ReturnWorkflowsPanel({
  stages,
  focusStages = [],
  currentRole,
  onStageClick,
}: ReturnWorkflowsPanelProps) {
  const { t } = useLanguage();
  return (
    <Card style={{ width: '100%' }}>
      <h3 className={styles.heading}>{t('Return Workflows')}</h3>
      <div className={styles.list}>
        {stages.map((stage) => {
          const highlight = focusStages.includes(stage.stage);
          // `replacement_transit` spans every role (Warehouse/Production/Courier/
          // Admin can all "own" it depending on where the replacement order
          // currently sits), so `statusColor()` deliberately can't claim a
          // single fixed role's colour for it (see pipeline.ts's
          // `RETURN_BUCKET_ACTOR` doc comment). It's only ever highlighted at
          // all when the SIGNED-IN role is one of the ones that can own it
          // (`ROLE_FOCUS`), so — unlike every other bucket, which is colour-
          // keyed by its one fixed owning role — this tile colours itself by
          // *whoever's currently looking at it*. A previous pass instead
          // special-cased it to a flat danger-red, which read as an urgent/
          // error state for every role even on a routine in-transit
          // replacement — reverted per direct request in favour of this
          // per-viewer role colour, matching how every other highlighted
          // tile in this panel already looks (an accent colour, not a
          // warning colour).
          const color = !highlight
            ? undefined
            : stage.stage === 'replacement_transit' && currentRole
              ? ROLE_COLOR[currentRole]
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
