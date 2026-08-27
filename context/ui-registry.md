# UI Registry

> Established by `/imprint audit` on 2026-07-07.
> This is the consistency baseline. Every component built after this must match these patterns.
> Token source of truth: `context/ui-context.md` + `context/ui-tokens.md`.
> CSS implementation: `src/styles/tokens.css`.

## Update — 2026-08-26 (2) Extracting a page-local JSX helper into a real component

- **`renderReturnLineBox` (a plain function called inline inside `OrderDetail.tsx`, `renderReturnLineBox(line, ...)`) extracted to `src/components/ReturnLineBox/ReturnLineBox.tsx`, a real module-level component (`<ReturnLineBox line={...} .../>`)** — reach for this whenever a page-local render helper has a clean, self-contained prop surface and no hooks of its own; its former closure captures (styles, state, handlers) become explicit props, which is more verbose but makes every dependency reviewable instead of implicit.
- **The "plain function called inline" pattern this file already used for `renderPanel()` is a real, working fix for a real problem — but it's a workaround, not the ideal shape**: defining a component *nested inside* another component's body and rendering it as JSX (`<Panel/>`) gives it a new identity every parent render, so React unmounts/remounts the whole subtree — visible flicker, lost focus, lost local state (see `renderPanel()`'s own doc comment in `OrderDetail.tsx`). Calling it as a plain function sidesteps that, but the more standard fix is moving the definition to module scope, which is what a proper component extraction does anyway — reach for a real top-level (or separate-file) component over the inline-function-call pattern whenever the helper is cohesive enough to have a clean prop list; keep the inline-function-call shape only for something that genuinely can't be pulled out cleanly (deeply entangled with dozens of surrounding closures) and isn't worth the surface area of extracting yet.
- **A tiny, dependency-free formatting helper moved out alongside the component it was extracted for**: `formatClock()` had zero references to `OrderDetail`'s own state, so it moved to `src/lib/format.ts` in the same pass rather than being duplicated into the new component — reach for this whenever an extraction reveals a shared leaf-level utility that two now-separate places both need.
- **`ReturnLineBox` got its own `ReturnLineBox.module.css`, not an import of `OrderDetail.module.css`** — a genuine extraction means the component doesn't reach back into its former parent's stylesheet. The classes unique to this box (`.returnLineBox`, `.returnLineTop`, etc.) moved out of `OrderDetail.module.css` entirely; the handful of shared small primitives it still needs (`.thumbnailsContainer`/`.thumbnailItem`/`.thumbnailHoverTrash`, `.undoRow`/`.left`, `.editInput`, `.inlineButton`) were duplicated into the new module rather than cross-imported, since this codebase has no shared "common primitives" module to pull them from instead — reach for the same trade whenever extracting a component out of a page that has no shared base stylesheet: duplicate the small stuff, don't reach back into the page's own module.

## Update — 2026-08-24 (2) Reuse an existing multi-photo table across two distinct capture moments

- **A single-field photo (`order_lines.returned_weigh_photo`) converted to a proper multi-photo gallery by reusing an already-existing table for a *second* purpose, not by building a parallel mechanism**: the warehouse's receive/weigh-back photo now writes to `line_return_photos` — a table that already existed solely for the courier's refusal-evidence capture (`refusePhotosMap`) — rather than adding a new `line_receive_photos` table. The two capture moments (courier refusal at delivery, warehouse receipt later) are sequential, not concurrent, for the same return cycle, so there's no collision; reach for "does an existing per-line evidence table already fit, even if its current doc comment describes a narrower use than what you need" before creating a new collection for what is conceptually the same shape of data (a line, a photo, an order number).
- **Persistent vs. ephemeral state sharing one backing table**: `refusePhotosMap` (reset to `{}` every time the refusal form opens — a one-shot capture moment) and the new `receivePhotosMap` (fetched once on page load via `readLineReturnPhotos`, persists across reloads) are two different local states over the same `line_return_photos` rows — reach for this split whenever one UI moment is "fill this form once and submit" and another is "show/add to a running record that outlives a single session," even when both moments write the same table.
- **A native `<label>` wrapping exactly one labelable child (the hidden file `<input>`) is the reliable file-picker trigger** — a `<label>` wrapping *two* labelable elements (e.g. a styled `<Button>` *and* the input, with a manual `onClick={() => nextElementSibling.click()}` forwarding hack) is fragile and was the actual cause of a "upload button doesn't work" bug this session. Always reach for the single-child-label pattern (`<label className={styles.actionBtn}><input type="file" style={{display:"none"}} .../><Icon name="camera"/></label>`) already established elsewhere in `OrderDetail.tsx` — never introduce a second labelable element inside the same label to work around wanting a `Button`-styled trigger.

## Update — 2026-08-24 Flag-gated card independent of stage, ungated persistent-record card

- **A card gated on a boolean order flag (`order.return_inbound`), not on `stage`**, for a parallel workflow that can be true at any pipeline stage — unlike this file's usual stage-switch cards, `OrderDetail.tsx`'s new "Incoming Return" card renders purely off `order.return_inbound`, so it still shows on a replacement order sitting at `cold` while its original return is still in transit. Reach for this whenever a card represents a state that runs *alongside* the current stage rather than *at* it (same family as the existing Finance-parallel-queue card at Cold Storage).
- **Ungated read-only "persistent record" card next to a capability-gated Documents section**: the new "Return settlement" card has no role/capability check at all (any role sees it, matching the Documents section's *absence* of a gate before 2026-08-14's fix) — reach for a fully ungated card specifically when the content is a closed-record fact relevant to whoever's handling the order next (a settlement document reference), as opposed to an editable/sensitive log like Documents, which should stay capability-gated.
- **New action state reuses an existing map/handler instead of adding a parallel one**: the Incoming Return card's weight input reuses the existing `receiveQtyMap` state and `handleUploadReceiveWeighPhoto` handler already built for the "Awaiting Return" bucket, rather than introducing `verifyWeight`/`verifyPhoto` twins — safe here because a line is never in both buckets (`returned`-pending and `inbound_return`-pending) at once. Reach for this whenever two UI cards edit the same shape of per-line data at mutually-exclusive times.

## Update — 2026-08-14 (2) Sortable `<th>` replaces the dropdown-sort button

- **New `SortableTh` component** (`src/components/SortableTh/`) — a `<th>` that sorts on click/Enter/Space (ascending first, descending on a second click) with a hover state, replacing the old pattern of a separate `Button` + dropdown listing sort options next to the table heading. Reach for this for any paginated, server-sortable table — it now drives all 4 of this app's sortable tables (Dashboard Open Orders, Orders, Customers, Products), each just passing its own `sortKey`/`activeSort`/`onSort`.
- **Single rotated icon, not two swapped icons, for an ascending/descending indicator**: only the active column shows an icon (`circleArrowUp`), rotated 180° via a CSS `transform` transition when the direction flips to descending — cheaper and visually smoother than swapping between two separate icon assets (`circleArrowUp`/`circleArrowDown` both exist in `icons.ts`, but only one is ever mounted). Reach for a rotated-single-icon whenever two icon states are literal vertical mirrors of each other.
- A column with no real backing DB field (e.g. Orders/Open-Orders' "Items" count, a joined line count) can still use `SortableTh` — the owning page just intercepts that one `sortKey` locally and sorts the already-fetched page client-side instead of forwarding it to the server `sort` param, keeping every column visually consistent even though only some are server-sorted.

## Update — 2026-08-14 (1) Correction to the 2026-08-11 "WhatsApp intake removed" entry below

- **The `ChannelSelectModal`/`IntakeModal` deletion described in the "Update — 2026-08-11 WhatsApp intake removed" entry below was reversed on 2026-08-14** — the user clarified their original ask was only to remove the Dashboard's automated triage panel (`IntakePanel`), not the admin-initiated paste-and-parse flow. Both components were rebuilt (byte-identical to the pre-removal version, no later revisions to reconcile) and are live again — do not treat that entry's "removed, not superseded" note as current. `IntakePanel` itself, and `OrderNew.tsx`'s side-panel/layout-grid collapse, stay removed — only the two modals + `OrderNew`'s prefill/side-panel + the Settings "Intake Learning" review list came back. See `progress-tracker.md`'s 2026-08-14 restoration entry for the full file list.

## Update — 2026-08-13 (3) Bootstrap a reference value from real activity instead of demanding upfront data entry

- **Offer to save a value at the moment real data proves it, rather than requiring it be entered ahead of time**: the customer `address_geo` pin (used to compute the delivered-order drop-location verification distance) is never demanded on customer creation — it's offered as a one-tap confirm ("Set this as {customer}'s delivery location?") the first time a real GPS fix exists for that customer (a confirmed own-courier delivery), using that real fix as the value. Reach for this whenever a reference value would otherwise sit blank for most records because entering it manually is tedious/low-priority, but the app's own normal activity produces a trustworthy value for free — bootstrap from the activity, keep a manual field only for the first-time-with-no-activity-yet and correction cases.
- **Paste-a-coordinate-or-link text field instead of an interactive map picker**: `CustomerEdit.tsx`'s "Delivery Location Pin" field accepts a plain `"lat, lng"` paste or a pasted Google Maps URL, parsed client-side (`parseLatLng()`) — no map library, no picker widget. Consistent with this project's standing convention of keyless static Maps links/iframes only (no map-library dependency anywhere in the app) — reach for a parsed-paste text field over a picker whenever the input is rare/corrective rather than a routine primary action, and a real value (from Google Maps, already open on the user's phone) is one copy-paste away.

## Update — 2026-08-13 (2) Quiet text-link actions + grouped "follow-ups" row card

- **Quiet text-link, not a `Button`, for a reversible-but-rare escape hatch that sits next to a primary state**: `.undoLink` (small caption text, `--text-secondary` → `--accent-primary` on hover, small icon, no border/background) for the delivered-order "Undo — back to dispatch" action. Reach for this instead of a secondary `Button` when the action is (a) only available in a narrow, self-correcting window (here: only while it's the *last* action on the order) and (b) meant to read as "in case you made a mistake," not as a routine part of the flow — a full button-styled control would overstate how often this should get used.
- **Grouped "follow-ups pending" card instead of one full-width primary-button card per loose end**: `.followUpsCard` / `.followUpRow` (icon + label/sub-line + a `Button` `variant="secondary" size="sm"`, rows separated by a hairline `border-top`, no per-row background tint) replaces what used to be a standalone `Card` per pending office task (e.g. "Signed DO & SI returned?" as its own full-width-primary-button card). Each row only renders when its own condition holds, and the whole card only renders when ≥1 row applies — reach for this whenever a screen accumulates 2+ independent, low-stakes "someone in the office still needs to do X" reminders that would otherwise each claim a full loud card; a quiet row-per-item list correctly signals "administrative housekeeping," not "urgent action," while a full-width primary button did not.
- **Read-only mirror of an editable component reusing the exact value shape, not a simplified summary**: the delivered-order Items card renders `weighingLines` (the same per-line weight/photo data the cold-stage editable version uses) as plain text (`{weight} kg`) + the same `.thumbnailItem`/image-modal click behavior, with the input/camera/"Add weighing"/delete controls simply omitted rather than disabled — a closed record shows exactly what was recorded, still clickable for detail, but offers no path back into edit mode. Reach for this whenever a "closed" state needs to show the same data an "open" state edits: strip the mutating controls, keep every read affordance (click-to-zoom, grouping) identical.

## Update — 2026-08-13 Recorded-outcome segmented control (COD payment row)

- **3-way outcome control, not a checkbox, for anything with a "how much/which way" answer rather than a yes/no one**: `.codSegment` buttons (bordered, `--radius-md`, `--text-label`/600 weight, matches `Button`'s secondary sizing without using the component itself since it needs 3 independent semantic colours) — neutral `--border-default` when unselected, `color-mix(in srgb, var(--state-success) 13%, transparent)` background + solid border when the "good" outcome is picked, same treatment with `--state-warning` for the other two. None pre-selected — the row starts fully neutral so a conscious choice is required, not a pre-picked default. Reach for this shape whenever a field records one of 3+ *mutually exclusive outcomes* (full/partial/none, yes/maybe/no) rather than a boolean toggle.
- **Recording an amount/outcome is architecturally separate from gating the primary action on it**: the COD row's outcome is captured for the record but `handleConfirmDelivery`'s disabled/blocked logic never reads it — only the photo+name proof gate does. When a "did X happen" checkbox is tempting a user to lie to get past a gate (falsifying "cash collected" to mark delivery done), the fix is to stop gating on it and route the dishonest-feeling answer ("none collected") to a legitimate downstream state instead (here: `stage: "outstanding"`, same as the existing hold action) — not to make the checkbox harder to fake.
- **One-tap reason chips gating a specific outcome branch**: `.codReasonChip`/`.codReasonChipActive` — small pill buttons, appear only once a "needs explanation" outcome is selected (mirrors `.proofCheckEmpty`/`Filled`'s reveal-on-state pattern), required before the primary action proceeds. Reach for this instead of a free-text reason field when the set of real-world reasons is small and enumerable — a tap is faster than typing and keeps the resulting `order_history` text consistent.

## Update — 2026-08-11 (6) Delivery Proof capture: progressive reveal, checked field rows, neutral status badge

- **Progressive-reveal capture form**: only the first required field (condition photo) renders until it's satisfied; the rest of the form (other fields, secondary actions, the "Change method" escape hatch) appears once it is — `condPhotos.length > 0 && (...)` gating in `OrderDetail.tsx`. Reach for this whenever a form's later fields are genuinely meaningless without an earlier one (not just a paternalistic step-gate) — it keeps a first-time user from being shown 6 fields when only 1 is actually actionable yet.
- **Checked field row**: `Icon name="check"` at the start of a row, `--text-muted` when the field is empty, `--accent-primary` when it has content — a lighter-weight completion signal than a full progress bar, for a form with 2-4 independent optional-until-required fields. Paired with a trailing icon-only upload `Button` (`isActive` mirrors the same empty/filled state) and `thumbnailsContainer`/`thumbnailItem`/`thumbnailHoverTrash` (established pattern, not new) for the uploaded photos themselves.
- **Neutral status badge next to a role-coloured pill**: `StatusPill`'s new `isReplacement` prop renders a small `--text-secondary`/`--bg-surface-hover` badge (icon + label, `text-transform: uppercase`, same caption/weight as the pill's own label) as a sibling of the pill, not merged into it — for flagging a cross-cutting property (e.g. "this is a replacement order") that doesn't have a single owning role and so can't honestly claim the pill's colour. Wrap both in one `inline-flex` container (`.wrap`) so they still flow as one unit in a table cell.
- **Header action moved into the card's own header row**: "Change method" moved from a bottom action-row ghost button to a `tertiary` + icon button inline with the card's title (`justify-content: space-between` header row) — reach for this placement whenever an action is a "reset/undo the current context" escape hatch rather than a forward-moving step, so it doesn't compete visually with the primary action row below.

## Update — 2026-08-11 (5) Role-coloured highlighted pills + hover

- **`StagePill`/`ReturnWorkflowsPanel`'s highlighted (role-owned) pills now render in `statusColor(stage)` instead of a flat `--accent-primary`** — same role→colour resolution `StatusPill.tsx` already used, applied via inline `style` (`color-mix()` tinted background, solid border/text) rather than a CSS class, since the colour is per-stage/dynamic. A `--stage-color` custom property set alongside it lets `.pillHighlight:hover` intensify toward that same colour in plain CSS (`color-mix(in srgb, var(--stage-color, var(--accent-primary)) 20%, var(--bg-surface))`) — this is the pattern to reach for whenever a `:hover`/`:focus` pseudo-class needs a per-item dynamic colour that can't be expressed as a static class. Non-highlighted pills are intentionally untouched (generic hover only applies to the currently-highlighted subset).

## Update — 2026-08-11 (4) Batched/paginated scroll loading

- **`NotificationsPopover`'s `.scroll` list now batch-loads on scroll** instead of fetching everything up front — `onScroll` on the scrollable container checks `scrollHeight - scrollTop - clientHeight < 80` and calls the owning hook's `loadMore()`. Reach for this exact threshold/shape for any other popover-with-a-long-list that should defer cost until the user actually scrolls (the pattern generalizes beyond notifications — any hook returning `{ items, loading, loadingMore, hasMore, loadMore }` backed by `offset`-paginated Directus reads fits the same `onScroll` wiring).
- Footer states inside the scroll container follow the existing `.empty` paragraph convention (`--text-secondary`, already used for loading/error/empty) — "Loading more…" while a batch is in flight, "No more activity." once `hasMore` goes false, both reusing the same class rather than introducing new footer-specific styling.

## Update — 2026-08-11 (3) `Modal` component + `useDialog()` alert/confirm replacement

- **`Modal`** (`src/components/Modal/`) is now the actual implementation of the baseline documented above under "### Modal" (overlay `rgba(0,0,0,0.4)`, `--radius-xl`, `--space-xl` padding, `--shadow-lg`, 600px max-width) — before this it was tokens-only documentation with two divergent ad-hoc implementations (`AddItemModal`'s 0.6-opacity+blur backdrop, `ImageDetailsModal`'s dark photo-chrome). New modals should compose `<Modal open title footer>` rather than hand-rolling another backdrop+card pair.
- **`useDialog()`** (`src/hooks/useDialog.ts`, provider in `DialogProvider.tsx`, mounted once in `App.tsx`) is the app-wide replacement for `window.alert`/`window.confirm` — `alert(message, opts?)` / `confirm(message, opts?)`, both promise-based, rendered through one shared `Modal`. Pass `{ danger: true }` for destructive confirms (delete/cancel/reset) to get a red confirm button. Never call `window.alert`/`window.confirm` directly anywhere in this app going forward — always `useDialog()`.

## Update — 2026-08-11 (2) Reusable `Checkbox` component

- **New `Checkbox` component** (`src/components/Checkbox/`) — an icon-button checkbox (bordered square, tick icon when checked), sizes `sm` (18px) / `md` (22px). Same shape/API convention as `Toggle`: `checked`/`onChange(next: boolean)`/`label` (accessible name, visually hidden — pair with visible copy beside it, don't rely on wrapping it in a `<label>` since it's a `<button>` not an `<input>`, so native label-click-forwarding doesn't apply)/`disabled`/`size`.
- Consolidates what were 4 independently-hand-rolled checkbox implementations (Settings permissions grid, PickList's pulled-toggle, ProductEdit's native styled `<input>`, OrderDetail's unstyled inline native checkbox) into one component + one CSS module. Reach for `Checkbox` for any future boolean toggle that should read as a checkbox rather than a switch — use `Toggle` instead when the semantic is closer to "on/off setting" than "selected/unselected item."

## Update — 2026-08-11 WhatsApp intake removed

- The `IntakePanel` (Dashboard), `ChannelSelectModal`, `IntakeModal`, and the Settings "Intake Learning" review-list pattern documented in the 2026-08-09 and 2026-08-06 entries below are **removed, not superseded** — full deletion, not a redesign. Treat those entries as historical record of a pattern that no longer exists in the codebase; don't reach for "Corrections review list" or "WhatsApp Intake panel loading/error/empty" as a reusable shape anymore.
- Dashboard's panels grid went from 3 columns (Return Workflows | Needs Attention | Intake) to 2 (Return Workflows | Needs Attention) — `panelsGridTwo` is now the only panels-grid class; the old 3-column `.panelsGrid` rule was deleted from `Dashboard.module.css`.
- `OrderNew.tsx`'s layout collapsed from a 2-column grid with a collapsible side panel (`.layoutGrid`/`.layoutGridWithPanel`/`.layoutGridFull`/`.sidePanelColumn`) to a single flat column (`.mainColumn` only) — the side panel existed solely to show the original pasted WhatsApp message + attachments note, which no longer applies.
- The Table baseline's "Dashboard sections" component list (`Built components (2026-07-07)` section further down) still names `IntakePanel` — also stale as of this removal, kept as historical record for the same reason as above.

## Update — 2026-08-09 Delivery proof capture, async confirm button, Corrections review list

- **Inline named-photo-slot capture form**: `OrderDetail.tsx`'s delivery-proof panel (opens in place of instantly advancing at the `dispatch` stage, same toggle-a-`Card` mechanism as the pre-existing "Customer refused / returned" form) renders 3 named slots (`{ slot, label, photo }[]` mapped) side by side — each slot is the existing camera-icon `<label>`-wrapping-hidden-`<input type="file">` trigger (established 2026-08-06 for refuse/receive photos) plus a 64×64 thumbnail once uploaded. Reuse this "array of named slots" shape whenever a form needs several *distinct, individually-labeled* photos (not a repeatable list of the same kind of photo) — each slot's upload handler takes a `slot` key so one handler function serves all three instead of three near-identical ones.
- **A capability/requirement gated by a live settings toggle, not hardcoded**: whether all 3 delivery-proof photos are mandatory is read from `settings.dispatch_proof_required` (`useSettings()`) at submit time — the same boolean the Settings page's toggle already wrote but that nothing previously consumed. When a Settings toggle exists but a feature ships before the thing it configures, wire the read side as soon as that feature lands rather than leaving the toggle inert — check for orphaned settings fields before hardcoding a requirement.
- **Async confirm button, 3 states**: `CashUp.tsx`'s per-row Confirm button now reads `Confirm` → `Saving…` (disabled, mid-request) → `Confirmed` (disabled, done) instead of the earlier instant-toggle version — driven by two hook-owned `Set<string>` state pairs (`confirmingIds`, `confirmedIds`), not local component state, since the hook owns the actual persistence call. Reach for this 3-state shape (not just disabled-while-loading) whenever a button's action is a real network write that can fail — `Saving…` communicates "in flight," a caught error un-disables the button instead of leaving it stuck.
- **Review list with per-row delete, grouped meta line**: `Settings.tsx`'s new Corrections list — `Card flush` containing one bordered row per item (`justify-content: space-between`), left side stacks a bold primary line over a `--text-caption`/`--text-muted` secondary line combining multiple facts with `·` separators (`"Added by X · Aug 9, 2026"`), right side holds a count/status pill (reuses the standard count-badge pill convention, `--bg-surface-hover`/`--border-default`/`--radius-xl`) plus an `iconOnly` `trash` `Button` gated to the same capability as the section itself. Same shape as the Team member row, generalized — reach for it whenever a Settings-style admin list needs "one fact-dense row + a trailing action," not a full data table.

## Update — 2026-08-07 (2) Cash-up, Deliveries, Reports, Settings pages

- **Ephemeral "Confirm" still gets a confirmation dialog, even unpersisted**: `CashUp.tsx`'s Confirm button calls `window.confirm("Confirm Rp X received?")` before flipping local state, even though nothing is written to Directus yet (no `cod_reconciled`-style field exists in the live schema — see progress-tracker.md 2026-08-07). The confirmation step is about the *interaction* being a deliberate financial acknowledgment, not about what happens to the byte afterward — don't skip the confirm dialog just because the write is a stub.
- **Hero card + compact "then" list, not N equal cards**: `Deliveries.tsx`'s pattern for "one thing needs full attention, the rest is a scannable queue" — the first/active item gets a `Card` with a 2px accent border (`.heroCard { border: 2px solid var(--accent-primary); }`), a filled numbered badge, full-size body-text details, and primary-styled action buttons; every subsequent item gets a plain-border `Card`, an outline numbered badge, caption-size details, and an icon-only secondary action. Reuse this shape whenever a screen has exactly one "current" item among a sequence (a queue, a route, a step list) rather than rendering every item identically and relying on the user to scan for which one matters.
- **Filled vs. outline numbered sequence badge**: `.badgeFilled` (accent bg, `--text-on-accent`, 32px) for the active/hero item, `.badgeOutline` (bordered circle, `--text-secondary`, 28px, no fill) for queued items — same numbering scheme, different weight signals "this one first."
- **Grouped-by-owner list with a running subtotal header**: `CashUp.tsx`'s courier grouping — `Avatar` (initials) + name + item count on the left of a header row, a bold subtotal on the right, then a `Card flush` containing one row per item. Reuse whenever a flat list is naturally owned by a person/entity and the total-per-owner is itself useful information (don't just add a "grouped by" filter dropdown to a flat list when the grouping is structural, not a view preference).
- **`StatCard` component** (`src/components/StatCard/`): a plain bordered block — big tabular-nums number over a muted label, no icon, no dropdown. Deliberately lighter than `MetricCard` (Dashboard's icon+range-dropdown variant) — reach for `StatCard` when a screen just needs "N / label" repeated a few times (Cash-up's Expected/Collected/Remaining, Reports' Total Orders/Delivered/Returned/Canceled and Terms Outstanding/Overdue), and `MetricCard` when it also needs a per-card date-range selector.
- **`Toggle` component** (`src/components/Toggle/`): pill switch (`role="switch"`, 44×24, knob slides via `transform: translateX`), for a screen's actual interactive boolean settings — distinct from the pre-existing "read-only disabled checkbox" pattern (still correct for view-only booleans elsewhere) and from the Badge/Pill "presence flag" pattern (still correct for a record's own boolean fields shown inline). Use `Toggle` specifically for a Settings-style on/off control the user flips directly.
- **CSS-only donut via `conic-gradient`, no chart library**: `Reports.tsx`'s Fulfillment donut is a `div` with `background: conic-gradient(color A 0% X%, color B X% Y%, color C Y% 100%)` (percentages computed in JS, passed as an inline style since they're dynamic) plus an absolutely-positioned inner circle (`.donutHole`, `background: var(--bg-surface)`) to punch the ring. No new dependency for a 3-slice status ring — reach for a real charting library only past this shape's complexity (many slices, animation, tooltips-per-slice).
- **Status-colored chart slices always carry a text legend**: the donut's 3 slices map to `--accent-primary`/`--state-warning`/`--state-success` with a name + percentage + count in the legend list beside it — never color-alone, per the same rule the app already follows for badges/pills.
- **Plain CSS bar lists for magnitude comparisons, not a chart library**: `Reports.tsx`'s "Volume by customers" and "Demand by product" are `div` tracks with a filled `div` sized by `width: ${value/max * 100}%` — same technique as `StagePill`/progress-bar patterns already in the app. Reach for this whenever the shape is "N items compared by one number," before reaching for a charting dependency.
- **Client-side aggregation for a report period, not N `aggregate()` round-trips**: `useReports.ts` reads every order + line + customer in the selected range in ~3 batched calls and derives every stat/list from that one row set in JS, rather than one `aggregate()` call per widget — justified here because the widgets overlap heavily on the same underlying rows (documented as a scale tradeoff in the hook's own comment; revisit with server-side aggregation if a range routinely spans thousands of orders).
- **A feature with no backing schema field renders its UI but stubs the action**: `Settings.tsx`'s Backup/Restore/Export CSV buttons are fully styled and clickable (matches the design) but `onClick` shows an explanatory `window.alert` instead of pretending to work — chosen over disabling them (which would visually contradict a crisp design mock) or silently building fake functionality. Use this pattern — present, honest, non-functional — whenever a design calls for a feature this codebase's schema doesn't support yet, rather than inventing data or a field that isn't there.
- **Custom icon swapped into a native `<input type="date">`**: `PickList.tsx`'s `.dateField` wrapper stretches `::-webkit-calendar-picker-indicator` to `inset: 0` and sets `opacity: 0` (native picker stays clickable, just invisible), then overlays a decorative `pointer-events: none` `Icon` in its place. Reach for this instead of a full custom date-picker component when the native picker's *behavior* is fine and only its *glyph* needs to match the icon system — Firefox doesn't support the pseudo-element so the icon there just doubles up with the browser's own, a documented acceptable degradation, not a bug to chase.

## Update — 2026-08-07 (1) Pick List page

- **Sticky header progress line, bar + text inline**: below the title/count-pill row, a `.progressRow` (`display:flex; gap: var(--space-sm)`) holds a `.progressBar` (120×6px pill track, `--bg-muted`) with a `.progressBarFill` sized by inline `width: ${pct}%`, then a `<p>` caption ("N of M pulled") to its right. The existing sticky `.header` (same `position: sticky; top: 0; background: var(--bg-surface)` pattern as `OrderDetail`/`ProductDetail`) already keeps this in view for free — no custom scroll-tracking needed.
- **A derived count should reflect what's actually rendered, not the pre-filter fetch size**: `usePickList.ts`'s `orderCount` is `new Set(rows.flatMap(r => r.orders.map(o => o.orderId))).size` — computed from the built `rows`, not `orders.length` from the raw `readOrders` call. An order that matched the pool filter but contributed zero lines (e.g. every line removed) shouldn't inflate a count the user reads as "orders you need to pull for."
- **Inline product-name + status badges, not stacked**: when a card's primary label and its status badges (a pill, a muted icon+caption) are all short, lay them out `flex-direction: row; flex-wrap: wrap; align-items: center` instead of stacking vertically — reserve the stacked layout for when the badge is a full-width secondary line (e.g. a note or description), not a compact status marker.
- **Custom checkbox (`role="checkbox"` button, not `<input type="checkbox">`)**: 22×22, `--radius-sm`, `1.5px solid var(--border-default)` unchecked → `--accent-primary` border+background checked, with a plain-glyph `checkmark` icon (`hugeicons:tick-02`) in `--text-on-accent` shown only when checked. Reach for this over a native checkbox when the design calls for exact token-driven checked/unchecked colors rather than relying on `accent-color` (the native-checkbox convention documented earlier in this file, still correct for simple read-only/disabled boolean displays — this is for an *interactive* checklist where the checked state needs its own background+icon treatment).
- **Ephemeral per-visit checklist state**: a `Set<string>` in local `useState`, not persisted (no `localStorage`, no Directus write) — matches the architecture-invariant reasoning already established for `useNotificationReadState` (client-only UI state, not business data), but one step lighter: this one doesn't even survive a reload, by design (a picker's checklist is meaningless once they've left the page). Reset-on-key-change is done by comparing state during render (`if (day !== trackedDay) { setTrackedDay(day); setChecked(new Set()) }`), not a `useEffect` — avoids the `react-hooks/set-state-in-effect` lint error and matches the "Synchronized Stage Pill Navigation" pattern already documented below.
- **Approximate-vs-exact quantity display**: a real product-master flag (`products.catch_weight`) — not the unit string — decides whether a summed total gets a `~` prefix. Don't infer "this is a weighed item" from `unit === 'kg'`-style string checks; a counted item can use `kg`-adjacent units too and a per-order-weighed item might use a unit that reads like a count. Ask the actual boundary field.
- **Mini-table row instead of a comma/dot-joined summary line**: when a card needs to break down "who contributes to this total" (here: which orders make up a pooled product quantity), give each contributor its own flex row (`justify-content: space-between`, `border-bottom: 1px solid var(--border-subtle)`, last row's border removed) rather than concatenating them into one wrapping prose line — the prose version stops scaling past ~4 entries, a row-per-entry doesn't.
- **Full-bleed divider inside a padded `Card`**: `margin: var(--space-md) calc(var(--space-lg) * -1) 0` on an `<hr>` (no border, just `border-top: 1px solid var(--border-subtle)`) — pulls the rule out to the card's edges when the design wants a header section visually separated from a full-width list below it, while the rest of the card keeps its normal `--space-lg` padding. Same trick as `ProductDetail`'s `.divider` (see the 2026-08-05 entry below); this is the second use, worth keeping as the standard "full-bleed divider inside a Card" pattern.
- **Small amber/status pill under a title, not a trailing inline badge**: e.g. "3 cutting jobs" renders as its own pill (`color-mix(in srgb, var(--state-warning) 15%, transparent)` background, `var(--state-warning)` text, `--radius-sm`, icon + label) stacked under the product name, not appended to the end of a wrapping text line — keeps a state-worth-flagging detail visible regardless of how much other text is on the card.
- **Capability-gated Dashboard trigger buttons launching a full-page tool**: `variant="secondary"` `Button`s in the Dashboard's `topActions` row, each gated on its own capability (`viewPickList`, `viewDeliveryRun`, `reconcileCOD`) and `onClick={() => navigate('/route')}` — the same shape as the existing "New Order" trigger, just `secondary` instead of `primary` since these are secondary/occasional actions relative to the primary order-creation flow.

## Update — 2026-08-06 Returns sub-flow + Intake panel real data

- **Parallel-bucket action panel, not a single next/prev button pair**: `STAGE_FLOW`'s generic advance/send-back button pair (one `next`, one `prev`) only fits a linear stage. Where a state can have *multiple independent things simultaneously needing action* (returns: receive AND settle AND sign can all be true at once), render one `<Card>` with a sub-section per active bucket instead of trying to force it through the single advance-button pattern. Compute which buckets are active via a pure function (`returnBucketsForOrder()` in `pipeline.ts`) operating on the record's field state — never by comparing the record's single `stage` field against a bucket key, since a bucket isn't a stage value here.
- **Secondary "alternate outcome" button next to a stage's primary action**: e.g. "Customer refused / returned" sits beside "Mark as Delivered" at the dispatch stage, same capability gate as the primary action (it's an alternate outcome of the same courier action, not a new permission), `variant="secondary"` with an inline `color: var(--state-error)` override to visually distinguish it as the "something went wrong" path without a whole new Button variant.
- **Per-line refuse/receive qty + evidence photo row**: `flex` row of `{name} {qty input, width 90} {unit} {camera-icon file-input label} {uploaded thumbnails}` — reused identically for both the courier's refusal capture and the warehouse's receive/re-weigh step. The camera trigger is a `<label>` wrapping a visually-hidden `<input type="file">` styled as the existing `.actionBtn` button class, not a separate custom file-picker component.
- **WhatsApp Intake panel loading/error/empty**: same three-state pattern as `AttentionPanel`/`NotificationsPopover` (`.empty` paragraph class, `--text-secondary`). Sender shown as the raw phone number when no reliable customer-name join exists — don't fuzzy-match a free-text field to fake a name.

## Update — 2026-08-05 Dark mode toggle + themed logo

- **Theme toggle button**: lives in the Sidebar, immediately after the collapse-toggle button — same `variant="tertiary" size="md" iconOnly` `Button` shape, same inline-style centering block. Icon flips: moon (`hugeicons:moon-02`) shown in light mode (offers to switch to dark), sun (`hugeicons:sun-01`) shown in dark mode (offers to switch to light) — the icon always represents the mode you'd switch *to*, not the current mode.
- **Theme state**: `src/hooks/theme-context.ts` + `useTheme.ts` + `ThemeProvider.tsx`, mirrors the `SidebarContext`/`useSidebar`/`SidebarProvider` three-file split exactly (context+types / hook / provider component, to satisfy react-refresh/only-export-components). `data-theme="light"|"dark"` is set on `document.documentElement` (not a wrapper div — there's no single root wrapper in `main.tsx`), persisted to `localStorage` (`ipp_theme`), with `prefers-color-scheme` as the first-visit fallback when nothing is stored yet. `ThemeProvider` wraps the entire app in `App.tsx`, outside `AuthProvider`, so `/login` also respects the theme.
- **Any token added to `:root` must get a `[data-theme='dark']` override in the same edit** — `tokens.css` had drifted (9 tokens were light-only) before this pass. Check `context/ui-context.md`'s Dark Theme table against `tokens.css`'s `[data-theme='dark']` block whenever adding a new color token.
- **Themeable brand assets must be inlined, not `<img src="...svg">`**: an `<img>` loads the SVG as an isolated document with no access to the page's CSS custom properties, so a token like `--logo-mark` inside the file does nothing. Pattern: a small React component (`src/components/Logo/Logo.tsx`) that inlines the SVG markup as JSX, with the parts that should re-theme using `fill="var(--some-token)"` and parts that are fixed brand color (e.g. the logo's red) kept as a literal hex. Swap every `<img src={logo} className={styles.logo} />` usage for `<Logo className={styles.logo} />` — the existing `.logo` CSS class's `width`/`height` apply the same way to an inline `<svg>`.

## Update — 2026-08-05 Notification bell: unread badge + mark-as-read

- **Unread-count bell badge** (replaces a plain "has-unread" dot): small pill at the icon-button's top-right corner, slightly overlapping the edge (`top:-4px; right:-4px`) rather than inset. `background: var(--accent-primary)`, `color: var(--text-on-accent)`, `border: 2px solid var(--bg-surface)` (the border punches the "cutout" look against whatever the button sits on). Caps its number at `99+` — cap the display, never the underlying count used for logic. Renders only when count > 0; a badge that shows "0" defeats the point of a *count* badge (vs. a dot, where presence alone was the signal).
- **Popover header, count next to the heading + a bulk action on the right**: `<div class="titleRow">{heading}{badgePill}</div>` on the left, a `variant="ghost" size="sm"` `Button` bulk-action (e.g. "Mark as read") on the right of the same flex header — don't put a count pill and an action button on opposite ends fighting for the same row without grouping the heading+count first.
- **Read vs. unread list-item text**: unread = `--text-primary`, read = `--text-muted` via an additive modifier class (`.text` base + `.textMuted` appended), not a separate full style block — keeps the two states visually identical apart from color.
- **Local "last read" cursor instead of per-item read tracking**: when a feed has no server-side read/seen field and adding one is out of scope, use a single timestamp cursor in `localStorage` (bump-to-now on "mark as read", compare-string-timestamps for unread) rather than persisting a growing set of read IDs. See `useNotificationReadState.ts` for the pattern and the architecture-invariant reasoning (Session Notes in `progress-tracker.md`).

## Update — 2026-08-05 Needs Attention + Notifications real data

- **Clickable panel row with a count pill**: `AttentionPanel`'s rows changed from `justify-content: flex-start` (icon+label only) to `justify-content: space-between`, with `.content { flex: 1; min-width: 0; }` so the label truncates with an ellipsis instead of pushing the count off-screen. The count itself is the same `.countBadge` pill convention as the Orders/Products page header counts (`--text-caption`/`--text-muted`, `--bg-surface` fill, `1px solid var(--border-default)`, `--radius-xl`, `2px 10px` padding) — this is now the third place using that exact pill (Orders header, Products header, Needs Attention rows), so treat it as the standard "count badge" pattern, not a one-off.
- **Bucket-list panel empty state**: when a "needs attention"-style panel's buckets can legitimately all be zero, filter zero-count buckets out entirely (don't render a "0" row) and show a single muted `<p>` in the list's place ("Nothing needs attention right now.") rather than an empty `<div>`.
- **Panel-row click reuses the stage-filter id**: like `StagePill`/`ReturnWorkflowsPanel`, a clickable dashboard row's `id`/`key` doubles as the literal Orders-page filter value passed to `navigate('/orders', { state: { stage: id } })`. Don't invent a separate "filter key" field on the item type — keep the id semantically meaningful so one value does both jobs (React key + navigation target).

## Update — 2026-08-05 Product Detail/Edit split

- **Dossier Detail page (no side panel)**: for a record type without an order-history-style side panel (Product, vs. Customer/Order which have one), the Detail page's `.header` is just Back (left) + action buttons (right) — no title in the header. The record's name + subtitle live *inside* the first `Card` instead, followed by a plain `<hr class="divider">` (`border-top: 1px solid var(--border-subtle)`) before the field grid. See `ProductDetail.tsx` / `ProductDetail.module.css`.
- **Detail-page Delete + Edit pair**: when a record type supports hard delete (Products do; Customers/Orders don't), both buttons live in the header's `.actions` group, `variant="secondary"`, Delete (`icon="trash"`) before Edit (`icon="edit"`), both gated behind the same capability check. Delete confirms via `window.confirm` and is blocked with an alert if the record is referenced elsewhere (e.g. a product used by existing `order_lines`) — check this before the confirm dialog, not after.
- **Edit-page Delete kept alongside Cancel/Save**: when the Edit page (not just Detail) also needs to support delete, add it as a third button in the header `.actions` row, ahead of Cancel/Save: `[Delete] [Cancel] [Save Changes]`. Same guard logic as the Detail page's Delete.
- **Boolean/status fields as pills on a Detail page** (supersedes "read-only checkboxes" below for `ProductDetail`): a view-only boolean is a pill, not a disabled checkbox — checkboxes read as interactive even when they're not. Two shapes:
  - **Binary status pill** (e.g. in-stock/out-of-stock): always rendered, positioned top-right of the record's name/subtitle heading row (`.headingRow`, `justify-content: space-between`, inside the first `Card`, above the divider). Default state uses the Badge/Pill baseline (`--bg-badge`/`--text-badge`); the "bad" state swaps to an error-tinted variant (`color-mix(in srgb, var(--state-error) 12%, transparent)` background, `var(--state-error)` text) and its own label text (not just a color swap — e.g. "In-stock" → "Out of stock").
  - **Presence-flag pill** (e.g. catch-weight): renders only when true — `{flag && <span className={styles.pill}>Label</span>}` — it disappears entirely when false, it does not render in a muted/unchecked state.
  - Shared `.pill` class: `padding: 2px var(--space-sm)`, `border-radius: var(--radius-sm)`, `font: var(--text-caption)`, `font-weight: 600`, `text-transform: uppercase`.

- **Read-only checkboxes for boolean fields** (still applies elsewhere, e.g. non-pill contexts): render as `<input type="checkbox" checked={value} disabled readOnly />` next to its label. `readOnly` is required alongside `disabled` to avoid the React controlled-input console warning.

## Update — 2026-08-04 Shared OrderRows + Orders count badge

### OrderRows (shared expandable order table row)
- **Location**: `src/components/OrderRows/OrderRows.tsx` + `OrderRows.module.css`. Renders one order as a self-contained `<tbody>` — arrow/chevron cell, Order ID, `StatusPill`, Order Date, Delivery Date, Sales Rep, Customer, Items count — plus an optional line-items sub-row. Shared verbatim by the Orders page (`src/pages/Orders/Orders.tsx`) and the Dashboard's `OpenOrdersPanel` (`src/pages/Dashboard/sections/OpenOrdersPanel.tsx`); both render `<table>{orders.map(o => <OrderRows key={o.id} order={o} />)}</table>` with **no** page-level `<tbody>` wrapper, since each row owns its own.
- **Row grouping trick**: the whole row (+ its expanded sub-row, when open) lives inside one `<tbody className={orderGroup}>`, not a bare `<tr>`. This is what lets `.orderGroup` apply hover/rounded-corner styling across both `<tr>`s as a unit — see the `:not(.expandedGroup)` / `.expandedGroup` selector pair in `OrderRows.module.css` for the corner-radius flip between collapsed (radius on the single row) and expanded (radius moves to the last row) states.
- **Chevron**: `--accent-primary` colored, `transition: transform 0.2s ease`, rotates 90° (`chevronOpen`) when expanded — arrow-cell click toggles independently of the row click (which navigates to `/orders/:id`), via `e.stopPropagation()`.
- **8-column table contract**: any page embedding `OrderRows` must render exactly this 8-column `<thead>` (arrow · Order ID · Stage · Order Date · Delivery Date · Sales Rep · Customer · Items) — the line-items sub-row hardcodes `colSpan={8}`.
- **Data contract**: takes a single `order: OpenOrder` (`src/types/dashboard.ts`) prop. Self-contained — reads `useCan()('seePrices')` and `useNavigate()` internally, no prop threading needed.

### Count badge beside a card heading
- Pattern for showing a live count next to an `<h3>`/heading inside a `Card`: `<span className={styles.count}>{n}</span>` styled `--text-caption` / `--text-muted` text, `--bg-surface` fill, `1px solid var(--border-default)`, `--radius-xl` (pill), `2px 10px` padding. Originated in `OrderDetail`'s Items/Documents headings; now also used on the Orders page header (`Orders.tsx`) next to the stage headline, driven by `useOrders()`'s `total` (already scoped to the active stage + search filter).

## Update — 2026-07-24 Order Detail Enhancements

### AddItemModal (inline free-text + catalog match)
- **Trigger**: Full-width `variant="primary"` button at bottom of edit-mode Items Card.
- **Step 1 — Input**: `modalBackdrop` overlay + `addItemModalCard` panel (max-width 560px, `--radius-xl`, `--shadow-lg`, `--space-xl` padding, flex-column gap). Header row (bold title + close icon button). Label + `addItemTextarea` (`min-height: 90px`, `--bg-surface-hover` fill, focus outline `--accent-primary`). `✨ Match` full-width primary button (disabled when empty; `Enter` key also triggers).
- **Step 2 — Matched Result**: `matchDivider` (`border-top: 1px solid --border-subtle`) separates steps. `matchedResultRow` (`--bg-surface-hover` background, `--border-subtle` border, `--radius-md`) holds qty `<input>` (70px, center-aligned) + unit `<select>` (90px) + product catalog `<select>` (flex:1). Custom name text input shown only when no catalog product matched.
- **Actions**: `modalActionsRow` flex row (equal-width children via `> * { flex: 1 }`). Left = secondary Cancel, Right = primary "Add to order" (disabled when name empty).
- **Close behavior**: click backdrop, click Cancel, or click × icon — all call `closeAddItemModal()` which resets `addItemText`, `matchedItem` state.
- **State placement rule**: All `useState` for the modal (`isAddItemModalOpen`, `addItemText`, `matchedItem`) must be declared at component top level **before any `useEffect`**, per React Rules of Hooks.

### Item photo upload — non-weighed items
- Non-weighed items (`!isWeighedItem` — units: Box, Pack, pcs, ekor) show a `variant="secondary" size="sm" iconOnly` camera `<Button>` in view mode, matching the existing camera button on weighed items.
- Pattern: `<label style={{ display: 'inline-flex', cursor: 'pointer' }}><Button onClick={trigger next sibling click} /><input type="file" accept="image/*" style={{ display: 'none' }} /></label>`.
- Camera button triggers hidden file input via `(e.currentTarget as HTMLElement).nextElementSibling?.click()`.

### Sticky side panel
- The Notes & History column uses `position: sticky; top: 80px; height: calc(100vh - 100px); overflow-y: auto` so it remains in the viewport while the main content column scrolls independently.

---

## Update — 2026-07-14 Range, Sorting & Nav Enhancements

- **Persistent Auth Storage Pattern**: Migration of authentication session storage (`sessionStorage`) to permanent local storage (`localStorage`) to keep the user signed in across browser sessions.
- **Custom Dropdown Selector Pattern**: Used for Metric Card Range selection, Order Stage selection, and Order Table sorting. Avoids native `<select>` dropdowns for a more premium visual alignment. Features:
  - Custom button matching `--border-default` and `--radius-md` tokens.
  - Hover states changing background to `--bg-surface-hover` and border to `--accent-primary`.
  - Absolute positioned popover overlay (`z-index: 20`) with click-outside pointer detection and Escape key close synchronization.
  - Embedded native input pickers (month, year, date) inside dropdown items to support complex sub-queries.
- **Scrolling Panel Containment Pattern**: Intake and Needs Attention panels restrict maximum lists to `max-height: 240px; overflow-y: auto;` with compact padding, preventing layout growth on large message batches.
- **Synchronized Stage Pill Navigation**: Triggering `navigate('/orders', { state: { stage: key } })` on Dashboard pills. In `Orders.tsx`, local state is updated dynamically during the render pass by comparison to `location.key` (avoiding useEffect cascading setState renders).

## Update — 2026-07-13 Auth + Create New Order

- **Login page** (`src/pages/Login/`) — centered card on `--bg-muted`, `--radius-xl`, `--shadow-lg`, `--space-3xl` padding, max-width 420px. Brand logo + name at top, h2 title, subtitle, email + password fields per Input baseline, inline error alert (`--state-error` on `--bg-surface-hover`), primary submit button. Per ui-registry Modal baseline sizing conventions.
- **NewOrderModal** (`src/components/NewOrderModal/`) — centered modal overlay (`rgba(0,0,0,0.4)`) per Modal baseline, `--radius-xl`, `--shadow-lg`, max-width 760px, `--space-xl` padding, max 90vh scroll. Header (title + close `×` button), 2-column form rows (customer `<select>` + delivery date + sales rep + notes), dynamic order-lines section (each row: index + product `<select>` + free-text name input + qty number input + unit `<select>` + trash button). Footer: cancel (ghost) + create (primary). Disabled state when `can('createOrders')` is false. Closes on overlay click or Escape (per Modal baseline).
- **Auth context pattern** — split across `auth-context.ts` (context + types, no JSX) + `RoleContext.tsx` (provider component only) + `useAuth.ts` (hooks only). Required to satisfy react-refresh/only-export-components. Tokens in-memory only (SDK `authentication('json')`), no localStorage.
- **ProtectedRoute pattern** — wrapper in `App.tsx` that checks `useAuth().user` + redirects to `/login` when unauthenticated; loading state returns a bare `--bg-muted` full-viewport div; `/login` itself redirects to `/` when already signed in.
- **Capability-gated button pattern** — Dashboard "New Order" button calls `useCan()('createOrders')` and sets `disabled` + `title` when false; the modal also re-checks on submit and shows an inline error if the role lacks the capability.

New patterns introduced this session (append if reused):

- **Modal overlay close**: `onClick={close}` on overlay + `onClick={(e) => e.stopPropagation()}` on the modal body + Escape key listener (disabled while submitting).
- **Dynamic line list in modal**: state array of `{ id, productId, freeText, qty, unit }` drafts; add/remove rows; product `<select>` + free-text name input are mutually exclusive (selecting a product disables the name field with the product name shown).
- **Sequential order number generation**: `getNextOrderNo()` reads the max `no` for `IPP-<year>-` rows, +1, zero-pads to 4 digits. Relies on the DB UNIQUE constraint to catch races.
- **Auth rehydrate-on-mount**: `AuthProvider`'s `useEffect` calls `rehydrate()` (checks `hasToken()`, reads `/users/me`, loads `role_permissions`) wrapped in a nested async function so setState calls aren't synchronous in the effect body (satisfies react-hooks/set-state-in-effect).

---

## Update — 2026-07-13 Dashboard Refresh

- Icons migrated to HugeIcons via Iconify (`@iconify/react` + `@iconify-json/hugeicons`) through `src/components/Icon/`.
- Main accent updated to `--accent-primary: #0c4458`.
- Neutral gray system updated: `--bg-muted / --bg-surface-hover: #f0f5f5`, `--border-default: #d6d6d6`, `--text-secondary: #7c7c7c`.
- Navbar pattern updated: muted gray background, 16px icon + 16px text tabs, tabs horizontally centered in the available space between brand and actions, links stretch to full nav height so the active tab underline sits flush on the navbar bottom border.
- Metric row pattern updated: welcome block is its own 160px grid track, separated from the metric cards by a `--space-xl` (24px) gap; metric cards + end-aligned accent CTA card (`Add New Order`) live in a `.metricsRow` sub-grid with a tight `--space-lg` (16px) gap. Metric card icon is 24px; value and label both 16px/500 and use accent color.
- Stage pill pattern updated: vertical stack (count above label), count `20px/700`, label `14px/500`, role-owned stages highlighted in accent blue.
- Dashboard content layout pattern updated: `Need attention` and `WhatsApp Intake` side-by-side; `Open Orders` panel full width below.
- Open Orders interaction pattern updated: expand arrow at row start, entire row click toggles expansion.

## Baseline — Established 2026-07-07

No UI components exist yet. This baseline defines the patterns every **first** component must follow. It is derived from `context/ui-context.md` (the dashboard design spec) — not from existing code (the current `src/` is the default Vite scaffold and will be replaced).

### Global rules (apply to every component)

| Property               | Correct token                               |
| ---------------------- | ------------------------------------------- |
| Font family            | `var(--font-sans)` (Outfit)                 |
| Page background        | `var(--bg-base)`                            |
| Surface (cards/panels) | `var(--bg-surface)`                         |
| Surface hover          | `var(--bg-surface-hover)`                   |
| Primary text           | `var(--text-primary)`                       |
| Secondary text         | `var(--text-secondary)`                     |
| Muted text             | `var(--text-muted)`                         |
| Border default         | `var(--border-default)`                     |
| Border subtle          | `var(--border-subtle)`                      |
| Accent                 | `var(--accent-primary)`                     |
| Accent hover           | `var(--accent-primary-dark)`                |
| Text on accent         | `var(--text-on-accent)`                     |
| Focus ring             | `var(--focus-ring)` + `var(--focus-offset)` |
| Transition             | `var(--duration-fast) var(--ease-default)`  |
| No hardcoded hex       | **Ever.** Use tokens.                       |

### Card / Panel

| Property      | Token                              |
| ------------- | ---------------------------------- |
| Background    | `var(--bg-surface)`                |
| Border        | `1px solid var(--border-default)`  |
| Border radius | `var(--radius-lg)` (12px)          |
| Padding       | `var(--space-lg)` (16px)           |
| Shadow        | `var(--shadow-md)`                 |
| Heading       | `var(--text-h3)`                   |
| Section gap   | `var(--space-lg)` between sections |

### Button — Primary

| Property         | Token                                        |
| ---------------- | -------------------------------------------- |
| Background       | `var(--accent-primary)`                      |
| Text color       | `var(--text-on-accent)`                      |
| Font             | `var(--text-button)`                         |
| Padding          | `var(--space-sm) var(--space-lg)` (8px 16px) |
| Border radius    | `var(--radius-md)` (8px)                     |
| Hover background | `var(--accent-primary-dark)`                 |
| Focus            | `var(--focus-ring)`                          |
| Border           | none                                         |

### Button — Ghost / Secondary

| Property         | Token                     |
| ---------------- | ------------------------- |
| Background       | transparent               |
| Text color       | `var(--text-secondary)`   |
| Hover background | `var(--bg-surface-hover)` |
| Hover text       | `var(--text-primary)`     |
| Border radius    | `var(--radius-md)`        |
| Border           | none                      |

### Input

| Property      | Token                             |
| ------------- | --------------------------------- |
| Background    | `var(--bg-surface)`               |
| Border        | `1px solid var(--border-default)` |
| Border radius | `var(--radius-md)` (8px)          |
| Padding       | `var(--space-sm) var(--space-md)` |
| Font          | `var(--text-body)`                |
| Text color    | `var(--text-primary)`             |
| Placeholder   | `var(--text-muted)`               |
| Focus border  | `var(--accent-primary)`           |
| Focus ring    | `var(--focus-ring)`               |

### Badge / Pill

| Property      | Token                    |
| ------------- | ------------------------ |
| Background    | `var(--bg-badge)`        |
| Text color    | `var(--text-badge)`      |
| Font          | `var(--text-caption)`    |
| Padding       | `2px var(--space-sm)`    |
| Border radius | `var(--radius-sm)` (6px) |

### Navigation item (top bar)

| Property              | Token                             |
| --------------------- | --------------------------------- |
| Font                  | `var(--text-nav)`                 |
| Text color (inactive) | `var(--text-secondary)`           |
| Text color (active)   | `var(--text-on-accent)`           |
| Background (active)   | `var(--accent-primary)`           |
| Background (hover)    | `var(--bg-surface-hover)`         |
| Border radius         | `var(--radius-md)`                |
| Padding               | `var(--space-sm) var(--space-md)` |

### Stage pill (dashboard)

| Property         | Token                             |
| ---------------- | --------------------------------- |
| Background       | `var(--bg-surface)`               |
| Border           | `1px solid var(--border-default)` |
| Border radius    | `var(--radius-lg)` (12px)         |
| Padding          | `var(--space-md) var(--space-lg)` |
| Count font       | `var(--text-h3)`                  |
| Label font       | `var(--text-label)`               |
| Hover border     | `var(--accent-primary)`           |
| Hover background | `var(--bg-surface-hover)`         |

### Table

| Property     | Token                                        |
| ------------ | -------------------------------------------- |
| Row hover    | `var(--bg-surface-hover)`                    |
| Border       | none (borderless rows)                       |
| Header font  | `var(--text-label)`                          |
| Body font    | `var(--text-body)`                           |
| Cell padding | `var(--space-md) var(--space-lg)`            |
| Numbers      | right-aligned, `var(--font-sans)` 500 weight |

### Notification item

| Property  | Token                                      |
| --------- | ------------------------------------------ |
| Layout    | left-aligned, full width                   |
| Divider   | `1px solid var(--border-subtle)`           |
| Timestamp | `var(--text-caption)`, `var(--text-muted)` |
| Order ID  | `var(--text-label)`, `var(--text-primary)` |
| Hover     | `var(--bg-surface-hover)`                  |

### Avatar

| Property      | Token                                        |
| ------------- | -------------------------------------------- |
| Size          | 40px default                                 |
| Border radius | `var(--radius-full)`                         |
| Background    | `var(--accent-primary)`                      |
| Text          | `var(--text-on-accent)`, `var(--text-label)` |

### Modal

| Property      | Token                     |
| ------------- | ------------------------- |
| Overlay       | `rgba(0, 0, 0, 0.4)`      |
| Surface       | `var(--bg-surface)`       |
| Border radius | `var(--radius-xl)` (16px) |
| Padding       | `var(--space-xl)` (24px)  |
| Shadow        | `var(--shadow-lg)`        |
| Max width     | 600px                     |

---

## Built components (2026-07-07)

The Vite scaffold (`src/App.tsx`, `src/App.css`, `src/index.css`) has been removed. The following real components now exist and follow the baseline above:

- **`Card`** (`src/components/Card/`) — matches Card / Panel baseline. `flush` prop for self-padded cards.
- **`Button`** (`src/components/Button/`) — `primary` (teal) + `ghost` variants, per Button baseline.
- **`Avatar`** (`src/components/Avatar/`) — circular initials, `--accent-primary` bg, per Avatar baseline.
- **`MetricCard`** (`src/components/MetricCard/`) — dashboard top-row metric: bordered icon tile + range dropdown toggle + 40px number + label.
- **`StagePill`** (`src/components/StagePill/`) — clickable count + label pill, per Stage pill baseline.
- **`TopNav`** (`src/layouts/TopNav/`) — sticky top bar: brand + nav links (active = teal pill) + search + icon buttons (bell w/ notification dot, settings) + user chip. Per Navigation baseline.
- **Dashboard sections** (`src/pages/Dashboard/sections/`) — `IntakePanel`, `ApprovalPanel`, `OpenOrdersPanel` (per Table baseline). (The notifications panel was originally a right-column `NotificationsPanel` section but is now a popover — see below.)
- **`NotificationsPopover`** (`src/components/NotificationsPopover/`) — bell button + dropdown dialog toggled from the TopNav bell. Replaces the dashboard's right-column notifications panel so it no longer takes page real estate. Anchored top-right under the bell, 360px wide, max 70vh scroll, header with "N new" badge, grouped date list per Notification item baseline. Closes on outside-click or Escape. Enter animation: opacity 0→1 + translateY(-8px)→0 over 200ms (per ui-context.md dropdown enter); disabled under `prefers-reduced-motion`.

New patterns introduced this session (append if reused):

- **Metric icon tile**: 44×44, `--radius-md`, `1px solid var(--border-default)`, icon `--text-primary`.
- **Range dropdown toggle**: bordered `--radius-md` chip, `--text-label`/`--text-secondary`, `ChevronDown` 16px. Hover → `--accent-primary` border.
- **Notification date group header**: `--text-label`, `--text-secondary`, above a divider-separated entry list.
- **Popover/dropdown**: anchored to its trigger, `--shadow-lg`, `--radius-lg`, max 70vh scroll, outside-click + Escape to close, 200ms enter animation (opacity + translateY), disabled under reduced-motion.

## Built components (2026-07-08)

- **`OpenOrdersPanel` updated** — now wired to Directus (`useOpenOrders` hook). New "Items" column with expand/collapse toggle.

New patterns introduced this session (append if reused):

- **Expand/collapse toggle (table row)**: inline-flex button in a table cell, `--text-body`/`--text-primary`, `--radius-sm`, `--space-xs`/`--space-sm` padding. Shows count ("N items"/"N item") + `ChevronDown` 16px (`--text-secondary`). Hover → `--bg-surface-hover`. Disabled state (0 items): `--text-secondary`, no cursor, no arrow. Expanded state: chevron rotates 180° via `transform: rotate(180deg)` with `transition: transform 0.2s ease`. Expanded sub-row: `colSpan` full width, `--bg-surface-hover` inner panel with `--radius-md`, `--space-md`/`--space-lg` padding, flex column gap `--space-sm`.
- **Loading / error / empty states (panel)**: `--text-body`, `--space-md` padding. Error uses `--status-danger` color (fallback `#c0392b`). Muted/empty uses `--text-secondary`.

---

## Built components (2026-08-07)

- **`QuickActionCard`** (`src/components/QuickActionCard/`) — Dashboard's Deliveries / Pick list / Cash-up row card. A full-width clickable `<button>`: icon tile + label on the left, a bold value + small suffix text on the right (`justify-content: space-between`). `1px solid var(--border-default)` border, `--radius-md`, hover → `--bg-surface-hover` background. Icon tile is a plain 36×36 flex box (no background fill) tinted `--accent-primary`; label/value also read `--accent-primary` rather than `--text-primary` (a deliberate accent-forward variant on the Metric icon tile pattern below, not the same styling). Renders `-` for the value when the underlying count/amount is zero, instead of hiding the card — capability-gating (whether the card renders at all) and empty-state (what it shows once rendered) are two separate, independently-controlled concerns.

New patterns introduced this session (append if reused):

- **Role-gated grid, dynamic column count**: when a grid row's children are individually gated (`{cond && <Card/>}` per item) and the *number* of visible children varies (1–3 here), don't hardcode `grid-template-columns: repeat(3, ...)` — the visible items will only fill part of the row, leaving dead space instead of stretching. Instead compute the visible count in the component (`[cond1, cond2, cond3].filter(Boolean).length`), pass it down as a CSS custom property via inline `style={{ "--foo-count": n } as React.CSSProperties }}`, and reference it in the CSS module: `grid-template-columns: repeat(var(--foo-count, 3), minmax(0, 1fr))`. The `, 3` fallback keeps SSR/no-JS and the responsive single-column media-query override well-defined. First used on the Dashboard's `.quickActionsRow`.

## Built components (2026-08-10)

- **`CourierLiveLocation`** (`src/components/CourierLiveLocation/`) — visible "● live · Xs ago" badge (a small `--state-success`-colored dot + relative timestamp, recomputed on a polling interval — never `Date.now()` inline in render, which the React Compiler's purity lint flags; compute at fetch-time and store as state) plus a keyless Google Maps iframe embed (`maps.google.com/maps?q={lat},{lng}&z=15&output=embed`, 200px tall, `--radius-md` border). No map library dependency — matches this app's existing external-Maps-link convention. Pairs with the silent `useDriverLive()` hook (no UI) in the same folder, which throttles `watchPosition` fixes to one write per ~20s via a `useRef` last-written timestamp, not a write per fix.
- **"Needs attention today" digest tiles** (`Dashboard.tsx` + `.digestTile`/`.digestTileLoud`) — a 5-up button grid, each tile styled like a compact `QuickActionCard` variant (bold value top, caption label below, `chevronRight` pinned top-right, same `--border-default`/`--radius-md`/hover-background treatment) but stacked vertically instead of row-flex. **Loud variant is opt-in per tile, not per section**: `.digestTileLoud` (`color-mix(in srgb, var(--state-warning) 10%, var(--bg-surface))` background + warning border) is applied only to tiles representing money/documents at risk, and only conditionally when their count is > 0 — informational tiles in the same grid stay neutral regardless of count. Don't make the whole grid "loud-capable"; gate it per tile at the call site so the emphasis stays meaningful. A quiet, non-interactive `.doneRow` footer (no border, no hover, no chevron, `--text-secondary`) sits below for reassurance-framed metrics (counts already resolved, nothing to act on) — the visual weight difference from the tile grid above it is the whole point of the two-row split.
- **`OrderDetail.tsx`'s `.orderActions` group is the one place cross-stage overrides live** (Reorder, Put on hold, Send back, Restore, Cancel) — secondary-styled buttons at the bottom of the main column, gated *independently* of `stage`/hand-off state, same place at every stage. Distinguish an "override" (flow-level: cancel, hold, send back, reopen, reorder) from "stage-work" (what the current actor actually does, e.g. the forward advance button, "Customer refused" at dispatch) with a simple test: does it change *which* stage the order is at without being that stage's own forward step? If yes, it belongs in `.orderActions`, not the top primary-action row. Keeps override buttons in one predictable spot instead of moving per stage, and keeps disruptive actions (send back, cancel) away from the constantly-tapped primary button.
- **`StatusPill` colour is role-derived, never per-entry** (`src/components/StatusPill/`) — `STATUS_LABELS` holds display text only; the actual colour always comes from `statusColor(key)` (`lib/pipeline.ts`), which resolves a stage/return-bucket key to the CSS custom property of the role responsible for it (`--role-admin`, `--role-warehouse`, etc.), falling back to dedicated `--state-done`/`--state-returned`/`--state-neutral` tokens for terminal states that no role owns. Never give a `StatusPill` entry its own hardcoded hex — two unrelated stages owned by different roles must never accidentally collide on the same colour, which is exactly what happened before this was centralized. A small leading dot (`.dot`, 7px circle, `background: <resolved colour>`) precedes the label inside the pill; the tinted background/border use `color-mix(in srgb, <colour> N%, transparent)` rather than string-concatenating a hex + alpha suffix, since colour is a `var(...)` reference now, not a raw hex.
- **`StatusPill` always shows exactly one label, never two lines** (`subLabel` prop, e.g. dispatch's "Out for delivery" vs "Awaiting driver" from `dispatchSubLabel()` in `pipeline.ts`) — when a `subLabel` is passed it *replaces* the generic stage label (`displayLabel = subLabel ?? fallbackLabel`) rather than stacking underneath it. An earlier version of this rendered both ("DISPATCH" + a muted second line); that read as two competing labels in the same pill and was corrected to show only the more specific one. Colour is still driven by `status` (the role that owns it) regardless of which text wins — a dispatch pill showing "Out for delivery" is still Courier red. The derivation function returns `null` when no sub-label applies (every non-dispatch row), so the call site is a bare prop pass-through with no extra conditional.

## How this registry is used

At the start of any session involving UI work, read this file before writing any component. When building a new card, check the Card baseline above. When building a new button, check the Button baseline. Match the exact tokens.

After building any new component, run `/imprint` to capture its specific patterns and append them to this registry.
