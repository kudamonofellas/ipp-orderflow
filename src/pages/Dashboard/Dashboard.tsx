import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button/Button";
import { ChannelSelectModal } from "../../components/ChannelSelectModal/ChannelSelectModal";
import { IntakeModal } from "../../components/IntakeModal/IntakeModal";
import { NotificationsPopover } from "../../components/NotificationsPopover/NotificationsPopover";
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
import { useOpenOrders } from "../../hooks/useOpenOrders";
import { usePickList } from "../../hooks/usePickList";
import { useTodayDigest } from "../../hooks/useTodayDigest";
import { AttentionPanel } from "./sections/AttentionPanel";
import { DigestSection } from "./sections/DigestSection";
import { MetricsRow } from "./sections/MetricsRow";
import { OpenOrdersPanel } from "./sections/OpenOrdersPanel";
import { PipelineRow } from "./sections/PipelineRow";
import { QuickActionsRow } from "./sections/QuickActionsRow";
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

/** Full-Rupiah formatter for the "Needs attention today" digest — these are
 * figures reconciled against real cash/documents, not a glance-only metric,
 * so they're spelled out in full (unlike formatRupiahShort above). */
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/** Admin dashboard — mirrors context/designs/Dashboard.png. */
export function Dashboard() {
  const navigate = useNavigate();
  // Sort lives in the URL, same reasoning as Orders.tsx's stage/search — so
  // it survives OrderDetail's Back button (which navigates to the exact
  // pathname+search captured at click time, see OrderRows.tsx).
  const [searchParams, setSearchParams] = useSearchParams();
  const sortBy = searchParams.get("sort") || "-no";
  function setSortBy(next: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "-no") params.delete("sort");
      else params.set("sort", next);
      return params;
    });
  }
  const [totalRange, setTotalRange] = useState<RangeWithLabel>({
    val: { type: "today" },
    label: "Today",
  });
  const [deliveredRange, setDeliveredRange] = useState<RangeWithLabel>({
    val: { type: "today" },
    label: "Today",
  });
  const [cancelledRange, setCancelledRange] = useState<RangeWithLabel>({
    val: { type: "today" },
    label: "Today",
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
  const can = useCan();
  const canCreateOrders = can("createOrders");
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
  const { mine: deliveryStops } = useDeliveries(currentUserId);
  const { orderCount: pickListOrderCount } = usePickList(todayISO());
  const {
    remaining: cashUpRemaining,
    groups: cashUpGroups,
    confirmedIds: cashUpConfirmedIds,
  } = useCashUp();
  // "Needs attention today" digest — Owner-only per explicit instruction
  // (reverses an earlier decision this session to also show it to Admin).
  const showDigest = role === "Owner";
  const digest = useTodayDigest(showDigest);
  const codPendingCount = cashUpGroups.reduce(
    (sum, g) =>
      sum + g.orders.filter((o) => !cashUpConfirmedIds.has(o.orderId)).length,
    0,
  );
  const digestTiles = [
    {
      key: "cod",
      value: currency.format(cashUpRemaining),
      label: t("COD pending"),
      loud: codPendingCount > 0,
      onClick: () => navigate("/cashup"),
    },
    {
      key: "docs",
      value: digest.docsNotBack,
      label: t("DO/SI not back"),
      loud: digest.docsNotBack > 0,
      onClick: () => navigate("/orders?stage=pending-docs"),
    },
    {
      key: "road",
      value: digest.onTheRoad,
      label: t("On the road"),
      loud: false,
      onClick: () => navigate("/orders?stage=dispatch"),
    },
    {
      key: "returns",
      value: digest.returnsInFlight,
      label: t("Returns in flight"),
      loud: false,
      onClick: () => navigate("/orders?stage=returned"),
    },
    {
      key: "new",
      value: digest.newOrdersToday,
      label: t("New orders"),
      loud: false,
      onClick: () => navigate("/orders?stage=today"),
    },
  ];

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
          <div className={styles.container}>
            <div className={styles.sectionsContainer}>
              <p className={styles.muted}>{t("Loading dashboard…")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* TopRow: welcome (left) | notifications + New Order (right). */}
            <div className={styles.topRow}>
              <div className={styles.welcome}>
                <p className={styles.label}>{t("Welcome")}</p>
                <h1 className={styles.welcomeName}>{currentUserName || "—"}</h1>
              </div>

              <QuickActionsRow
                canViewDeliveryRun={canViewDeliveryRun}
                deliveryStopCount={deliveryStops.length}
                canViewPickList={canViewPickList}
                pickListOrderCount={pickListOrderCount}
                canReconcileCOD={canReconcileCOD}
                cashUpRemainingLabel={formatRupiahShort(cashUpRemaining)}
                onNavigateDeliveries={() => navigate("/deliveries")}
                onNavigatePickList={() => navigate("/picklist")}
                onNavigateCashUp={() => navigate("/cashup")}
              />

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

            <div className={styles.sectionsContainer}>
              {showDigest && !digest.loading && (
                <DigestSection
                  tiles={digestTiles}
                  deliveredToday={digest.deliveredToday}
                  codCollectedTodayLabel={currency.format(
                    digest.codCollectedTodayAmount,
                  )}
                />
              )}

              <MetricsRow
                metrics={metrics}
                onRangeChange={(metricId, val, label) => {
                  if (metricId === "total") setTotalRange({ val, label });
                  else if (metricId === "delivered")
                    setDeliveredRange({ val, label });
                  else if (metricId === "cancelled")
                    setCancelledRange({ val, label });
                }}
              />

              <PipelineRow
                stages={currentPipeline}
                focusStages={focusStages}
                onStageClick={(key) => navigate(`/orders?stage=${key}`)}
              />

              {/* 2-column panels: Return Workflows | Needs Attention. */}
              <div className={styles.panelsGridTwo}>
                <ReturnWorkflowsPanel
                  stages={returnsWorkflow}
                  focusStages={focusStages}
                  currentRole={role}
                  onStageClick={(key) => navigate(`/orders?stage=${key}`)}
                />
                <AttentionPanel
                  items={attentionItems}
                  onItemClick={(stageKey) =>
                    navigate(`/orders?stage=${stageKey}`)
                  }
                />
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
            </div>
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
