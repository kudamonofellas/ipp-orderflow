# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Stable and complete: token refresh retry flow, Customers and Products CRUD and directory pages, multi-step intake flow (Channel Select -> WhatsApp Intake -> prefilled New Order), corrections upserting, and detailed dossiers (Orders, Customers, Products).

## Current Goal

- Next phase features: Reports page implementation, corrections review admin UI, pipeline stage-transition UI.

## Completed

- **Token longevity, WhatsApp intake flow, Products & Customers CRUD, and Dossiers (2026-07-16):**
  - Token refresh retry flow on Directus 401 API errors (auto refresh with SDK tokens, fallback check on mount).
  - Metrics cards correct calculation (CORS config with headers, cancelled orders mapping to DB boolean `cancelled: true`).
  - Added new pages: `/customers` (clickable paginated search table), `/customers/:id` (credit profile + exposure + order history + create/update), `/products` (paginated active/OOS toggles), `/products/:id` (metadata fields + OOS flag + delete safeguards).
  - WhatsApp Intake Modal: 3-step checkout flow (Horeca select -> WhatsApp text parse API call with `x-internal-token` header -> prefilled `NewOrderModal` review and corrections mapping).
  - Corrections mapping: inline unrecognized line mapping writes to Directus `corrections` for server-side parser training.
  - Order Detail Dossier (`/orders/:id`): progress stepper, client-side order total, print stylesheet, WhatsApp invoice copy builder, and team notes/history logging.
  - Router wiring and navigation links updated in `App.tsx`, `Customers.tsx`, `Products.tsx`, and stylesheets.
  - Compilation is clean (`npm run build` runs successfully).

- **Auth persistence & UI enhancements (2026-07-14):**
  - Token persistence changed from `sessionStorage` to `localStorage` to keep the user logged in until explicit sign-out.
  - Wired `MetricCard` range selection dropdowns with options (Today, This Week, Select Month, Select Year, Select Specific Date) sending queries to parallel backend aggregate endpoints.
  - Gated the "Add New Order" CTA button on the Dashboard so it completely disappears for roles without the `createOrders` capability.
  - Linked Dashboard `StagePill` buttons (both current pipeline and return workflow) to navigate to the Orders registry page with the pre-selected filter applied.
  - Reduced height and added overflow scrollbars to WhatsApp Intake and Needs Attention panels to keep the page structure compact.
  - Updated Orders Page list display to show `orders.order_id` in the ID column and output `"-"` for 0-item entries.
  - Upgraded Stage Selection on the Orders page and order listing header to support styled custom dropdown toggle elements.
  - Added functioning sort buttons/dropdowns in the order table header.
- `src/styles/tokens.css` — full CSS custom property token system (colors, type scale, spacing, radius, shadows, transitions, focus, dark theme overrides) wired into `main.tsx`
- `src/styles/reset.css` — modern CSS reset (box-sizing, margin/padding zero, form font inheritance, focus-visible, reduced-motion scroll, selection color)
- `src/styles/global.css` — base element styles using tokens (body, headings, links, code, form defaults, buttons, tables, scrollbar, `.sr-only` + `.truncate` utilities)
- `main.tsx` — load order set: tokens → reset → global (old `index.css` import removed)
- `context/ui-tokens.md` — quick-reference token lookup for AI sessions
- `context/ui-registry.md` — baseline established via `/imprint audit` (Card, Button, Input, Badge, Nav item, Stage pill, Table, Notification item, Avatar, Modal patterns). **Moved from workspace root → `context/` on 2026-07-07; all context now lives under `context/`.**
- Removed the default Vite scaffold (`src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/hero.png`, `src/assets/react.svg`)
- Installed `react-router-dom` + `lucide-react` (both in the approved stack)
- App shell: `src/App.tsx` (BrowserRouter + routes), `src/layouts/AppLayout/` (TopNav + Outlet), `src/layouts/TopNav/` (sticky top bar)
- Shared components: `Card`, `Button`, `Avatar`, `MetricCard`, `StagePill` (all token-based, CSS Modules)
- **Admin Dashboard** (`src/pages/Dashboard/`): welcome + New Order CTA, 3 metric cards, 2×4 stage-pill grid, WhatsApp Intake panel, Need approval panel, Open Orders table, Notifications column — matches `context/designs/Dashboard.png`
- Dashboard sections in `src/pages/Dashboard/sections/`: `IntakePanel`, `ApprovalPanel`, `OpenOrdersPanel` (notifications moved out — see below)
- **Notifications moved from page column → bell popover** (`src/components/NotificationsPopover/`): toggled from the TopNav bell, closes on outside-click/Escape. Removed the dashboard's right-column `NotificationsPanel` section + the two-column dashboard grid (now single full-width column).
- Route stubs (`src/pages/Placeholder/`) for Orders / Customers / Reports
- Mock view-model data in `src/data/mockDashboard.ts` + types in `src/types/dashboard.ts` (UI-only, to be replaced by Directus reads)
- Brand logo copied to `src/assets/logo.svg` (from `public/IPP Icon.svg`)
- `index.html` title → `IPP-OrderFlow`
- **Directus wiring (first proof-of-wiring, 2026-07-08):**
  - Installed `@directus/sdk` + `zod` (both in the approved stack)
  - `src/lib/directus.ts` — single Directus client wrapper. Static token auth (`VITE_DIRECTUS_TOKEN`) for the first read-only wiring; will be replaced by email/password login flow later. Exposes typed `readOrders()` / `readMessages()` methods returning `{ data, error }` tuples per code-standards.md.
  - `src/lib/schemas.ts` — zod schemas for Directus collection responses (`OrdersCollectionSchema`, `MessagesCollectionSchema`). Boundary validation per code-standards.md.
  - `src/types/directus.ts` — collection types derived from the zod schemas (single source of truth).
  - `src/vite-env.d.ts` — TypeScript types for `VITE_DIRECTUS_URL` + `VITE_DIRECTUS_TOKEN`.
  - `.env` / `.env.example` — Directus URL + static token (gitignored).
  - `src/hooks/useOpenOrders.ts` — first real data hook. Replaces the `openOrders` mock. Fetches `orders` filtered to `status: 'Open'`, sorted by `-order_id`, validated through zod, mapped to the `OpenOrder` view-model.
  - **OpenOrdersPanel** updated: new "Items" column showing item count (`N items`/`N item`) with a chevron arrow toggle to expand/collapse the line-detail sub-row. Orders with 0 items show a disabled "No items" button. Arrow rotates 180° when expanded.
  - VPS Directus CORS configured: `CORS_ENABLED=true`, `CORS_ORIGIN` includes `http://localhost:3001`, `CORS_METHODS=GET,POST,PATCH,DELETE,OPTIONS` (OPTIONS was missing — required for browser preflight).
  - `npm run build` ✓, `npm run lint` ✓, `tsc` clean
- **Dashboard metrics + stage counts wired to real Directus data (2026-07-08):**
  - `aggregateOrders()` added to `src/lib/directus.ts` — uses `@directus/sdk` `aggregate()` for counts (per code-standards.md: never `readItems()` + `.length`).
  - `src/hooks/useDashboardCounts.ts` — single aggregate call grouped by `status`, maps raw DB statuses to the 8 pipeline stages + the 3 metric buckets (Total / Delivered / Returned). Replaces the mock `metrics` + `stageCounts` exports.
  - Dashboard now reads real counts for metric cards + stage pills; only `intakeMessages`, `approvals`, and `notificationGroups` remain mock (they depend on collections not yet in the schema).
- **Open Orders pagination (2026-07-08):** `useOpenOrders` now accepts `page` + returns `total` / `page` / `pageSize` / `setPage`. Page size = 20. Fetches the current page (`limit` + `offset`) and the total count (`aggregate`) in parallel. `OpenOrdersPanel` renders a pagination footer (`1–20 of N`, prev/next buttons, `page / totalPages` indicator).
- **Scrollbar layout-shift fix (2026-07-08):** `scrollbar-gutter: stable` on `html` in `global.css` — reserves space for the scrollbar gutter whether or not it's visible, so the viewport width no longer changes when a scrollbar appears/disappears.
- **Security: `.env.example` sanitized** — the real Directus static token was replaced with a placeholder. `.env` remains gitignored. `docker-compose.txt` uses `${...}` env var placeholders for all secrets (no hardcoded passwords).
- **Dashboard UI refresh from `context/designs/ui-implementation.md` (2026-07-13):**
  - Switched icon system from `lucide-react` to HugeIcons via Iconify (`@iconify/react` + `@iconify-json/hugeicons`) through a centralized `src/components/Icon/` wrapper.
  - Updated light-theme tokens in `src/styles/tokens.css`: page base white, muted gray surfaces (`#f0f5f5`), border gray (`#d6d6d6`), secondary text (`#7c7c7c`), new primary blue (`#0c4458`).
  - TopNav updated: gray navbar background, HugeIcons tabs/search/settings, tab icon size 16px + text size 16px.
  - Metrics row updated: "Add New Order" moved to the row end as a dedicated accent CTA card; metric icon/label/value styles updated to spec (blue accents, 24px icon, 16px medium text for value+label).
  - StagePill redesigned to stacked layout (20px bold count over 14px medium label) with role-stage highlighting in main blue.
  - New stage model added in `src/lib/pipeline.ts`: main pipeline labels (`New Orders` → `Delivered`) + return workflow stages (`Awaiting Return`, `Admin Action Required`, `Awaiting Signed DO/SI`, `Replacement in Transit`), with Admin-highlight stage mapping.
  - "Need approval" replaced by "Need attention" (`AttentionPanel`) and reordered dashboard layout to: attention + WhatsApp intake side-by-side, Open Orders full width below.
  - Open Orders table updated for the new column set (order id, status, order date, delivery date, sales rep, customer, item). Expansion affordance moved to row-start arrow; full row is now clickable to expand.
  - `useDashboardCounts` updated to emit the new stage labels/workflow and map current DB statuses to the updated stage keys.
- **TopNav + Dashboard top-row layout tweak (2026-07-13):**
  - TopNav tabs moved to the horizontal center of the navbar (`.links` now `flex: 1 1 auto` + `justify-content: center`); nav links stretch to the full nav height (`align-items: stretch` + `align-self: stretch`) so the active tab's bottom underline sits flush on the navbar bottom border (`bottom: -1px`).
  - Dashboard top row split into two grid tracks: welcome (160px) | `.metricsRow` (fills remaining). The inter-track gap is `--space-xl` (24px) so the metric cards are no longer flush against the welcome block; the metric cards + "Add New Order" CTA keep a tight `--space-lg` (16px) gap inside `.metricsRow`. Responsive breakpoints (1024px / 640px) updated to match the new structure.
- **Directus auth + Create New Order flow (2026-07-13):**
  - `src/lib/directus.ts` rebuilt on `authentication('json')` + `rest()` (in-memory JWT). New methods: `login()`, `logout()`, `refresh()`, `readMe()`, `hasToken()`, `readCustomers()`, `readProducts()`, `readOrderLines()`, `getNextOrderNo()`, `createOrder()`, `createOrderLines()`, `appendOrderHistory()`, `updateOrder()`. Static-token fallback kept for the migration transition. All return `{ data, error }` tuples + zod validation at the boundary.
  - `src/lib/schemas.ts` + `src/types/directus.ts` extended with zod schemas + types for `CustomersCollection`, `ProductsCollection`, `OrderLinesCollection`, `OrderHistoryCollection`; `OrdersCollectionSchema` extended with the target-schema fields (`no`, `customer_id`, `stage`, `channel`, `sales`, `deliver_at`, `taken_by`, return/payment flags). Legacy fields stay optional so existing reads don't break.
  - `src/lib/domain.ts` — the domain layer. Exports the 6-role `Role` enum, the 14-key `Capability` enum, coded `ALLOW` defaults (Owner always allowed + short-circuited), synchronous `can(role, capability, overrides?)`, `normalizeRole()` that maps Directus role names to the 6-role enum, and async `loadRolePermissions()` that reads `role_permissions` overrides (with coded fallback on error). Every order mutation passes through `can()` before the SDK call (per ai-workflow-rules.md).
  - `src/hooks/auth-context.ts` + `RoleContext.tsx` + `useAuth.ts` — split across three files to satisfy react-refresh/only-export-components. `AuthProvider` holds the signed-in user, normalized role, capability overrides, and a `can()` bound to them. `useAuth()` / `useCan()` / `useRole()` / `useCurrentUserName()` are the consumer hooks. Tokens are persisted in `sessionStorage` (via the SDK's custom storage option) so reloads within the same tab keep the user signed in; closing the tab logs out.
  - `src/pages/Login/` — Directus email/password login page per Card + Input + Button baselines. Routes: `/login`. On success → redirect to `/` (or the page the user came from). Blocks all other routes when unauthenticated via `<ProtectedRoute>` in `App.tsx`.
  - `src/components/NewOrderModal/` — modal form per Modal baseline. Customer picker (loaded via `readCustomers`) + delivery date + sales rep (auto-filled from the signed-in user's name) + notes + dynamic order lines list (each line = product picker OR free-text name + qty + unit). Submit: `can('createOrders')` gate → `getNextOrderNo()` → `createOrder()` → `createOrderLines()` → `appendOrderHistory()`. On success, `useOpenOrders.refetch()` refreshes the Open Orders table so the new row appears. Disabled when the role can't create orders.
  - `useOpenOrders` gained a `refetch()` method (nonce-based) so the dashboard can refresh after a create.
  - `App.tsx` — `AuthProvider` wraps the router; `/login` route + `<ProtectedRoute>` wraps `<AppLayout>`; already-signed-in users hitting `/login` are redirected to `/`.
  - `TopNav` updated to show the real signed-in user (avatar initials + name + role from `useAuth`) instead of the mock `currentUser`; added a sign-out button that calls `logout()` + navigates to `/login`.
  - Seeded 3 test customers + 5 test products on dev Directus so the New Order form has pickable options.
  - `npm run lint` ✓, `tsc -b` clean, `npm run build` ✓. End-to-end verified via API: order + 2 lines (1 with product_id, 1 free-text) + history all created successfully; CASCADE delete confirmed.
- **Auth persistence + Orders page + order_lines expansion (2026-07-14):**
  - **Reload→login fixed**: SDK's `authentication('json')` now uses a `sessionStorage`-backed custom storage (`sessionAuthStorage` in `directus.ts`) instead of the default in-memory storage. Reloads within the same browser tab keep the user signed in; closing the tab clears sessionStorage and logs out. Auth state only — no business data in sessionStorage (architecture.md invariant #2 not violated). `hasToken()` now checks both the SDK's in-memory token + sessionStorage fallback. `logout()` clears sessionStorage explicitly.
  - `RoleContext.tsx` mount effect now calls `rehydrate()` (which calls `readMe()`) when `hasToken()` is true on mount — so a reload rehydrates the user from the SDK's sessionStorage token without requiring a fresh login.
  - **Username sync fixed**: Dashboard welcome section now uses `useCurrentUserName()` (from `useAuth`) instead of the mock `currentUser.name`. TopNav already used it; Dashboard was missed.
  - **order_lines in Open Orders**: `useOpenOrders` now fetches `order_lines` for each page of orders in a single batch query (`filter[order_id][_in]=id1,id2,…`), groups them by `order_id`, and attaches them to each order's `lines` array. The expandable rows in `OpenOrdersPanel` now show each line's name + qty + unit (e.g. "Beef Tenderloin — 2.5 kg"). `OpenOrderLine` type extended with optional `qty` + `unit` fields. The legacy `order_items` text blob parsing is dropped.
  - **Orders page built** (`src/pages/Orders/`): full order management page with working stage filter dropdown (All stages + 8 pipeline stages + 4 return stages) + search input (searches by order number, legacy order_id, or customer_name). Uses new `useOrders` hook (`src/hooks/useOrders.ts`) — accepts `stageFilter` + `search` params, builds Directus filter with `_or` for stage/status fallback + `_and` for search, fetches orders + order_lines in batch, same expandable-row pattern as the dashboard's OpenOrdersPanel. All props wired to OpenOrdersPanel (loading, error, total, page, pageSize, onPageChange). Clean CSS modules (no inline styles, no raw class names). Page resets to 1 on filter/search change (via event handlers, not effects).
  - `npm run lint` ✓, `tsc -b` clean, `npm run build` ✓.

## In Progress

- None

## Next Up

- Migrate dashboard reads (`useOpenOrders`, `useDashboardCounts`) from legacy `status` field to the canonical `stage` enum (separate unit per ai-workflow-rules.md — schema-migration + UI migration, not combined with the create-order feature).
- Wire remaining Dashboard panels to Directus: `intakeMessages` → `readMessages('messages')`, `attentionItems` + `notificationGroups` (depend on `order_history` collection — now exists on dev).
- Pipeline stage-transition UI: advance an order through the 8 stages (each stage gated by `can()` for the role that owns it).
- Returns sub-flow UI.
- Owner Settings page: toggle `role_permissions` per role (the `loadRolePermissions()` + `can()` machinery is in place; the UI is the next unit).
- i18n layer (`src/i18n/`) — Dashboard + Login + NewOrderModal strings are currently literals and must move to EN/Bahasa keys.

## Open Questions

- Dashboard role scope: Admin-only default view vs per-role default view (from `project-overview.md`) — the auth + role context now makes per-role scoping possible; decision still open.
- Whether to add Zustand for cross-component state or rely on React Context (from `code-standards.md`) — currently using React Context for auth/role; no need for Zustand yet.
- Order number generation: client-side sequential (`getNextOrderNo`) works but has a race window on concurrent creates. A Directus flow / server-side sequence is a later hardening.
- Static-token fallback in `directus.ts`: remove once all read paths migrate to the authenticated client.

## Architecture Decisions

- **Design tokens live in `src/styles/tokens.css`** — single CSS file with all custom properties, sourced from `context/ui-context.md`. Dark theme via `[data-theme="dark"]` selector on `:root`. No Tailwind, no CSS-in-JS.
- **`context/ui-registry.md`** — the imprint skill's consistency registry. Baseline established 2026-07-07 before any component was built; moved from the workspace root into `context/` the same day so all context sources live in one folder. Derived from the dashboard design spec.
- **Dashboard is UI-first with mock data** — built the full Admin Dashboard shell against `Dashboard.png` using in-memory mock view-models (`src/data/mockDashboard.ts`), deferring Directus wiring to a schema-first unit per `ai-workflow-rules.md`. No localStorage/IndexedDB — mock data is transient and not a source of truth.
- **Open decision resolved for now: Dashboard defaults to the Admin view.** The role-scoped dashboard question remains open for other roles.
- **`context/ui-tokens.md`** — AI-facing quick reference, not the source of truth. `ui-context.md` wins on conflicts.

## Session Notes

- The default Vite scaffold (`App.tsx`, `App.css`, `index.css`) still uses hardcoded purple (`#aa3bff`) and will be replaced when the first real component is built. Do not patch it.
- `tokens.css` is imported before `index.css` in `main.tsx` so tokens are available globally.
