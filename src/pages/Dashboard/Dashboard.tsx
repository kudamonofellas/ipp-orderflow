import { ClipboardList, Plus, RotateCcw, Truck } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { StagePill } from '../../components/StagePill/StagePill';
import {
  approvals,
  currentUser,
  intakeMessages,
  metrics,
  openOrders,
  stageCounts,
} from '../../data/mockDashboard';
import { ApprovalPanel } from './sections/ApprovalPanel';
import { IntakePanel } from './sections/IntakePanel';
import { OpenOrdersPanel } from './sections/OpenOrdersPanel';
import styles from './Dashboard.module.css';

const METRIC_ICONS = {
  total: ClipboardList,
  delivered: Truck,
  returned: RotateCcw,
} as const;

/** Admin dashboard — mirrors context/designs/Dashboard.png. */
export function Dashboard() {
  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        {/* Welcome + metrics row */}
        <div className={styles.topRow}>
          <div className={styles.welcome}>
            <p className={styles.welcomeLabel}>Welcome</p>
            <h1 className={styles.welcomeName}>{currentUser.name}</h1>
            <Button className={styles.newOrder}>
              <Plus size={18} strokeWidth={2} aria-hidden="true" />
              New Order
            </Button>
          </div>

          {metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              icon={METRIC_ICONS[metric.id as keyof typeof METRIC_ICONS] ?? ClipboardList}
              value={metric.value}
              label={metric.label}
              range={metric.range}
            />
          ))}
        </div>

        {/* Stage pills grid */}
        <div className={styles.stages}>
          {stageCounts.map((stage) => (
            <StagePill key={stage.stage} count={stage.count} label={stage.label} />
          ))}
        </div>

        {/* Panels row: intake (left) + approvals/open-orders (right) */}
        <div className={styles.panels}>
          <IntakePanel messages={intakeMessages} />
          <div className={styles.panelStack}>
            <ApprovalPanel items={approvals} />
            <OpenOrdersPanel orders={openOrders} />
          </div>
        </div>
      </div>
    </div>
  );
}
