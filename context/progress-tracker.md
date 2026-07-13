# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- In progress — app shell + Admin Dashboard

## Current Goal

- Ship the Admin Dashboard UI (matching `context/designs/Dashboard.png`) on top of the design-system foundation, then wire it to Directus in a later unit

## Completed

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

## In Progress

- None

## Next Up

- **Schema rebuild on dev (2026-07-10):** Directus downgraded to 10.13.x on `directus-dev` (no user limit — 12.x enforces a 3-user cap even self-hosted). `horeca_orders_dev` wiped. New from-scratch setup guide at `context/schema/fresh-schema-setup.md` supersedes `directus-schema-checklist.md` (which assumed collections already existed) and the incremental `2026-07-09-complete-schema.sql` migration. Follow it to create all 18 collections + 31 relations + 6 roles + ACLs on dev first, then repeat on prod.
- Wire remaining Dashboard panels to Directus: `intakeMessages` → `readMessages('messages')`, `approvals` + `notificationGroups` (depend on `order_history` collection which doesn't exist yet — schema-first per workflow rules)
- Build the domain layer (`src/lib/domain.ts`) with the pipeline enum + `can()` capability matrix before any order mutation UI
- Login page + Directus auth (replace the static token with email/password login flow → JWT)
- i18n layer (`src/i18n/`) — Dashboard strings are currently literals and must move to EN/Bahasa keys

## Open Questions

- Dashboard role scope: Admin-only default view vs per-role default view (from `project-overview.md`)
- Whether to add Zustand for cross-component state or rely on React Context (from `code-standards.md`)

## Architecture Decisions

- **Design tokens live in `src/styles/tokens.css`** — single CSS file with all custom properties, sourced from `context/ui-context.md`. Dark theme via `[data-theme="dark"]` selector on `:root`. No Tailwind, no CSS-in-JS.
- **`context/ui-registry.md`** — the imprint skill's consistency registry. Baseline established 2026-07-07 before any component was built; moved from the workspace root into `context/` the same day so all context sources live in one folder. Derived from the dashboard design spec.
- **Dashboard is UI-first with mock data** — built the full Admin Dashboard shell against `Dashboard.png` using in-memory mock view-models (`src/data/mockDashboard.ts`), deferring Directus wiring to a schema-first unit per `ai-workflow-rules.md`. No localStorage/IndexedDB — mock data is transient and not a source of truth.
- **Open decision resolved for now: Dashboard defaults to the Admin view.** The role-scoped dashboard question remains open for other roles.
- **`context/ui-tokens.md`** — AI-facing quick reference, not the source of truth. `ui-context.md` wins on conflicts.

## Session Notes

- The default Vite scaffold (`App.tsx`, `App.css`, `index.css`) still uses hardcoded purple (`#aa3bff`) and will be replaced when the first real component is built. Do not patch it.
- `tokens.css` is imported before `index.css` in `main.tsx` so tokens are available globally.
