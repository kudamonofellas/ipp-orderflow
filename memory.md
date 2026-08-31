# Memory — OrderDetails Page Enhancement & UI Refinements

# Memory — OrderDetails Page Enhancement & UI Refinements

Last updated: 2026-08-21T16:40 WIB

## What was built

**1. Button Component Enhancement (`src/components/Button/Button.tsx` & `Button.module.css`)**
- Added `iconOnly?: boolean` prop and styling for clean 32px / 40px / 48px square/circle icon buttons.
- Replaced all raw HTML `<button>` elements in `OrderDetail.tsx` with `<Button>`.

**2. Stepper Improvements & Pulsing Animation (`OrderDetail.tsx` & `OrderDetail.module.css`)**
- Stepper container placed inside `.mainColumn` above Customer Card so its width automatically follows main column expansion/contraction.
- Track segment lines rendered between dots: completed lines colored `var(--accent-primary)`, future lines `var(--border-default)`.
- Active step dot features a `@keyframes pulseGlow` light blue glow animation.
- Active label features bold teal text inside a light-teal pill background (`rgba(12, 68, 88, 0.08)`).
- Completed labels styled in `var(--text-primary)`, future labels in `var(--text-muted)`.

**3. Collapsible Notes & History Side Panel**
- Fixed viewport height `calc(100vh - 120px)` with sticky positioning.
- Independent scrollbars for Notes list and History list.
- Fixed `'Add note for the team...'` form pinned at the bottom of the Notes card.
- Smooth CSS transition for panel opening and closing (`grid-template-columns`, `opacity`, `transform`).
- Hidden toggle button on small screens (`<= 992px`) where panel stacks vertically below main column.

**4. Edit Mode Toggling & Cancel Button**
- Top-left Back button changes to `<Button variant="secondary"><Icon name="close" /> Cancel</Button>` during edit mode.
- Non-editable sections (Stepper, Documents Card, Stage Actions, Order Actions) are hidden during edit mode.
- Item quantity input (`qty`) is fully editable in edit mode.

**5. Doc Type Selection Width**
- `.docSelect` adjusted to a compact `100px` width.

**6. QA Feedback Fixes (2026-08-21 & 2026-08-24)**
- **Total text at intake**: Rendered `{t("Total:")}` label in item line at intake (new order) stage (`OrderDetail.tsx`).
- **Replacement subStatusBadge alignment**: Aligned replacement and pending docs subStatusBadge to the right of `td` in `OrderRow.module.css`.
- **Signed DO/SI not returned badge**: Added `pendingDocs` badge on order rows (`StatusPill.tsx`, `OrderRow.tsx`, `useOrders.ts`, `dashboard.ts`).
- **Prototype On Hold Model**: Reverted hold behavior to match the prototype's boolean `hold` model (`hold: true/false` flag on `orders` without mutating `stage` to `outstanding`). Freezes stage actions and renders the prominent amber **"On hold"** card banner at the very top replacing the stepper (matching `stage === "delivered"` banner placement), while preserving the real pipeline stage. Fixed hold/resume toggle to not write an `undo_snapshot` or trigger stage-undo banners. Positioned `subStatusBadges` (`On hold`, `Replacement`, `Signed DO/SI not returned yet`) in a neat row directly underneath the main `StatusPill` within the Stage column, with a unified 64px row height across all order table rows.

**7. Dispatch Hand-off Flow Refinement (`OrderDetail.tsx`, `schemas.ts`, `icons.ts`, `translations.ts`)**
- **Part 1 (Address Block Gating)**: Deliver-to address block now strictly gated on `handoffMode === "delivery" || handoffMode === "third"`. When no method is chosen (`handoffMode === null`), the address/Navigate block is hidden and only the 3-way handoff chooser renders.
- **Part 2 (Third-Party Delivery Tracking & Close-the-Loop)**:
  - Added `courier_tracking_ref` schema field; splits service name and tracking ref.
  - Third-party tracking link: Paxel renders deep link (`https://paxel.co.id/tracking/{ref}`), other services (Gojek, Grab, Lalamove, Other) render copyable reference text + "Copy ref" button.
  - Third-party address block renamed to "Handover destination" and hides the Navigate button & COD chips.
  - **Prototype Parity**: Handover Proof card layout matches prototype with 4 sequential fields:
    1. `Item condition photo (pickup)` (`condPhotos`)
    2. `Photo of the package / courier` (`recvPhotos`)
    3. `Driver name (optional)` (`receiverName` input)
    4. `Signed invoice` (`signedPhotos`)
  - Primary button is `Mark handed over` (enabled once condition photo is staged, other fields optional). Sub-action row cleanly presents `Customer refused / returned` only (omitting own-courier retry).
  - Submitting marks the order `delivered` and history as `Delivered via {service} — confirmed`.
- **Part 3 (Customer Pickup "Ready for pickup" & Notify Flow)**:
  - Added `ready_for_pickup` and `ready_at` schema fields.
  - Pickup card shows warehouse pickup location and operational hours instead of customer delivery address.
  - Added "Mark ready for pickup" action which transitions to a "Ready for pickup" badge + "Notify customer (WhatsApp)" button (copies pre-formatted Indonesian WA message and opens `wa.me` if phone is on file).
  - COD chip relabeled to "Collect payment at handover" for pickup orders.

## Current state

- ✅ TypeScript (`npx tsc -b` / `tsc --noEmit`) — **0 errors**
- ✅ Production build (`npm run build`) — **Clean build**
- ✅ ESLint (`npm run lint`) — **0 errors**
- ✅ Dispatch hand-off complete: explicit gating, third-party tracking & confirm, and customer pickup notification flow verified.

## Next session starts with

Proceed to address function/backend integration items if needed:
1. Audit per-field permissions
2. Mobile version responsiveness

