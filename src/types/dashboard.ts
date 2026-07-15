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

import type { Stage } from '../lib/pipeline';

export type DateRangeType = 'today' | 'week' | 'month' | 'year' | 'specific';

export interface DateRangeVal {
  type: DateRangeType;
  month?: string; // YYYY-MM
  year?: number; // YYYY
  date?: string; // YYYY-MM-DD
}

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
  stage: Stage;
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

/**
 * A "Need attention" action-item bucket — items the current role must
 * process (e.g. orders to print DO/SI for, drafts to review). Replaces the
 * old approval-only shape.
 */
export interface AttentionItem {
  id: string;
  label: string;
  count: number;
}

/** A single line inside an open-order row. */
export interface OpenOrderLine {
  id: string;
  name: string;
  amount: number;
  qty?: number | null;
  unit?: string | null;
  price?: number | null;
}

/** An open order row in the Open Orders table. */
export interface OpenOrder {
  id: string;
  orderId: string;
  status: string;
  orderDate: string;
  deliveryDate: string;
  salesRep: string;
  customerName: string;
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
