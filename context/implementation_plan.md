# Dashboard Redesign — Sidebar + Layout Overhaul

## What we are building

Converting the horizontal TopNav into a collapsible left sidebar that pushes the main content area. Reworking the Dashboard layout to match the design reference: simplified TopRow (welcome + notification + New Order button), 4-metric cards with range selectors, 8-pill current pipeline grid, then a 3-column panel row (Return Workflows card with list-style pills | Needs Attention borderless list | WhatsApp Intake role-gated). Button component gains `size` prop (`sm | md | lg`).

---

## Language agreed on

- **Sidebar (Navbar)**: The left vertical navigation pane that replaces the top `<header>`. Expanded = 260px wide with logo mark + text labels. Collapsed = 72px wide with logo mark + icons only. State persisted in `localStorage`.
- **Pushing content**: When the sidebar width changes, the main content area adjusts its left margin/offset accordingly (no overlay).
- **Return Workflow pills**: Rendered as horizontal single-line rows (count + label side-by-side) inside a Card, **not** the stacked grid pills used in the main pipeline.
- **WhatsApp Intake**: Visible only to `Admin` and `Owner` roles. Hidden (not just transparent) for others, allowing the other two panels to stretch to fill the grid.
- **Button size prop**: `sm` (32px height, compact), `md` (40px, default), `lg` (48px, high-emphasis). All three sizes available for all variants (primary, secondary, ghost, tertiary).

---

## Decisions made

- **Sidebar state persistence**: `localStorage` key `ipp_sidebar_collapsed`. Defaults to expanded (`false`).
- **Sidebar transition**: CSS `width` transition on the sidebar element + `margin-left` transition on `<main>`. This pushes rather than overlays content.
- **Collapse trigger**: A `chevronLeft` icon button anchored at the bottom of the sidebar links area. When collapsed it shows `chevronRight`.
- **TopRow**: `Welcome / [Name]` on the left. Notification popover icon button + primary `Button` (lg) for New Order on the right. No search bar (removed per user request).
- **New Order CTA**: Moved from the old metrics-row custom card to a `Button` variant="primary" size="lg" in the TopRow header. The old `.newOrderCard` custom styles will be removed.
- **Metrics**: 4 cards: Total Orders, Delivered Orders, Returned Orders, Cancelled Orders. Ordering is: Total → Delivered → Returned → Cancelled.
- **Return Workflows layout**: A `Card` panel with a vertical list of `ReturnPill` rows (count + label horizontal). The existing `StagePill` grid component is kept for the main pipeline. A new `ReturnPill` sub-component is added to `StagePill/` or inline in Dashboard.
- **3-column panels grid**: `[Return Workflows] | [Needs Attention] | [WhatsApp Intake (admin/owner only)]`. When WhatsApp Intake is hidden, the other two panels expand to fill the space using a responsive grid.
- **Needs Attention items**: `.row` loses its `border` and `border-radius` box styling. Items are borderless, padded text rows with the alert icon.

---

## Proposed Changes

### 1. Token update (`src/styles/tokens.css`)
- Add `--sidebar-width-expanded: 260px` and `--sidebar-width-collapsed: 72px` tokens.
- Remove `--nav-height` from layout if no longer needed by the horizontal nav.

---

### 2. Button component (size variants)

#### [MODIFY] [Button.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/Button/Button.tsx)
- Add `size?: 'sm' | 'md' | 'lg'` to `ButtonProps`, default `'md'`.
- Compose class string as `[styles.button, styles[variant], styles[sizeClass]]`.

#### [MODIFY] [Button.module.css](file:///d:/IPP/IPP-OrderFlow/src/components/Button/Button.module.css)
- Extract shared layout into `.button` base class.
- Add `.sm`, `.md`, `.lg` size modifier classes with padding, font-size, and min-height.

---

### 3. Sidebar layout (replaces TopNav)

#### [NEW] `src/layouts/Sidebar/Sidebar.tsx`
- Reads `localStorage` for initial collapsed state.
- Renders: IPP logomark at top → `<nav>` with 5 NavLinks (Dashboard, Orders, Customers, Reports, Settings) → collapse toggle button → separator → Avatar + name/role → Logout button at bottom.
- Exports a `useSidebar` context or lifts state so `AppLayout` can read the width.

#### [NEW] `src/layouts/Sidebar/Sidebar.module.css`
- `.sidebar`: fixed left, full height, `width: var(--sidebar-width-expanded)`, transition width.
- `.collapsed`: width `var(--sidebar-width-collapsed)`.
- `.logo`, `.nav`, `.link`, `.linkActive`, `.bottomSection`, `.separator`, `.collapseBtn` etc.

#### [MODIFY] [AppLayout.tsx](file:///d:/IPP/IPP-OrderFlow/src/layouts/AppLayout/AppLayout.tsx)
- Replace `<TopNav />` with `<Sidebar />`.
- Add `SidebarProvider` context so `<main>` can read sidebar width.
- `.shell`: `display: flex; flex-direction: row`.
- `.content`: `margin-left` transitions with sidebar width.

#### [MODIFY] [AppLayout.module.css](file:///d:/IPP/IPP-OrderFlow/src/layouts/AppLayout/AppLayout.module.css)
- `.shell`: `display: flex; min-height: 100vh`.
- `.content`: `flex: 1; min-width: 0; padding: var(--space-xl) var(--space-xl) var(--space-3xl); transition: padding-left`.

#### Keep [TopNav.tsx](file:///d:/IPP/IPP-OrderFlow/src/layouts/TopNav/TopNav.tsx) file (do not delete — will gut its usage from AppLayout but keep file in case of rollback)

---

### 4. Dashboard TopRow

#### [MODIFY] [Dashboard.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/Dashboard.tsx)
- Remove the custom `newOrderCard` button, replace with `<Button variant="primary" size="lg">`.
- TopRow: `Welcome / [Name]` left side. Right side: `<NotificationsPopover />` + `<Button>`.
- Remove search bar from TopRow entirely.
- Import `Button` component.
- Reorder panels to: Return Workflows card | Needs Attention | WhatsApp Intake (role-gated).

#### [MODIFY] [Dashboard.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/Dashboard.module.css)
- `.topRow`: `display: flex; justify-content: space-between; align-items: center`.
- Remove `.metricsRow` grid column that references the welcome block — metrics are now their own row below topRow.
- Add `.metricsRow` as a separate 4-column flex/grid row.
- Add `.panelsGrid`: `display: grid; grid-template-columns: 280px 1fr 1fr` (or `repeat(3, 1fr)`) for the 3-column panels.
- Remove `.newOrderCard` styles.

---

### 5. Return Workflows panel (new design)

#### [MODIFY] [Dashboard.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/Dashboard.tsx)
- Add a `ReturnWorkflowsPanel` inline or as a new section component rendering `returnsWorkflow` stage counts as horizontal list pills.

#### [NEW] `src/pages/Dashboard/sections/ReturnWorkflowsPanel.tsx` + `.module.css`
- Renders a `Card` titled "Return Workflows" with a vertical list of pills.
- Each pill: `count` (bold, main blue when >0) + `label` — single row, left-aligned, slight border.

---

### 6. Needs Attention — borderless items

#### [MODIFY] [AttentionPanel.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/sections/AttentionPanel.module.css)
- `.row`: Remove `border`, `border-radius`, `background`. Keep padding, flexbox, and hover state as subtle background only.

---

### 7. WhatsApp Intake — role gate

#### [MODIFY] [Dashboard.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/Dashboard.tsx)
- Read `useRole()` or `useCan()` to determine `isAdminOrOwner`.
- Conditionally render `<IntakePanel>` only when `isAdminOrOwner`.
- Update `.panelsGrid` to use `grid-template-columns: 280px 1fr` when intake is hidden.

---

## Verification Plan

### Automated Tests
- `npm run build` — TypeScript clean + Vite production bundle.

### Manual Verification
- Sidebar expands/collapses, state persists on page reload.
- Main content area shifts correctly (no overlap, no gap).
- All 5 nav links navigate correctly. Active link highlighted.
- Dashboard TopRow: welcome shows user name, notification bell works, New Order button opens channel select modal.
- 4 metric cards show correct data with range selectors.
- Pipeline pills grid shows 8 stages.
- 3-column panel: Return Workflows pill list | Needs Attention borderless | WhatsApp Intake (hidden for non-admin roles).
- Button `sm`, `md`, `lg` sizes render correctly across variants.
