**Refactor `StatusPill.tsx` from per-stage colours to the prototype's role-based colour model, add a coloured dot before the label, and fold the dispatch sub-label into the pill (superseding the earlier "second line under the pill" plan).**

## Why this changes the earlier plan

The previous instruction rendered the dispatch sub-label ("Awaiting driver" / "Out for delivery") as a muted second line *under* a separate stage pill. **Undo that approach** — per the new design (see attached screenshot), the sub-label sits *inside* the treatment as part of the pill's status expression, and the colour is driven by the responsible **role**, not the stage. The sub-label inherits the dispatch (Courier) colour automatically once colour is role-based, so it no longer needs its own separate styling.

If the "second line under the pill" change was already applied to the Orders table / OpenOrdersPanel Stage cell, revert those cells to render a single `StatusPill` and let the pill handle the sub-label internally.

## The principle

Colour encodes **who is responsible for the order right now**, not which stage it's in. Stages owned by the same role share one colour; the *label* distinguishes them. This is why the prototype gives cold + packing the same green (both Warehouse) and gives both dispatch sub-states the same rust (both Courier). Every role must have a **distinct** colour, and no two roles may share one.

## Step 1 — role colour tokens (single source of truth)

Add role colours to the global CSS (light + dark), using distinct hues so all six roles differ. These are adapted from the reference palette provided, deduplicated so no two roles collide:

```css
:root {
  --role-admin:      #3B82F6; /* blue    — intake, finalise, outstanding, awaiting */
  --role-warehouse:  #10B981; /* green   — cold, packing */
  --role-finance:    #8B5CF6; /* violet  — finance */
  --role-production: #F59E0B; /* amber   — production */
  --role-courier:    #EF4444; /* red     — dispatch (both sub-states) */
  --role-owner:      #6366F1; /* indigo  — rarely a stage actor; reserved */
  --state-done:      #16A34A; /* distinct green — delivered (terminal, not a role) */
  --state-returned:  #DC2626; /* returned */
  --state-neutral:   #9CA3AF; /* cancelled, awaiting stock */
}
/* dark-mode block: lighten each ~15–20% as the prototype does */
```

Important: pick final hex so **all six role colours are visually distinct** and none equals another. The reference code had collisions (intake=dispatch=`#3B82F6`, packing=delivered=`#10B981`) — those must NOT survive, because they'd group unrelated stages. Courier must differ from Admin; delivered's green must differ from Warehouse's green (delivered is a terminal state, not a role).

## Step 2 — the role model in `pipeline.ts`

`pipeline.ts` currently has no `Role` type or stage→actor map. Add both (port from the prototype's `Dev-domain.js` `ACTOR`):

```ts
export type Role = 'Admin' | 'Warehouse' | 'Production' | 'Finance' | 'Courier' | 'Owner';

export const STAGE_ACTOR: Record<string, Role | null> = {
  intake: 'Admin', cold: 'Warehouse', finance: 'Finance', production: 'Production',
  packing: 'Warehouse', finalise: 'Admin', dispatch: 'Courier',
  outstanding: 'Admin', awaiting: 'Admin',
  delivered: null, cancelled: null, returned: null,
};

export const ROLE_COLOR: Record<Role, string> = {
  Admin: 'var(--role-admin)', Warehouse: 'var(--role-warehouse)',
  Finance: 'var(--role-finance)', Production: 'var(--role-production)',
  Courier: 'var(--role-courier)', Owner: 'var(--role-owner)',
};

/** Resolve any status/stage key to its display colour via the responsible role. */
export function statusColor(key: string): string {
  if (key === 'delivered') return 'var(--state-done)';
  if (key === 'returned') return 'var(--state-returned)';
  if (key === 'cancelled' || key === 'awaiting') return 'var(--state-neutral)';
  const actor = STAGE_ACTOR[key];
  return actor ? ROLE_COLOR[actor] : 'var(--state-neutral)';
}
```

Note the intended consequence, and **do NOT reproduce the prototype's inconsistency**: intake and finalise are BOTH Admin, so under this model they are BOTH `--role-admin` blue (the prototype accidentally gave intake its own teal — we're going fully pure). Confirm intake and finalise render the same colour after this change.

The return-workflow keys in the current `STATUS_MAP` (`awaiting_return`, `admin_action`, `awaiting_signed_doc`, `replacement_transit`) should map to their responsible role too: `awaiting_return` → Warehouse, `admin_action` → Admin, `awaiting_signed_doc` → Admin, `replacement_transit` → Warehouse. Add these to `statusColor` (or a companion map) rather than leaving hardcoded per-key colours.

## Step 3 — rewrite `StatusPill.tsx`

Change the pill so **label comes from a label map, colour comes from `statusColor()`**, and add a solid colour dot before the label:

- Keep `STATUS_MAP` but **only for labels** — strip the per-entry `color` field; colour now comes exclusively from `statusColor(key)`. This removes the collision risk entirely (one function, role-derived).
- Prepend a small filled circle (the dot) using the resolved colour, before the label text, inside the pill. Dot: ~7–8px, `border-radius:50%`, `background: <resolved colour>`, small right margin.
- Keep the existing pill treatment (tinted bg `${color}22`, border `${color}55`, text `color`) but source `color` from `statusColor(key)` instead of the map entry.

## Step 4 — dispatch sub-label inside the pill

Add an optional prop so the pill can express the dispatch sub-state:

```ts
interface StatusPillProps {
  status?: string | null;
  subLabel?: string | null;   // e.g. "Out for delivery" / "Awaiting driver"
  className?: string;
}
```

- When `status === 'dispatch'` and a `subLabel` is passed, render the pill as: **dot + "DISPATCH"** on the primary line, and the `subLabel` as a smaller muted line beneath it — matching the attached screenshot (pill on top, "Out for delivery" muted below). Both share the Courier colour because they're the same role; only the sub-line text differs.
- The sub-label VALUE is computed by the caller via a shared helper (build it now in `pipeline.ts` if not present, reusing `OrderDetail.tsx:525`'s existing `handoffMode` predicate — do not duplicate it):

```ts
export function dispatchSubLabel(o: { stage?: string|null; taken_by?: string|null; pickup?: boolean|null; third_party?: boolean|null; }): string | null {
  if (o.stage !== 'dispatch') return null;
  return (o.taken_by || o.pickup || o.third_party) ? 'Out for delivery' : 'Awaiting driver';
}
```

Use **"Awaiting driver"**, not "Awaiting pickup" — the latter is ambiguous (reads as customer-collection but means waiting-for-a-driver). Wire both strings + the pill labels through i18n.

## Step 5 — callers + the field-fetch fix (still required)

- Orders table and Dashboard OpenOrdersPanel: render `<StatusPill status={o.stage} subLabel={dispatchSubLabel(o)} />`. Remove any previous "second line under a separate pill" markup from these Stage cells.
- **`useOrders.ts` and `useOpenOrders.ts` still do not fetch `taken_by`, `pickup`, `third_party`** (confirmed — both `fields` arrays stop at `created_at`). Add all three to both hooks' `fields` arrays and to their row types, or `dispatchSubLabel` always returns "Awaiting driver". This is a hard prerequisite, not optional.

## Verification

- All six role colours are visually distinct; no two roles share a hex. Intake === finalise (both Admin blue). Cold === packing (both Warehouse green). Delivered green ≠ Warehouse green.
- Every pill shows a leading dot in its resolved colour.
- A dispatch order with `taken_by`/`pickup`/`third_party` set shows "DISPATCH" + muted "Out for delivery"; an unassigned one shows "DISPATCH" + "Awaiting driver"; both in Courier red.
- The earlier "second line under a separate stage pill" changes (if applied) are reverted — the sub-label is now internal to `StatusPill`.
- `StatusPill`'s `STATUS_MAP` no longer carries per-entry colours; all colour flows through `statusColor()`.
- Test all three hand-off modes (current seed only exercises `taken_by`).
- `npx tsc --noEmit`, build, lint clean. Update `progress-tracker.md` and `ui-registry.md` (note `statusColor`, `STAGE_ACTOR`, `ROLE_COLOR`, `dispatchSubLabel`, and the reverted second-line change).