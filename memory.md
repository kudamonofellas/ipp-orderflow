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

**6. QA Feedback Fixes (2026-08-21)**
- **Total text at intake**: Rendered `{t("Total:")}` label in item line at intake (new order) stage (`OrderDetail.tsx`).
- **Replacement subStatusBadge alignment**: Aligned replacement and pending docs subStatusBadge to the right of `td` in `OrderRow.module.css`.
- **Signed DO/SI not returned badge**: Added `pendingDocs` badge on order rows (`StatusPill.tsx`, `OrderRow.tsx`, `useOrders.ts`, `dashboard.ts`).
- **On Hold / Resume fix**: Fixed `handleHold` to store pre-hold stage in `cancelled_from` so `handleRestore` resumes to original stage.
- **On Hold card banner**: Added prominent amber On Hold card banner with "Resume order" button in `OrderDetail.tsx` and `.onHoldCard` styles.

## Current state

- ✅ TypeScript (`npx tsc -b` / `tsc --noEmit`) — **0 errors**
- ✅ Production build (`npm run build`) — **Clean build in 1.34s**
- ✅ All order row and on hold UI fixes implemented and verified

## Next session starts with

Proceed to address function/backend integration items if needed:
1. Audit per-field permissions
2. Mobile version responsiveness

