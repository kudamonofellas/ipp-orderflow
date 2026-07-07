/**
 * Mock dashboard data.
 *
 * Temporary UI-only data mirroring the Dashboard.png design. This is NOT the
 * source of truth — it will be replaced by Directus reads (aggregate() for
 * metrics, readItems() for lists) once the pipeline collections are wired.
 * No localStorage / IndexedDB — this is in-memory mock data for the shell only.
 */

import type {
  ApprovalItem,
  DashboardMetric,
  IntakeMessage,
  NotificationGroup,
  OpenOrder,
  StageCount,
} from '../types/dashboard';

export const metrics: DashboardMetric[] = [
  { id: 'total', label: 'Total Orders', value: 1, range: 'Today' },
  { id: 'delivered', label: 'Delivered Orders', value: 1, range: 'Today' },
  { id: 'returned', label: 'Returned Orders', value: 1, range: 'Today' },
];

export const stageCounts: StageCount[] = [
  { stage: 'intake', label: 'Intake', count: 1 },
  { stage: 'cold', label: 'Cold Storage', count: 1 },
  { stage: 'finance', label: 'Finance Gate', count: 1 },
  { stage: 'production', label: 'Production', count: 1 },
  { stage: 'packing', label: 'Packing', count: 0 },
  { stage: 'finalise', label: 'Finalize', count: 0 },
  { stage: 'dispatch', label: 'Dispatch', count: 1 },
  { stage: 'delivered', label: 'Delivered', count: 3 },
];

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

export const approvals: ApprovalItem[] = [
  { id: 'print-do', label: 'Print DO', count: 2 },
  { id: 'need-review', label: 'Need to Review', count: 1 },
];

export const openOrders: OpenOrder[] = [
  {
    id: 'o1',
    orderId: '260701019',
    status: 'Open',
    orderDate: 'July 1st, 2026',
    deliveryDate: 'July 1st, 2026',
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
