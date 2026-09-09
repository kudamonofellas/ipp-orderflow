import { StagePill } from "../../../components/StagePill/StagePill";
import { useLanguage } from "../../../hooks/useLanguage";
import { statusColor } from "../../../lib/pipeline";
import type { StageCount } from "../../../types/dashboard";
import styles from "./PipelineRow.module.css";

interface PipelineRowProps {
  stages: StageCount[];
  /** Stage keys owned by the current role — highlighted in the row. */
  focusStages: string[];
  onStageClick: (stageKey: string) => void;
}

/** Stage pills grid for the main order pipeline. Stages owned by the
 *  current role are highlighted. */
export function PipelineRow({
  stages,
  focusStages,
  onStageClick,
}: PipelineRowProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeadingRow}>
        <div className={styles.sectionHeading}>
          {t("Current order pipeline")}
        </div>
        <div className={styles.separator} />
      </div>

      <div className={styles.currentStages}>
        {stages.map((stage) => (
          <StagePill
            key={stage.stage}
            count={stage.count}
            label={t(stage.label)}
            highlight={focusStages.includes(stage.stage)}
            color={statusColor(stage.stage)}
            onClick={() => onStageClick(stage.stage)}
          />
        ))}
      </div>
    </div>
  );
}
