import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { NewOrderModal } from '../../components/NewOrderModal/NewOrderModal';
import { StagePill } from '../../components/StagePill/StagePill';
import {
  attentionItems,
  intakeMessages,
} from '../../data/mockDashboard';
import { useCan, useCurrentUserName } from '../../hooks/useAuth';
import { ADMIN_HIGHLIGHT_STAGES, PIPELINE_STAGES, RETURN_STAGES } from '../../lib/pipeline';
import { useDashboardCounts, type RangeWithLabel } from '../../hooks/useDashboardCounts';
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
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('-order_id');
  const [totalRange, setTotalRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });
  const [deliveredRange, setDeliveredRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });
  const [returnedRange, setReturnedRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });
  const [cancelledRange, setCancelledRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });

  const { orders: openOrders, loading: ordersLoading, error, total, page, pageSize, setPage, refetch: refetchOrders } = useOpenOrders(sortBy);
  const { metrics, stageCounts, loading: countsLoading, refetch: refetchCounts } = useDashboardCounts(
    totalRange,
    deliveredRange,
    returnedRange,
    cancelledRange,
  );
  const canCreateOrders = useCan()('createOrders');
  const currentUserName = useCurrentUserName();
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const isLoading = ordersLoading || countsLoading;

  function handleOrderCreated() {
    refetchOrders();
    refetchCounts();
  }

  const currentPipeline = stageCounts.filter((stage) =>
    PIPELINE_STAGES.some((pipeline) => pipeline.key === stage.stage),
  );
  const returnsWorkflow = stageCounts.filter((stage) =>
    RETURN_STAGES.some((pipeline) => pipeline.key === stage.stage),
  );

  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        {isLoading ? (
          <div className={styles.loading}>Loading dashboard…</div>
        ) : (
        <>
        {/* Welcome + metrics row. "Add New Order" sits at the very end if allowed. */}
        <div className={styles.topRow}>
          <div className={styles.welcome}>
            <p className={styles.label}>Welcome</p>
            <h1 className={styles.welcomeName}>{currentUserName || '—'}</h1>
          </div>

          <div className={styles.metricsRow}>
            {metrics.map((metric) => (
              <MetricCard
                key={metric.id}
                icon={METRIC_ICONS[metric.id] ?? 'total'}
                value={metric.value}
                label={metric.label}
                rangeLabel={metric.range}
                onRangeChange={(val, label) => {
                  if (metric.id === 'total') setTotalRange({ val, label });
                  else if (metric.id === 'delivered') setDeliveredRange({ val, label });
                  else if (metric.id === 'returned') setReturnedRange({ val, label });
                  else if (metric.id === 'cancelled') setCancelledRange({ val, label });
                }}
              />
            ))}
          </div>

          {canCreateOrders && (
            <button
              type="button"
              className={styles.newOrderCard}
              onClick={() => setNewOrderOpen(true)}
              title="Create a new order"
            >
              <Icon name="add" size={24} />
              <span>New Order</span>
            </button>
          )}

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
              onClick={() => navigate('/orders', { state: { stage: stage.stage } })}
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
              onClick={() => navigate('/orders', { state: { stage: stage.stage } })}
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
          loading={ordersLoading}
          error={error}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
        </>
        )}
      </div>

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        onCreated={handleOrderCreated}
      />
    </div>
  );
}
