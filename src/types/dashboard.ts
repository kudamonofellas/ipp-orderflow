/**
 * Dashboard view-model types.
 *
 * These describe the shapes the Dashboard UI renders. They are UI view-models,
 * not Directus collection shapes — the Directus-backed types live in
 * `src/types/` per-collection once the schema is wired. For now the Dashboard
 * renders from mock data (see `src/data/mockDashboard.ts`).
 *
 * Pipeline stages follow architecture.md Invariant #4.
 */

/** The 8 in-pipeline stages plus off-pipeline states. */
export type PipelineStage =
  | 'intake'
  | 'cold'
  | 'finance'
  | 'production'
  | 'packing'
  | 'finalise'
  | 'dispatch'
  | 'delivered';

/** A dashboard metric card (Total / Delivered / Returned). */
export interface DashboardMetric {
  id: string;
  /** i18n-ready label key or literal (mock uses literals for now). */
  label: string;
  value: number;
  /** Time-range filter shown in the card dropdown. */
  range: string;
}

/** A clickable stage pill on the dashboard grid. */
export interface StageCount {
  stage: PipelineStage;
  label: string;
  count: number;
}

/** A parsed / triaged WhatsApp intake message preview. */
export interface IntakeMessage {
  id: string;
  preview: string;
  customer: string;
  /** Full body shown on expanded cards (optional). */
  body?: string;
}

/** An approval / review action item bucket. */
export interface ApprovalItem {
  id: string;
  label: string;
  count: number;
}

/** A single line inside an open-order row. */
export interface OpenOrderLine {
  id: string;
  name: string;
  amount: number;
}

/** An open order row in the Open Orders table. */
export interface OpenOrder {
  id: string;
  orderId: string;
  status: string;
  orderDate: string;
  deliveryDate: string;
  lines: OpenOrderLine[];
}

/** A notification entry, grouped by date. */
export interface NotificationEntry {
  id: string;
  time: string;
  orderId: string;
  action: string;
}

/** Notifications grouped under a date header. */
export interface NotificationGroup {
  date: string;
  entries: NotificationEntry[];
}
