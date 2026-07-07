# Code Standards

## General

- Keep modules small and single-purpose — one file, one responsibility.
- Fix root causes, do not layer workarounds. If a bug exists in the pipeline logic, fix the pipeline, not the caller.
- Do not mix unrelated concerns in one component or route — a component that renders an order card should not also fetch notifications.
- The frontend talks to Directus only. Never import Postgres, n8n, or Evolution API clients into `src/`.
- No localStorage or IndexedDB as a source of truth. Directus is the single source of truth; the frontend may cache for offline-tolerance but never as the canonical store.
- Every order mutation must go through the domain layer (`can()` capability check) before hitting Directus. Do not bypass the capability matrix with direct SDK writes from UI components.
- Pipeline stage names are an enum, not free text. Use the constants from the domain layer (`intake`, `cold`, `finance`, `production`, `packing`, `finalise`, `dispatch`, `delivered`, `outstanding`, `awaiting`, `cancelled`, `returned`).
- No destructive filesystem operations outside `IPP-OrderFlow/`. (See `/memories/destructive-commands.md`.)

## TypeScript

- Strict mode is required throughout the project (`"strict": true` in `tsconfig.app.json`).
- Avoid `any` — use explicit interfaces or narrowly scoped types. If a type is genuinely unknown at a boundary, use `unknown` and narrow it.
- Validate unknown external input at system boundaries (Directus API responses, n8n webhook payloads) before trusting it. Use a schema validator (zod) at the Directus SDK boundary.
- Prefer `interface` for object shapes that may be extended, `type` for unions and intersections.
- All Directus collection shapes get a TypeScript interface in `src/types/` mirroring the target schema in `context/schema/target-db-schema.md`.
- No `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why.
- Enable `noUncheckedIndexedAccess` if feasible — array access returns `T | undefined`.

## React + Vite

- Function components only. No class components.
- Hooks are prefixed with `use` and live in `src/hooks/`. Custom hooks must be pure (no side effects outside of effects).
- `use client` is not needed (Vite SPA, not Next.js). All components are client-side by default.
- Keep components under ~300 lines. Extract sub-components when a file grows beyond that.
- Props are typed with an explicit `interface FooProps` — no inline `React.FC` generics.
- State that crosses multiple components lives in a context or a lightweight store (e.g. Zustand), not prop-drilled more than 2 levels.
- Effects (`useEffect`) must have a cleanup function if they subscribe to anything (Directus realtime, event listeners).
- Route components live in `src/pages/`. Shared UI lives in `src/components/`. Layout wrappers live in `src/layouts/`.

## Directus SDK

- All Directus calls go through a thin client wrapper in `src/lib/directus.ts` — never call `createDirectus()` ad-hoc in a component.
- Use `@directus/sdk` typed schema: register the collection shapes so the SDK auto-completes field names.
- Read operations use `aggregate()` for counts (dashboard metrics) and `readItems()` for lists. Never fetch an entire collection without a `limit` and `fields` selector.
- Write operations go through the domain layer first (`can()` check), then the SDK.
- Realtime subscriptions use `client.realtime.subscribe()` and are cleaned up in the effect that created them.
- File uploads use `client.request(uploadFiles())` — never base64-encode a photo into a JSON field.
- Pagination is cursor-based for infinite lists, offset-based for tables with known counts.

## Styling

- Use CSS custom property tokens from `ui-context.md` — no hardcoded hex values anywhere.
- Plain CSS (CSS Modules or global CSS). No Tailwind, no CSS-in-JS.
- Follow the border radius scale in `ui-context.md` (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`).
- Follow the spacing scale (`--space-xs` through `--space-3xl`). No magic pixel values.
- Follow the type scale. No inline `style={{ fontSize: ... }}`.
- Light theme is the default. Dark theme overrides use `[data-theme="dark"]` selector on `:root`.
- Responsive: use the breakpoints in `ui-context.md`. Mobile-first — base styles target `sm`, `min-width` queries scale up.
- Icons from `lucide-react` only. No emoji as UI icons.

## API / Data Access

- The frontend never validates request input at an API boundary — Directus does that. But it does validate Directus responses (zod) before rendering.
- Enforce the capability matrix (`can()`) before any order mutation, even if Directus ACLs would also block it. Defense in depth.
- Return consistent shapes from the Directus client wrapper: `{ data, error }` tuples, never throw raw SDK errors into components.
- Never trust `order.status` as a free string — coerce through the pipeline enum.
- Prices do not live in the frontend. `order_lines.price` is a PO-stated snapshot only; the Accurate price is never duplicated.

## Data and Storage

- Business data belongs in Postgres `horeca_orders` via Directus. No JSON blobs as pseudo-tables (the old `orders.order_items` text field is an anti-pattern being replaced by `order_lines`).
- Photos and files belong in Directus Files (`directus_files`), referenced by UUID. Never store base64 in a text column.
- The `role_permissions` collection is the source of truth for capability overrides; the coded defaults in `domain.js` are the fallback when a row is absent.
- `order_history` is append-only. Never UPDATE or DELETE a row in it.
- `courier_locations` is ephemeral — upsert on ping, do not append a row per GPS update.
- Settings is a singleton (`id = 1`). Never INSERT a second row.

## i18n

- All user-facing strings go through the i18n layer (`src/i18n/`). No hardcoded English or Bahasa in components.
- Keys are namespaced by feature (`orders.create`, `dashboard.metrics.total`).
- EN and Bahasa translations are peers — neither is the "default" that the other is translated from.
- Dates and numbers use `Intl.DateTimeFormat` / `Intl.NumberFormat` with the user's locale, not manual formatting.

## File Organization

- `src/components/` — Reusable UI components (Button, Card, Badge, Avatar, etc.). Each component in its own folder with `.tsx` + `.module.css`.
- `src/pages/` — Route-level components (Dashboard, Orders, Customers, Settings, Login). One folder per route.
- `src/layouts/` — Layout wrappers (TopNav, AuthLayout).
- `src/lib/` — Infrastructure: `directus.ts` (SDK client), `domain.ts` (pipeline + capabilities), `format.ts` (order numbers, dates), `live.ts` (realtime subscriptions).
- `src/hooks/` — Custom React hooks (`useOrders`, `useRealtime`, `useCapabilities`, `useTheme`).
- `src/types/` — TypeScript interfaces mirroring the Directus collections (`Order`, `OrderLine`, `Customer`, `Product`, `Message`, `Attachment`, etc.).
- `src/i18n/` — Translations (`en.json`, `id.json`) + the i18n setup.
- `src/styles/` — Global CSS. Load order in `main.tsx`: `tokens.css` (design tokens / CSS custom properties) → `reset.css` (structural reset, no tokens) → `global.css` (element styles using tokens). Component-specific styles use CSS Modules.
- `src/assets/` — Static assets (logo, fonts, images).
- `context/` — Project documentation (overview, architecture, schema, ui-context, code-standards). Not shipped.
- `context/schema/` — Schema snapshots (`snapshot.json` = current Directus, `target-db-schema.md` = full target).
- `context/designs/` — UI mockups and screenshots.
- `.agents/memories/` — Imported session notes + project context. Not shipped.
