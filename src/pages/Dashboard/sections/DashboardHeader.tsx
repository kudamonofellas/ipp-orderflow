import { Button } from "../../../components/Button/Button";
import { NotificationsPopover } from "../../../components/NotificationsPopover/NotificationsPopover";
import { AvatarMenu } from "../../../components/AvatarMenu/AvatarMenu";
import { QuickActionCard } from "../../../components/QuickActionCard/QuickActionCard";
import { useLanguage } from "../../../hooks/useLanguage";
import styles from "./DashboardHeader.module.css";

interface DashboardHeaderProps {
  currentUserName: string | null;
  canCreateOrders: boolean;
  onNewOrder: () => void;
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
 * Dashboard header: welcome + quick actions + top actions, laid out
 * differently per breakpoint (see DashboardHeader.module.css):
 *  - Desktop: one row — welcome | quickActionsRow | New Order + notifications.
 *    The avatar is hidden (Sidebar already shows account info there).
 *  - Mobile: welcome (with avatar, replacing the hidden Sidebar) + top
 *    actions share a row; quickActionsRow wraps to its own row below.
 *
 * The quick-action cards (Deliveries / Pick list / Cash-up) used to be a
 * separate `QuickActionsRow` component — folded in directly since it had
 * no reason to exist apart from this header. Each card stays gated by its
 * capability (hidden entirely, not shown empty); when the capability is
 * present but there's nothing to act on, it renders "-" rather than
 * disappearing. `--quick-action-count` tracks how many cards are actually
 * rendered (role-gated — 1, 2, or 3) so the visible ones stretch evenly to
 * fill `.quickActionsRow`'s grid (see DashboardHeader.module.css).
 */
export function DashboardHeader({
  currentUserName,
  canCreateOrders,
  onNewOrder,
  canViewDeliveryRun,
  deliveryStopCount,
  canViewPickList,
  pickListOrderCount,
  canReconcileCOD,
  cashUpRemainingLabel,
  onNavigateDeliveries,
  onNavigatePickList,
  onNavigateCashUp,
}: DashboardHeaderProps) {
  const { t } = useLanguage();
  const quickActionCount = [
    canViewDeliveryRun,
    canViewPickList,
    canReconcileCOD,
  ].filter(Boolean).length;

  return (
    <div className={styles.header}>
      <div className={styles.welcomeGroup}>
        <span className={styles.avatarSlot}>
          <AvatarMenu />
        </span>
        <div className={styles.welcome}>
          <p className={styles.label}>{t("Welcome")}</p>
          <h1 className={styles.welcomeName}>{currentUserName || "—"}</h1>
        </div>
      </div>

      <div className={styles.quickActionsSlot}>
        {quickActionCount > 0 && (
          <div
            className={styles.quickActionsRow}
            data-count={quickActionCount}
            style={
              { "--quick-action-count": quickActionCount } as React.CSSProperties
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
        )}
      </div>

      <div className={styles.topActions}>
        {canCreateOrders && (
          <Button
            variant="primary"
            size="md"
            onClick={onNewOrder}
            title={t("Create a new order")}
            icon="add"
          >
            {t("New Order")}
          </Button>
        )}
        <NotificationsPopover />
      </div>
    </div>
  );
}
