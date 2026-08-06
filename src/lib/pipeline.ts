/**
 * Order pipeline + return workflow definitions.
 *
 * The stage *keys* are the stable enum from architecture.md Invariant #4
 * (`intake`, `cold`, `finance`, `production`, `finalise`, `dispatch`,
 * `delivered`). The *labels* are the customer-facing names confirmed in
 * context/designs/ui-implementation.md and mirror how the business speaks
 * about each step. Keep keys stable; only labels change with the design.
 *
 * This is UI/domain metadata only — no Directus calls here. The capability
 * matrix (`can()`) will live in a separate `src/lib/domain.ts` unit.
 */

/** In-pipeline stage keys (stable enum — see architecture.md Invariant #4). */
export type PipelineStage =
  | 'intake'
  | 'cold'
  | 'finance'
  | 'production'
  | 'packing'
  | 'finalise'
  | 'dispatch'
  | 'delivered'
  | 'outstanding'
  | 'awaiting'
  | 'cancelled'
  | 'returned';

/** Return-workflow stage keys (off the main pipeline). */
export type ReturnStage =
  | 'awaiting_return'
  | 'admin_action'
  | 'awaiting_signed_doc'
  | 'replacement_transit';

export type Stage = PipelineStage | ReturnStage;

/** Ordered main-pipeline stages with their display labels. */
export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'intake', label: 'New Orders' },
  { key: 'cold', label: 'Cold Storage Picking' },
  { key: 'finance', label: 'Finance Review' },
  { key: 'production', label: 'Processing' },
  { key: 'packing', label: 'Packing' },
  { key: 'finalise', label: 'Print DO/SI' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'delivered', label: 'Delivered' },
];

/** Ordered return-workflow stages with their display labels. */
export const RETURN_STAGES: { key: ReturnStage; label: string }[] = [
  { key: 'awaiting_return', label: 'Awaiting Return' },
  { key: 'admin_action', label: 'Admin Action Required' },
  { key: 'awaiting_signed_doc', label: 'Awaiting Signed DO/SI' },
  { key: 'replacement_transit', label: 'Replacement in Transit' },
];

/** Stage key → display label lookup across both workflows. */
export const STAGE_LABELS: Record<Stage, string> = {
  ...Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, s.label])),
  ...Object.fromEntries(RETURN_STAGES.map((s) => [s.key, s.label])),
  outstanding: 'Outstanding',
  awaiting: 'Awaiting stock',
  cancelled: 'Cancelled',
  returned: 'Returned',
} as Record<Stage, string>;

/**
 * Which return-workflow bucket(s) an order currently sits in. A return isn't
 * a forward pipeline stage - it's an off-pipeline loop with parallel
 * hand-offs (the same principle as Finance running alongside Cold Storage):
 * warehouse receives & weighs, admin settles the Accurate document, and
 * (depending on the document chosen) a signed doc comes back and/or a
 * replacement re-enters the main pipeline - any of these can be true at once.
 *
 * Ported from the prototype's returnBuckets() (domain.js) onto the Directus
 * field names (return_received, return_settle, return_doc, return_inbound,
 * is_replacement).
 */
export function returnBucketsForOrder(o: {
  stage?: string | null;
  return_received?: boolean | null;
  return_settle?: string | null;
  return_doc?: string | null;
  return_inbound?: boolean | null;
  is_replacement?: boolean | null;
}): ReturnStage[] {
  const buckets: ReturnStage[] = [];
  if (o.stage === 'returned') {
    if (!o.return_received || o.return_inbound) buckets.push('awaiting_return');
    if (o.return_settle === 'sign') buckets.push('awaiting_signed_doc');
    else if (!o.return_settle && !o.return_doc) buckets.push('admin_action');
  } else if (o.return_inbound) {
    buckets.push('awaiting_return');
  }
  if (o.is_replacement && !['delivered', 'cancelled'].includes(o.stage ?? '')) {
    buckets.push('replacement_transit');
  }
  return buckets;
}

/**
 * Stages the current role "owns" — rendered with the main blue accent on the
 * dashboard so a user sees at a glance which buckets need their action.
 *
 * Admin owns: New Orders (intake), Print DO/SI (finalise), and the return
 * workflow's Admin Action Required. Per-role mappings for the other five
 * roles land with the domain/capability layer.
 */
export const ADMIN_HIGHLIGHT_STAGES: Stage[] = [
  'intake',
  'finalise',
  'admin_action',
];
