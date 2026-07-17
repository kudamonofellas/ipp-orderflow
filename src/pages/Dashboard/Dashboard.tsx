import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { ChannelSelectModal } from '../../components/ChannelSelectModal/ChannelSelectModal';
import { IntakeModal } from '../../components/IntakeModal/IntakeModal';
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
import type { ParsedOrderDraft } from '../../lib/directus';

const METRIC_ICONS: Record<string, IconName> = {
  open: 'total',
  today: 'store',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

/** Admin dashboard — mirrors context/designs/Dashboard.png. */
export function Dashboard() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('-order_id');
  const [deliveredRange, setDeliveredRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });
  const [cancelledRange, setCancelledRange] = useState<RangeWithLabel>({ val: { type: 'today' }, label: 'Today' });

  const { orders: openOrders, loading: ordersLoading, error, total, page, pageSize, setPage, refetch: refetchOrders } = useOpenOrders(sortBy);
  const { metrics, stageCounts, loading: countsLoading, refetch: refetchCounts } = useDashboardCounts(
    deliveredRange,
    cancelledRange,
  );
  const canCreateOrders = useCan()('createOrders');
  const currentUserName = useCurrentUserName();

  // Multi-step "Add New Order" flow:
  // step 0: idle, step 1: channel selection, step 2: intake, step 3: order form
  const [orderStep, setOrderStep] = useState<0 | 1 | 2 | 3>(0);
  const [parsedDraft, setParsedDraft] = useState<ParsedOrderDraft | null>(null);

  function startNewOrder() { setOrderStep(1); }
  function closeAll() { setOrderStep(0); setParsedDraft(null); }

  function handleChannelSelect(_channel: 'horeca') {
    // channel stored for IntakeModal label — currently only horeca
    setOrderStep(2);
  }

  function handleParsed(draft: ParsedOrderDraft) {
    setParsedDraft(draft);
    setOrderStep(3);
  }

  function handleOrderCreated() {
    refetchOrders();
    refetchCounts();
    closeAll();
  }

  const isLoading = ordersLoading || countsLoading;

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
                    onRangeChange={
                      (metric.id === 'delivered' || metric.id === 'cancelled')
                        ? (val, label) => {
                          if (metric.id === 'delivered') setDeliveredRange({ val, label });
                          else if (metric.id === 'cancelled') setCancelledRange({ val, label });
                        }
                        : undefined
                    }
                  />
                ))}
              </div>

              {canCreateOrders && (
                <button
                  type="button"
                  id="dashboard-new-order"
                  className={styles.newOrderCard}
                  onClick={startNewOrder}
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

      <ChannelSelectModal
        open={orderStep === 1}
        onClose={closeAll}
        onSelect={handleChannelSelect}
      />

      <IntakeModal
        open={orderStep === 2}
        channel="horeca"
        onClose={closeAll}
        onParsed={handleParsed}
      />

      <NewOrderModal
        open={orderStep === 3}
        onClose={closeAll}
        onCreated={handleOrderCreated}
        prefill={parsedDraft}
      />
    </div>
  );
}
