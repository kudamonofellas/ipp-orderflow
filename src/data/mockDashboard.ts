/**
 * Mock dashboard data.
 *
 * Temporary UI-only data mirroring the Dashboard.png design. This is NOT the
 * source of truth — it will be replaced by Directus reads (aggregate() for
 * metrics, readItems() for lists) once the pipeline collections are wired.
 * No localStorage / IndexedDB — this is in-memory mock data for the shell only.
 */

import type {
  AttentionItem,
  DashboardMetric,
  IntakeMessage,
  NotificationGroup,
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

export const attentionItems: AttentionItem[] = [
  {
    id: 'att-01',
    label: '#260707-09 Munro Resto - return coming back - warehouse to receive & verify',
    count: 1,
  },
  {
    id: 'att-02',
    label: '#260707-09 Munro Resto - return - admin to update Accurate & decide (can run before goods arrive)',
    count: 1,
  },
  {
    id: 'att-03',
    label: '#260629-01 Saffron Kitchen - past its delivery date',
    count: 1,
  },
  {
    id: 'att-04',
    label: '#260708-02 Ducking Setiabudi - past its delivery date',
    count: 1,
  },
];

export const openOrders: OpenOrder[] = [
  {
    id: 'o1',
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
    orderId: '260628005',
    status: 'Open',
    orderDate: 'July 1st, 2026',
    deliveryDate: 'July 1st, 2026',
    salesRep: 'Teza',
    customerName: 'Agora Dining',
    lines: [],
  },
];

export const notificationGroups: NotificationGroup[] = [
  {
    date: 'Kamis, 02 July 2026',
    entries: [
      { id: 'n1', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n2', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n3', time: '13.21', orderId: '260701019', action: 'ditambahkan' },
    ],
  },
  {
    date: 'Jumat, 03 July 2026',
    entries: [
      { id: 'n4', time: '07.17', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n5', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n6', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n7', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n8', time: '11.22', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n9', time: '13.21', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n10', time: '13.21', orderId: '260701019', action: 'ditambahkan' },
      { id: 'n11', time: '13.21', orderId: '260701019', action: 'ditambahkan' },
    ],
  },
  {
    date: 'Sabtu, 04 July 2026',
    entries: [
      { id: 'n12', time: '07.17', orderId: '260701019', action: 'ditambahkan' },
    ],
  },
];

export const currentUser = {
  name: 'Meatfellas',
  role: 'Admin',
  initials: 'MF',
};
