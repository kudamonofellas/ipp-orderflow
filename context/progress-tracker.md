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
- `npm run build` ✓, `npm run lint` ✓, `tsc` clean

## In Progress

- None

## Next Up

- Wire the Dashboard to Directus: create the pipeline collections (schema-first per workflow rules), then replace `mockDashboard.ts` with `@directus/sdk` reads (`aggregate()` for metrics/stage counts, `readItems()` for lists)
- Build the domain layer (`src/lib/domain.ts`) with the pipeline enum + `can()` capability matrix before any order mutation UI
- Add the Directus client wrapper (`src/lib/directus.ts`) + zod validation at the boundary
- Login page + Directus auth (route stub not yet added)
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
