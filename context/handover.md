# ipp-orderflow — Session Handoff (v5)

Paste this into a new conversation along with the current versions of: `App.tsx` (router), `OrderNew.tsx` + its CSS module, `OrderEdit.tsx` + `OrderEdit.module.css`, `OrderDetail.tsx` + `OrderDetail.module.css`, `Dashboard.tsx`, `Orders.tsx`, `useDashboardCounts.ts`, `ImageDetailsModal.tsx`, `components/AddItemModal/AddItemModal.tsx` + its CSS.

**Project:** `ipp-orderflow` — React + TypeScript + Directus admin panel for Kuda Fellas (`dev-admin.kudafellas.cloud`), an order-pipeline management app (stages: intake → cold → finance → production → packing → finalise → dispatch → delivered, plus outstanding/cancelled/returned side-states). Directus 10.13.0, self-hosted via Docker/PM2 on a VPS, container name `directus_dev`. A custom Directus endpoint extension `order-api` (ported from a prototype's `recognize.js`) provides `/order-api/parse-order` and `/order-api/corrections` for WhatsApp-message → order-draft parsing.

---

## Fully completed (confirmed working, prior sessions)

- **`order_history`/`attachments`/`messages` bigint-as-string bug**: `id` columns are Postgres `bigint`, serialized as strings by Directus; zod schemas had `id: z.number()`, silently failing `safeParse` on every read/write. Fixed with `z.union([z.number(), z.string()]).transform(String)`.
- **History duplication**: `handleSaveAllEdits` had two `appendOrderHistory` calls; removed the old unconditional one.
- **Rich diff-based history text**: `buildEditSummary()` diffs header + line fields + cuts, producing `Edited — Field a→b; ...` or `Order edited (no change)`; `hasEditChanges` disables Save until there's a real diff.
- **`line_cuts` full CRUD**: real `readLineCuts`/`createLineCut`/`updateLineCut`/`deleteLineCut`, wired into load/edit/save/diff.
- **`line_weighings` + `line_weighing_photos` full CRUD**: multi-weighing/multi-photo persistence.
- **Thumbnail hover-trash UX**: shrunk from a full-inset overlay to a small corner badge.
- **Sticky header + sticky side panel jump-at-bottom**: fixed positioning & max-height.

---

## OrderDetail / OrderEdit split — DONE (v4)

- [x] **Standalone `OrderEdit` page**: Extracted edit mode out of `OrderDetail.tsx` into `/orders/:id/edit` (`OrderEdit.tsx` + `OrderEdit.module.css`). Cleanly separates view mode (stepper, weighing, returns, documents, history) from edit mode (header fields, line items, price calculation, cutting instructions).
- [x] **Shared `AddItemModal` integration**: Replaced inline Add Item Modal in `OrderDetail` & `OrderEdit` with shared `components/AddItemModal/AddItemModal.tsx`.
- [x] **Shared `ImageDetailsModal` component**: Extracted image preview overlay into `components/ImageDetailsModal/ImageDetailsModal.tsx` + `ImageDetailsModal.module.css`.

---

## Dashboard, Stage Parity & MetricCards Rework — DONE (v5)

- [x] **Dashboard StagePill Aggregation Fix**: Fixed `useDashboardCounts.ts` to aggregate by `stage` directly from Directus without double-counting status rows. Included parallel Finance Review queue calculation (`stage === 'finance'` OR (`stage === 'cold'` and unpaid)) per prototype domain logic.
- [x] **Dashboard MetricCard Rework**: Standardized the 4 top metric cards:
  1. **Open Orders**: Total active orders across pipeline (`range: 'All'`).
  2. **Total Orders**: Recorded orders in period window (`totalRange`: Today, Week, Month, Year, Date).
  3. **Delivered Orders**: Delivered orders in period window (`deliveredRange`: Today, Week, Month, Year, Date).
  4. **Cancelled Orders**: Cancelled orders in period window (`cancelledRange`: Today, Week, Month, Year, Date).
- [x] **Prototype Stage Parity in Orders Page**: Expanded pipeline stage definitions in `pipeline.ts` and dropdown filter options in `Orders.tsx` to include `outstanding` ("Outstanding"), `awaiting` ("Awaiting stock"), `cancelled` ("Cancelled"), and `returned` ("Returned"). Updated `useOrders.ts` to support filtering by `active`, `pending-docs`, `completed`, `finance`, `cancelled`, and specific stage keys.
- [x] **Dashboard 3-column row height constraint**: Bounded `.panelsGrid` and `.panelsGridTwo` row height to `ReturnWorkflowsPanel` wrapping content height, with `AttentionPanel` & `IntakePanel` adjusting and scrolling internally.
- [x] **Orders page "New Order" flow**: Added "New Order" button to top right of `Orders.tsx`, triggering `ChannelSelectModal` → `IntakeModal` → `/orders/new` navigation flow.

---

## Recurring bug patterns worth remembering for this project

1. Directus serializes Postgres `bigint` columns as strings over JSON. Any zod schema with `id: z.number()` on a `bigint`-backed table silently fails `safeParse`.
2. Directus field metadata `special: [uuid]` mistakenly present on a non-PK column causes Directus to auto-generate a random UUID whenever that field is omitted on create.
3. Cross-page constant/logic drift: unit lists (`UNITS` vs `UNIT_OPTIONS`); customer-matching logic.
4. Directus `aggregate` output formatting varies between string, number, or object `{ '*': number }` — always use `extractCount()` helper to parse.
5. In Directus, `groupBy: ['stage']` and `groupBy: ['status']` queries must NOT be naively merged into a single map iteration, or rows with both fields present will be double-counted.