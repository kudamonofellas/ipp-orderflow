import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { StagePill } from '../../components/StagePill/StagePill';
import {
  attentionItems,
  currentUser,
  intakeMessages,
} from '../../data/mockDashboard';
import { ADMIN_HIGHLIGHT_STAGES, PIPELINE_STAGES, RETURN_STAGES } from '../../lib/pipeline';
import { useDashboardCounts } from '../../hooks/useDashboardCounts';
import { useOpenOrders } from '../../hooks/useOpenOrders';
import { AttentionPanel } from './sections/AttentionPanel';
import { IntakePanel } from './sections/IntakePanel';
import { OpenOrdersPanel } from './sections/OpenOrdersPanel';
import styles from './Dashboard.module.css';

const METRIC_ICONS: Record<string, IconName> = {
  total: 'total',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
};

/** Admin dashboard — mirrors context/designs/Dashboard.png. */
export function Dashboard() {
  const { orders: openOrders, loading, error, total, page, pageSize, setPage } = useOpenOrders();
  const { metrics, stageCounts } = useDashboardCounts();
  const currentPipeline = stageCounts.filter((stage) =>
    PIPELINE_STAGES.some((pipeline) => pipeline.key === stage.stage),
  );
  const returnsWorkflow = stageCounts.filter((stage) =>
    RETURN_STAGES.some((pipeline) => pipeline.key === stage.stage),
  );

  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        {/* Welcome + metrics row. "Add New Order" sits at the very end. */}
        <div className={styles.topRow}>
          <div className={styles.welcome}>
            <p className={styles.label}>Welcome</p>
            <h1 className={styles.welcomeName}>{currentUser.name}</h1>
          </div>

          <div className={styles.metricsRow}>
            {metrics.map((metric) => (
              <MetricCard
                key={metric.id}
                icon={METRIC_ICONS[metric.id] ?? 'total'}
                value={metric.value}
                label={metric.label}
                range={metric.range}
              />
            ))}
          </div>

          <button type="button" className={styles.newOrderCard}>
            <Icon name="add" size={24} />
            <span>New Order</span>
          </button>

        </div>

        {/* Stage pills grid. Stages owned by the current role are highlighted. */}
        <div className={styles.label}>
          Current order pipeline
        </div>
        <div className={styles.currentStages}>
          {currentPipeline.map((stage) => (
            <StagePill
              key={stage.stage}
              count={stage.count}
              label={stage.label}
              highlight={ADMIN_HIGHLIGHT_STAGES.includes(stage.stage)}
            />
          ))}
        </div>

        <div className={styles.label}>
          Returns workflow
        </div>
        <div className={styles.returnStages}>
          {returnsWorkflow.map((stage) => (
            <StagePill
              key={stage.stage}
              count={stage.count}
              label={stage.label}
              highlight={ADMIN_HIGHLIGHT_STAGES.includes(stage.stage)}
            />
          ))}
        </div>

        {/* Attention + intake side by side. Open orders full width below. */}
        <div className={styles.panels}>
          <IntakePanel messages={intakeMessages} />
          <AttentionPanel items={attentionItems} />
        </div>

        <OpenOrdersPanel
          orders={openOrders}
          loading={loading}
          error={error}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
