import type { IconName } from "../../../components/Icon/icons";
import { MetricCard } from "../../../components/MetricCard/MetricCard";
import { useLanguage } from "../../../hooks/useLanguage";
import type { DashboardMetric, DateRangeVal } from "../../../types/dashboard";
import styles from "./MetricsRow.module.css";

const METRIC_ICONS: Record<string, IconName> = {
  open: "total",
  total: "store",
  delivered: "delivered",
  cancelled: "cancelled",
};

interface MetricsRowProps {
  metrics: DashboardMetric[];
  /** "open" has no date range to pick (it's always "right now") — the
   *  parent never receives a call for that metric id. */
  onRangeChange: (metricId: string, val: DateRangeVal, label: string) => void;
}

/** Metrics row — 4 stat cards (Open / Total / Delivered / Cancelled), each
 *  with its own date-range picker except "open". */
export function MetricsRow({ metrics, onRangeChange }: MetricsRowProps) {
  const { t } = useLanguage();
  return (
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
              ? (val, label) => onRangeChange(metric.id, val, label)
              : undefined
          }
        />
      ))}
    </div>
  );
}
