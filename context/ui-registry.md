# UI Registry

> Established by `/imprint audit` on 2026-07-07.
> This is the consistency baseline. Every component built after this must match these patterns.
> Token source of truth: `context/ui-context.md` + `context/ui-tokens.md`.
> CSS implementation: `src/styles/tokens.css`.

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

## How this registry is used

At the start of any session involving UI work, read this file before writing any component. When building a new card, check the Card baseline above. When building a new button, check the Button baseline. Match the exact tokens.

After building any new component, run `/imprint` to capture its specific patterns and append them to this registry.
