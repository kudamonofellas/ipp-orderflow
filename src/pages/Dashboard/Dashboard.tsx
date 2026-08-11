import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IconName } from "../../components/Icon/icons";
import { Button } from "../../components/Button/Button";
import { Icon } from "../../components/Icon/Icon";
import { DigestTile } from "../../components/DigestTile/DigestTile";
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
import { PIPELINE_STAGES, ROLE_FOCUS, RETURN_STAGES, statusColor } from "../../lib/pipeline";
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
import { OpenOrdersPanel } from "./sections/OpenOrdersPanel";
import { ReturnWorkflowsPanel } from "./sections/ReturnWorkflowsPanel";
import styles from "./Dashboard.module.css";

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
  const quickActionCount = [
    canViewDeliveryRun,
    canViewPickList,
    canReconcileCOD,
  ].filter(Boolean).length;

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
                    onClick={() =>
                      navigate("/orders/new", { state: { from: "/" } })
                    }
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
                  {
                    "--quick-action-count": quickActionCount,
                  } as React.CSSProperties
                }
              >
                {canViewDeliveryRun && (
                  <QuickActionCard
                    icon="navigation"
                    label={t("My deliveries")}
                    value={
                      deliveryStops.length > 0 ? deliveryStops.length : "-"
                    }
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
            {showDigest && !digest.loading && (
              <div className={styles.digestSection}>
                <div className={styles.sectionHeading}>
                  {t("Needs attention today")}
                </div>
                <div className={styles.digestGrid}>
                  {digestTiles.map((tile) => (
                    <DigestTile
                      key={tile.key}
                      value={tile.value}
                      label={tile.label}
                      loud={tile.loud}
                      onClick={tile.onClick}
                    />
                  ))}
                </div>
                <div className={styles.doneRow}>
                  <span className={styles.doneItem}>{t("Done today")}</span>
                  <span className={styles.separator} />
                  <span className={styles.doneItem}>
                    <Icon name="check" size={16} />
                    {digest.deliveredToday} {t("delivered")}
                  </span>
                  <span className={styles.doneItem}>
                    <Icon name="cash" size={16} />
                    {currency.format(digest.codCollectedTodayAmount)}{" "}
                    {t("collected")}
                  </span>
                </div>
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
                    color={statusColor(stage.stage)}
                    onClick={() => navigate(`/orders?stage=${stage.stage}`)}
                  />
                ))}
              </div>
            </div>

            {/* 2-column panels: Return Workflows | Needs Attention. */}
            <div className={styles.panelsGridTwo}>
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
    </div>
  );
}
