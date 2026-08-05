/**
 * Mock dashboard data.
 *
 * Temporary UI-only data mirroring the Dashboard.png design. This is NOT the
 * source of truth — it will be replaced by Directus reads (aggregate() for
 * metrics, readItems() for lists) once the pipeline collections are wired.
 * No localStorage / IndexedDB — this is in-memory mock data for the shell only.
 */

import type {
  DashboardMetric,
  IntakeMessage,
  OpenOrder,
  StageCount,
} from '../types/dashboard';
import { PIPELINE_STAGES, RETURN_STAGES } from '../lib/pipeline';

export const metrics: DashboardMetric[] = [
  { id: 'total', label: 'Total Orders', value: 1, range: 'Today' },
  { id: 'delivered', label: 'Delivered Orders', value: 1, range: 'Today' },
  { id: 'returned', label: 'Returned Orders', value: 1, range: 'Today' },
];

/** Mock counts keyed by the new stage enum (main pipeline + return workflow). */
const MOCK_STAGE_COUNTS: Record<string, number> = {
  intake: 1,
  cold: 1,
  finance: 1,
  production: 1,
  packing: 0,
  finalise: 0,
  dispatch: 1,
  delivered: 3,
  awaiting_return: 1,
  admin_action: 2,
  awaiting_signed_doc: 0,
  replacement_transit: 1,
};

export const stageCounts: StageCount[] = [...PIPELINE_STAGES, ...RETURN_STAGES].map(
  ({ key, label }) => ({ stage: key, label, count: MOCK_STAGE_COUNTS[key] ?? 0 }),
);

export const intakeMessages: IntakeMessage[] = [
  { id: 'm1', preview: 'Teza june...', customer: 'Tezalonica' },
  { id: 'm2', preview: 'Teza june...', customer: 'Tezalonica' },
  {
    id: 'm3',
    preview: 'Teza june',
    customer: 'Tezalonica',
    body: '3 july 26\nJumat\n\n7) en dining agora\n\nOrder :...',
  },
];

export const openOrders: OpenOrder[] = [
  {
    id: 'o1',
    no: '260701019',
    orderId: '260701019',
    status: 'Open',
    orderDate: 'July 1st, 2026',
    deliveryDate: 'July 1st, 2026',
    salesRep: 'Teza',
    customerName: 'Tezalonica',
    lines: [
      { id: 'l1', name: 'Item name', amount: 2_100_000 },
      { id: 'l2', name: 'Item name', amount: 2_100_000 },
      { id: 'l3', name: 'Item name', amount: 2_100_000 },
    ],
  },
  {
    id: 'o2',
    no: '260628005',
    orderId: '260628005',
    status: 'Open',
    orderDate: 'July 1st, 2026',
    deliveryDate: 'July 1st, 2026',
    salesRep: 'Teza',
    customerName: 'Agora Dining',
    lines: [],
  },
];

export const currentUser = {
  name: 'Meatfellas',
  role: 'Admin',
  initials: 'MF',
};
