import { Card } from "../Card/Card";
import styles from "./StatCard.module.css";

interface StatCardProps {
  value: string | number;
  label: string;
}

/** Plain bordered stat block: a big tabular number over a muted label. No icon, no dropdown — see MetricCard for the fuller Dashboard variant. */
export function StatCard({ value, label }: StatCardProps) {
  return (
    <Card className={styles.card}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </Card>
  );
}
