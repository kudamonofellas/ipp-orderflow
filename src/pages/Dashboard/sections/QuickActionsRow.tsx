import { QuickActionCard } from "../../../components/QuickActionCard/QuickActionCard";
import { useLanguage } from "../../../hooks/useLanguage";
import styles from "./QuickActionsRow.module.css";

interface QuickActionsRowProps {
  canViewDeliveryRun: boolean;
  deliveryStopCount: number;
  canViewPickList: boolean;
  pickListOrderCount: number;
  canReconcileCOD: boolean;
  cashUpRemainingLabel: string;
  onNavigateDeliveries: () => void;
  onNavigatePickList: () => void;
  onNavigateCashUp: () => void;
}

/**
 * Quick-action row — Deliveries / Pick list / Cash-up. Each card stays
 * gated by its capability (hidden entirely, not shown empty); when the
 * capability is present but there's nothing to act on, it renders "-"
 * rather than disappearing. Column count tracks how many cards are
 * actually rendered (role-gated — 1, 2, or 3), via a --quick-action-count
 * custom property, so the visible cards always stretch to fill the row.
 */
export function QuickActionsRow({
  canViewDeliveryRun,
  deliveryStopCount,
  canViewPickList,
  pickListOrderCount,
  canReconcileCOD,
  cashUpRemainingLabel,
  onNavigateDeliveries,
  onNavigatePickList,
  onNavigateCashUp,
}: QuickActionsRowProps) {
  const { t } = useLanguage();
  const quickActionCount = [
    canViewDeliveryRun,
    canViewPickList,
    canReconcileCOD,
  ].filter(Boolean).length;

  if (quickActionCount === 0) return null;

  return (
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
          value={deliveryStopCount > 0 ? deliveryStopCount : "-"}
          title={t("See the delivery run-sheet")}
          onClick={onNavigateDeliveries}
        />
      )}
      {canViewPickList && (
        <QuickActionCard
          icon="picklist"
          label={t("Pick list")}
          value={pickListOrderCount > 0 ? pickListOrderCount : "-"}
          title={t("See the aggregate pick list")}
          onClick={onNavigatePickList}
        />
      )}
      {canReconcileCOD && (
        <QuickActionCard
          icon="cash"
          label={t("Cash-up")}
          value={cashUpRemainingLabel}
          title={t("Reconcile COD cash")}
          onClick={onNavigateCashUp}
        />
      )}
    </div>
  );
}
