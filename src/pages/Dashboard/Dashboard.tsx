import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { Button } from '../../components/Button/Button';
import { ChannelSelectModal } from '../../components/ChannelSelectModal/ChannelSelectModal';
import { IntakeModal } from '../../components/IntakeModal/IntakeModal';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { NewOrderModal } from '../../components/NewOrderModal/NewOrderModal';
import { NotificationsPopover } from '../../components/NotificationsPopover/NotificationsPopover';
import { StagePill } from '../../components/StagePill/StagePill';
import {
  attentionItems,
  intakeMessages,
} from '../../data/mockDashboard';
import { useCan, useCurrentUserName, useRole } from '../../hooks/useAuth';
import { ADMIN_HIGHLIGHT_STAGES, PIPELINE_STAGES, RETURN_STAGES } from '../../lib/pipeline';
import { useDashboardCounts, type RangeWithLabel } from '../../hooks/useDashboardCounts';
import { useOpenOrders } from '../../hooks/useOpenOrders';
import { AttentionPanel } from './sections/AttentionPanel';
import { IntakePanel } from './sections/IntakePanel';
import { OpenOrdersPanel } from './sections/OpenOrdersPanel';
import { ReturnWorkflowsPanel } from './sections/ReturnWorkflowsPanel';
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
  const role = useRole();
  const isAdminOrOwner = role === 'Admin' || role === 'Owner';

  // Multi-step "Add New Order" flow:
  // step 0: idle, step 1: channel selection, step 2: intake, step 3: order form
  const [orderStep, setOrderStep] = useState<0 | 1 | 2 | 3>(0);
  const [parsedDraft, setParsedDraft] = useState<ParsedOrderDraft | null>(null);

  function startNewOrder() { setOrderStep(1); }
  function closeAll() { setOrderStep(0); setParsedDraft(null); }

  function handleChannelSelect(_channel: 'horeca') {
    // channel stored for IntakeModal label — currently only horeca
    void _channel;
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
            {/* TopRow: welcome (left) | notifications + New Order (right). */}
            <div className={styles.topRow}>
              <div className={styles.welcome}>
                <p className={styles.label}>Welcome</p>
                <h1 className={styles.welcomeName}>{currentUserName || '—'}</h1>
              </div>

              <div className={styles.topActions}>
                <NotificationsPopover />
                {canCreateOrders && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={startNewOrder}
                    title="Create a new order"
                  >
                    <Icon name="add" size={20} />
                    New Order
                  </Button>
                )}
              </div>
            </div>

            {/* Metrics row — 4 cards. */}
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

            {/* Stage pills grid. Stages owned by the current role are highlighted. */}
            <div className={styles.heading}>
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

            {/* 3-column panels: Return Workflows | Needs Attention | WhatsApp Intake (admin/owner only). */}
            <div className={isAdminOrOwner ? styles.panelsGrid : styles.panelsGridTwo}>
              <ReturnWorkflowsPanel
                stages={returnsWorkflow}
                onStageClick={(key) => navigate('/orders', { state: { stage: key } })}
              />
              <AttentionPanel items={attentionItems} />
              {isAdminOrOwner && <IntakePanel messages={intakeMessages} />}
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
