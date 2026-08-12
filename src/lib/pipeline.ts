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
 * matrix (`can()`) lives in `src/lib/domain.ts`; `Role` is imported from
 * there for `ROLE_FOCUS` below (no reverse import — domain.ts doesn't
 * depend on this file).
 */

import type { Role } from './domain';

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
 * Dispatch sub-status — NOT a stage. An order reading "out for delivery" is
 * still `stage === 'dispatch'`; this is a presentational annotation derived
 * from the 3 hand-off booleans, not something the stage enum, stage filters,
 * or pipeline counts should ever know about. Single source of truth for the
 * same predicate `OrderDetail.tsx`'s `handoffMode` already computes — don't
 * fork a second copy of this check anywhere.
 */
export type DispatchSubStatus = 'out_for_delivery' | 'awaiting_driver';

export function dispatchSubStatus(order: {
  stage?: string | null;
  taken_by?: string | null;
  pickup?: boolean | null;
  third_party?: boolean | null;
}): DispatchSubStatus | null {
  if (order.stage !== 'dispatch') return null;
  return order.taken_by || order.pickup || order.third_party
    ? 'out_for_delivery'
    : 'awaiting_driver';
}

export const DISPATCH_SUBSTATUS_LABELS: Record<DispatchSubStatus, string> = {
  out_for_delivery: 'Out for delivery',
  awaiting_driver: 'Awaiting driver',
};

/**
 * Convenience wrapper for callers (StatusPill's `subLabel` prop) that just
 * want the label string, not the typed enum — still routes through the one
 * `dispatchSubStatus()` predicate above, not a second copy of the check.
 * Returns the untranslated dictionary key; callers pass it through `t()`.
 */
export function dispatchSubLabel(order: {
  stage?: string | null;
  taken_by?: string | null;
  pickup?: boolean | null;
  third_party?: boolean | null;
}): string | null {
  const sub = dispatchSubStatus(order);
  return sub ? DISPATCH_SUBSTATUS_LABELS[sub] : null;
}

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
 * Directus filter fragment matching orders in the Finance parallel queue: an
 * order still sitting in Cold Storage that hasn't been held and hasn't had
 * payment confirmed. Cold and Finance run in parallel — a cold, unpaid,
 * un-held order counts toward both the Cold Storage and Finance Review
 * tallies (asymmetric with the Cold tile, which counts held orders too).
 *
 * Single source for this predicate — previously hand-rolled identically in
 * both `useDashboardCounts.ts` and `useOrders.ts` (F-06 in
 * prototype-audit.md: duplicated business predicates drift on the next
 * change if copied instead of shared).
 */
export function financeParallelQueueFilter(): Record<string, unknown> {
  return {
    _and: [
      { stage: { _eq: 'cold' } },
      { hold: { _neq: true } },
      { payment_confirmed: { _neq: true } },
    ],
  };
}

/**
 * "Open" orders — anywhere in the pipeline except the 3 terminal stages, and
 * not cancelled. Defined once here so the Dashboard's "Open Orders" metric
 * count and the Open Orders panel's actual row list can never disagree.
 *
 * Replaces the legacy `status === 'Open'` filter `useOpenOrders.ts` used to
 * read — `status` is a pre-`stage`-migration field that most live rows never
 * populate, so filtering on it silently hid orders that were genuinely open.
 */
export function openOrdersFilter(): Record<string, unknown> {
  return {
    _and: [
      { cancelled: { _neq: true } },
      { stage: { _nin: ['delivered', 'cancelled', 'returned'] } },
    ],
  };
}

/**
 * Every order with at least one active return bucket (mirrors
 * `returnBucketsForOrder`'s own field logic, as a Directus filter instead of
 * a client-side scan). A single `_or` of the 4 bucket conditions — not the
 * 4 buckets' counts summed — so an order sitting in two buckets at once
 * (e.g. `awaiting_return` ∥ `admin_action`) is still counted once. Used by
 * the "Today" digest's "returns in flight" tile, which needs a genuine
 * distinct-order count, unlike the Dashboard's Returns Workflow strip
 * (which intentionally shows each bucket's own count, overlaps and all).
 */
export function returnsInFlightFilter(): Record<string, unknown> {
  return {
    _or: [
      {
        _and: [
          { stage: { _eq: 'returned' } },
          {
            _or: [
              { return_received: { _neq: true } },
              { return_inbound: { _eq: true } },
            ],
          },
          { return_settle: { _neq: 'done' } },
        ],
      },
      {
        _and: [
          { stage: { _eq: 'returned' } },
          { return_settle: { _null: true } },
          { return_doc: { _null: true } },
        ],
      },
      {
        _and: [
          { stage: { _eq: 'returned' } },
          { return_settle: { _eq: 'sign' } },
        ],
      },
      {
        _and: [
          { is_replacement: { _eq: true } },
          { stage: { _nin: ['delivered', 'cancelled'] } },
        ],
      },
    ],
  };
}

/**
 * Stages each role "owns" — rendered with the main blue accent on the
 * dashboard (both the pipeline strip and the returns panel) so a user sees
 * at a glance which buckets need their action. One shared map drives both
 * strips so "yours" looks and means the same thing in either place — ported
 * from the prototype's `ROLE_FOCUS` (pipeline stages) merged with
 * `RETURN_BUCKETS[].roles` (return buckets), onto this app's stage/role
 * vocabulary. Owner intentionally maps to `[]` — they oversee everything,
 * so nothing is "theirs" specifically (matches the prototype's empty
 * `ROLE_FOCUS.Owner`, which avoids a role !== 'Owner' special case at every
 * call site).
 */
export const ROLE_FOCUS: Record<Role, Stage[]> = {
  Admin: ['intake', 'finalise', 'admin_action', 'awaiting_signed_doc', 'replacement_transit'],
  Warehouse: ['cold', 'packing', 'awaiting_return', 'replacement_transit'],
  Production: ['production', 'replacement_transit'],
  Finance: ['finance'],
  Courier: ['dispatch', 'awaiting_signed_doc', 'replacement_transit'],
  Owner: [],
};

/**
 * Which role is responsible for an order sitting at a given pipeline stage —
 * "who has the ball right now." Ported from the prototype's `ACTOR`
 * (`Dev-domain.js:143`). `delivered`, `cancelled`, and `returned` are
 * intentionally absent — they're terminal/off-pipeline states with no single
 * owning role (the prototype excludes them from its equivalent `canAct`
 * guard for the same reason). Keyed by plain `string` (not `PipelineStage`)
 * to match how `order.stage` is read off the Directus record elsewhere in
 * this codebase (e.g. `OrderDetail.tsx`'s `STAGE_FLOW`) — index with the raw
 * stage string and treat a `undefined` result as "no single owner."
 */
export const ACTOR: Record<string, Role> = {
  intake: 'Admin',
  cold: 'Warehouse',
  finance: 'Finance',
  production: 'Production',
  packing: 'Warehouse',
  finalise: 'Admin',
  dispatch: 'Courier',
  outstanding: 'Admin',
  awaiting: 'Admin',
};

/** Which role owns each return-workflow bucket — a separate keyspace from
 *  `ACTOR` above (return buckets aren't `order.stage` values; `stage` stays
 *  `'returned'` throughout, see `returnBucketsForOrder`). Used by
 *  `statusColor()` only — not merged into `ACTOR` itself, to keep `ACTOR`'s
 *  scope (pipeline `stage` field) unambiguous.
 *
 *  `replacement_transit` is deliberately absent: unlike the other 3 buckets,
 *  it isn't a fixed-role gate — it counts `is_replacement` orders at ANY
 *  stage except delivered/cancelled, so the replacement could currently be
 *  sitting with Warehouse, Finance, Production, or Courier. A per-order pill
 *  should colour by that order's actual current stage (`statusColor(order.stage)`)
 *  with a separate `isReplacement` badge layered on top (see `StatusPill`),
 *  not claim one fixed role's colour for the whole bucket. */
const RETURN_BUCKET_ACTOR: Partial<Record<ReturnStage, Role>> = {
  awaiting_return: 'Warehouse',
  admin_action: 'Admin',
  awaiting_signed_doc: 'Admin',
};

/** Role → `StatusPill` dot/text colour (CSS custom property). One colour per
 *  role, all six pairwise-distinct — see the `--role-*` tokens in
 *  `tokens.css`. */
export const ROLE_COLOR: Record<Role, string> = {
  Admin: 'var(--role-admin)',
  Warehouse: 'var(--role-warehouse)',
  Finance: 'var(--role-finance)',
  Production: 'var(--role-production)',
  Courier: 'var(--role-courier)',
  Owner: 'var(--role-owner)',
};

/**
 * Resolve any `orders.stage` value (or return-bucket key) to its
 * `StatusPill` colour, via the role responsible for it — NOT a per-stage
 * colour. Stages owned by the same role intentionally render identically
 * (intake and finalise are both Admin → both `--role-admin`; cold and
 * packing are both Warehouse → both `--role-warehouse`). Terminal states
 * (delivered/returned/cancelled/awaiting) aren't owned by a role, so they
 * get their own dedicated `--state-*` tokens instead of an `ACTOR` lookup.
 */
export function statusColor(key: string): string {
  if (key === 'delivered') return 'var(--state-done)';
  if (key === 'returned') return 'var(--state-returned)';
  if (key === 'cancelled' || key === 'awaiting') return 'var(--state-neutral)';
  const returnActor = RETURN_BUCKET_ACTOR[key as ReturnStage];
  if (returnActor) return ROLE_COLOR[returnActor];
  const actor = ACTOR[key];
  return actor ? ROLE_COLOR[actor] : 'var(--state-neutral)';
}
