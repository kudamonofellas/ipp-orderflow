import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IconName } from "../../components/Icon/icons";
import { Button } from "../../components/Button/Button";
import { ChannelSelectModal } from "../../components/ChannelSelectModal/ChannelSelectModal";
import { IntakeModal } from "../../components/IntakeModal/IntakeModal";
import { MetricCard } from "../../components/MetricCard/MetricCard";
import { NotificationsPopover } from "../../components/NotificationsPopover/NotificationsPopover";
import { QuickActionCard } from "../../components/QuickActionCard/QuickActionCard";
import { StagePill } from "../../components/StagePill/StagePill";
import {
  useCan,
  useCurrentUserId,
  useCurrentUserName,
  useRole,
} from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { PIPELINE_STAGES, ROLE_FOCUS, RETURN_STAGES } from "../../lib/pipeline";
import { useAttentionItems } from "../../hooks/useAttentionItems";
import { useCashUp } from "../../hooks/useCashUp";
import {
  useDashboardCounts,
  type RangeWithLabel,
} from "../../hooks/useDashboardCounts";
import { useDeliveries } from "../../hooks/useDeliveries";
import { useIntakeMessages } from "../../hooks/useIntakeMessages";
import { useOpenOrders } from "../../hooks/useOpenOrders";
import { usePickList } from "../../hooks/usePickList";
import { AttentionPanel } from "./sections/AttentionPanel";
import { IntakePanel } from "./sections/IntakePanel";
import { OpenOrdersPanel } from "./sections/OpenOrdersPanel";
import { ReturnWorkflowsPanel } from "./sections/ReturnWorkflowsPanel";
import styles from "./Dashboard.module.css";
import type { ParsedOrderDraft } from "../../lib/directus";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Rp 3.85 jt" — simplified millions shorthand for the Cash-up quick-action card. */
function formatRupiahShort(amount: number): string {
  if (amount <= 0) return "-";
  return `Rp ${(amount / 1_000_000).toFixed(2)} jt`;
}

const METRIC_ICONS: Record<string, IconName> = {
  open: "total",
  total: "store",
  delivered: "delivered",
  cancelled: "cancelled",
};

/** Admin dashboard — mirrors context/designs/Dashboard.png. */
export function Dashboard() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState("-no");
  const [totalRange, setTotalRange] = useState<RangeWithLabel>({
    val: { type: "all" },
    label: "All time",
  });
  const [deliveredRange, setDeliveredRange] = useState<RangeWithLabel>({
    val: { type: "all" },
    label: "All time",
  });
  const [cancelledRange, setCancelledRange] = useState<RangeWithLabel>({
    val: { type: "all" },
    label: "All time",
  });

  const {
    orders: openOrders,
    loading: ordersLoading,
    error,
    total,
    page,
    pageSize,
    setPage,
  } = useOpenOrders(sortBy);
  const {
    metrics,
    stageCounts,
    loading: countsLoading,
  } = useDashboardCounts(totalRange, deliveredRange, cancelledRange);
  const { items: attentionItems, loading: attentionLoading } =
    useAttentionItems();
  const {
    messages: intakeMessages,
    loading: intakeLoading,
    error: intakeError,
  } = useIntakeMessages();
  const can = useCan();
  const canCreateOrders = can("createOrders");
  const canViewIntakePanel = can("viewIntakePanel");
  const canViewPickList = can("viewPickList");
  const canViewDeliveryRun = can("viewDeliveryRun");
  const canReconcileCOD = can("reconcileCOD");
  const currentUserName = useCurrentUserName();
  const currentUserId = useCurrentUserId();
  const role = useRole();
  const { t } = useLanguage();
  const focusStages = role ? ROLE_FOCUS[role] : [];

  // Quick-action cards (Deliveries / Pick list / Cash-up) — loaded
  // independently of the main dashboard gate so they don't slow first paint.
  // Same source of truth as each respective page, so the counts always match
  // what the user sees after clicking through (usePickList's `orderCount` in
  // particular — the Pick List page's own header badge reads the same field).
  const { stops: deliveryStops } = useDeliveries(currentUserId);
  const { orderCount: pickListOrderCount } = usePickList(todayISO());
  const { remaining: cashUpRemaining } = useCashUp();
  const quickActionCount = [
    canViewDeliveryRun,
    canViewPickList,
    canReconcileCOD,
  ].filter(Boolean).length;

  // Multi-step "Add New Order" flow:
  // step 0: idle, step 1: channel selection, step 2: intake
  const [orderStep, setOrderStep] = useState<0 | 1 | 2>(0);

  function startNewOrder() {
    setOrderStep(1);
  }
  function closeAll() {
    setOrderStep(0);
  }

  function handleChannelSelect(_channel: "horeca") {
    // channel stored for IntakeModal label — currently only horeca
    void _channel;
    setOrderStep(2);
  }

  function handleParsed(
    draft: ParsedOrderDraft,
    rawText: string,
    attachments: File[],
  ) {
    setOrderStep(0); // close the intake modal
    navigate("/orders/new", {
      state: { prefill: draft, rawText, attachments, from: "/" },
    });
  }

  const isLoading = ordersLoading || countsLoading || attentionLoading;

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
          <div className={styles.loading}>{t("Loading dashboard…")}</div>
        ) : (
          <>
            {/* TopRow: welcome (left) | notifications + New Order (right). */}
            <div className={styles.topRow}>
              <div className={styles.welcome}>
                <p className={styles.label}>{t("Welcome")}</p>
                <h1 className={styles.welcomeName}>{currentUserName || "—"}</h1>
              </div>

              <div className={styles.topActions}>
                <NotificationsPopover />
                {canCreateOrders && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={startNewOrder}
                    title={t("Create a new order")}
                    icon="add"
                  >
                    {t("New Order")}
                  </Button>
                )}
              </div>
            </div>

            {/* Metrics row — 4 cards. */}
            <div className={styles.metricsRow}>
              {metrics.map((metric) => (
                <MetricCard
                  key={metric.id}
                  icon={METRIC_ICONS[metric.id] ?? "total"}
                  value={metric.value}
                  label={t(metric.label)}
                  rangeLabel={metric.range}
                  onRangeChange={
                    metric.id !== "open"
                      ? (val, label) => {
                          if (metric.id === "total")
                            setTotalRange({ val, label });
                          else if (metric.id === "delivered")
                            setDeliveredRange({ val, label });
                          else if (metric.id === "cancelled")
                            setCancelledRange({ val, label });
                        }
                      : undefined
                  }
                />
              ))}
            </div>

            {/* Quick-action row — Deliveries / Pick list / Cash-up. Each card
                stays gated by its capability (hidden entirely, not shown
                empty); when the capability is present but there's nothing to
                act on, it renders "-" rather than disappearing. */}
            {quickActionCount > 0 && (
              <div
                className={styles.quickActionsRow}
                style={
                  { "--quick-action-count": quickActionCount } as React.CSSProperties
                }
              >
                {canViewDeliveryRun && (
                  <QuickActionCard
                    icon="navigation"
                    label={t("My deliveries")}
                    value={deliveryStops.length > 0 ? deliveryStops.length : "-"}
                    suffix={t("to deliver")}
                    title={t("See the delivery run-sheet")}
                    onClick={() => navigate("/deliveries")}
                  />
                )}
                {canViewPickList && (
                  <QuickActionCard
                    icon="picklist"
                    label={t("Pick list")}
                    value={pickListOrderCount > 0 ? pickListOrderCount : "-"}
                    suffix={t("to pick")}
                    title={t("See the aggregate pick list")}
                    onClick={() => navigate("/picklist")}
                  />
                )}
                {canReconcileCOD && (
                  <QuickActionCard
                    icon="cash"
                    label={t("Cash-up")}
                    value={formatRupiahShort(cashUpRemaining)}
                    suffix={t("to reconcile")}
                    title={t("Reconcile COD cash")}
                    onClick={() => navigate("/cashup")}
                  />
                )}
              </div>
            )}

            {/* Stage pills grid. Stages owned by the current role are highlighted. */}
            <div className={styles.pipelineRow}>
              <div className={styles.sectionHeading}>
                {t("Current order pipeline")}
              </div>
              <div className={styles.currentStages}>
                {currentPipeline.map((stage) => (
                  <StagePill
                    key={stage.stage}
                    count={stage.count}
                    label={t(stage.label)}
                    highlight={focusStages.includes(stage.stage)}
                    onClick={() => navigate(`/orders?stage=${stage.stage}`)}
                  />
                ))}
              </div>
            </div>

            {/* 3-column panels: Return Workflows | Needs Attention | WhatsApp Intake (gated on viewIntakePanel). */}
            <div
              className={
                canViewIntakePanel ? styles.panelsGrid : styles.panelsGridTwo
              }
            >
              <ReturnWorkflowsPanel
                stages={returnsWorkflow}
                focusStages={focusStages}
                onStageClick={(key) => navigate(`/orders?stage=${key}`)}
              />
              <AttentionPanel
                items={attentionItems}
                onItemClick={(stageKey) =>
                  navigate(`/orders?stage=${stageKey}`)
                }
              />
              {canViewIntakePanel && (
                <IntakePanel
                  messages={intakeMessages}
                  loading={intakeLoading}
                  error={intakeError}
                />
              )}
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
    </div>
  );
}
