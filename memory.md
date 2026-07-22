# Memory — OrderDetails Page Enhancement

Last updated: 2026-07-22T16:54 WIB

## What was built

**OrderDetail Page Overhaul** — complete rebuild of `src/pages/OrderDetail/OrderDetail.tsx` (1463 lines) and full replacement of `src/pages/OrderDetail/OrderDetail.module.css` (520 lines).

**New Directus helpers added to `src/lib/directus.ts`:**
- `deleteAttachment(id)` — deletes an attachment by ID
- `createOrderLine(input)` — creates a new order line
- `deleteOrderLine(id)` — deletes an order line by string ID

**`src/components/Icon/Icon.tsx` updated:**
- Added `style?: React.CSSProperties` prop and forwarded to Iconify

**`src/components/Icon/icons.ts` updated:**
- Added `camera`, `scissors`, `scale`, `document`, `save` icon mappings

## Features implemented

1. **Weighing Lines & Photo Attachments** — Loaf/kg/gram items show inline weighing rows with weight input, camera upload, `+ Add weighing` tertiary button, and trash per row. Uploaded photos appear as thumbnails in a row below the item.
2. **Thumbnail hover-to-delete & click-to-view** — hovering a thumbnail shows a translucent trash overlay; clicking opens a full Image Detail Modal overlay.
3. **Image Detail Modal** — fixed position overlay (backdrop blur) showing the full image, `Delete Image` button (removes from state + Directus) and `Close` button.
4. **Collapsible Right Side Panel** — `isPanelOpen` state toggles layout between 2-column (main + 340px panel) and full-width 1-column. Chevron button in header triggers it.
5. **Notes & History Panel** — Notes filtered from history (those starting with "Note:"), reverse-chronological History list, and a textarea + "Add" form for team notes.
6. **Documents Card** — Logs `DO`/`SI`/`Return Note`/`PO`/`Other` document entries with number, optional file thumbnail, note text, and delete. Add-doc form has type selector, number input, note input, file upload, and submit.
7. **Edit Mode** — `Edit` button switches all customer fields (Name combobox via `<datalist>`, Delivery Date, Order Date, Sales Rep, Contact) and item lines to inline inputs. `Copy WA` and `Print` disabled while editing. Clicking `Save` writes all changes to Directus and appends audit history.
8. **Edit Items List** — Per-line: unit `<select>`, product catalog `<input list="...">`, delete item button, per-cut editing (`+ Add cutting`, text input, trash). Price input with line total calc. `+ Add Item` full-width button.
9. **Stage Flow** — Advance / Send Back / Cancel / Hold / Restore actions wired to correct capabilities, buttons disabled while actioning.
10. **Copy WA** — Generates Indonesian-language order confirmation string and copies to clipboard.

## Decisions made

- **Local weighing state** — weighing lines and item photos are held in React state (`weighingsMap`, `itemPhotosMap`). They are seeded from the order line's `weight` field on load, but new photo uploads go via `uploadFile()` → `itemPhotosMap` (not persisted to `attachments` collection automatically on upload — they only persist if a formal `createAttachment` call is made). This is intentional for now to keep the UX fast.
- **Thumbnails not auto-saved** — photos captured via the camera icon are stored as URL strings in state. They are not saved to the DB immediately. If persistence is needed, a "Save weighings" action or an auto-save should be added.
- **`isWeighedItem`** — determined by checking `line.unit === 'Loaf' || 'kg' || 'gram'`. Add `ekor` or other catch-weight units if needed.
- **Cutting instructions** — are stored in local `editLines[].cuts[]` in edit mode. They are not yet mapped to a DB column (there is no `cut_instructions` in the schema). This is a placeholder; either a JSON column needs to be added to `order_lines`, or a separate table.
- **`docSelect` class** — used inline `styles.docSelect` in the `<select>` for the doc type, but the style is `editInput` compatible.

## Problems solved

- TypeScript TS18047 "order is possibly null" — fixed by adding `!order` guard at the top of `handleRestore` and `copyWA`.
- `Icon` component did not accept `style` prop — added `style?: React.CSSProperties` to `IconProps` and forwarded it.
- Duplicate `aria-hidden` attribute in `Icon.tsx` (left by the edit tool) — removed.
- `doc.id` is `number | null | undefined` — fixed by using `doc.id ?? undefined` in the `setActiveImageModal` call and `doc.id != null &&` guard on the delete click handler.
- `useCurrentUserName` imported but unused — removed from import.

## Current state

- ✅ TypeScript (`npx tsc --noEmit`) — 0 errors
- ✅ Production build (`npm run build`) — succeeds, 454 kB JS bundle
- ✅ All planned features from the implementation plan are implemented
- ⚠️ Cutting instructions are NOT persisted to DB (no `cut_instructions` column exists in the schema)
- ⚠️ New weighing photo uploads are held in local state only — not auto-saved to the `attachments` table
- ℹ️ Manual testing on a running Directus instance is still needed

## Next session starts with

**Manual testing** — run `npm run dev`, open an order, and test:
1. Edit mode (Edit → Save flow, comboboxes, add/delete line)
2. Weighing lines: add weighing, upload photo, hover trash, click open modal, delete from modal
3. Documents: add a doc with file + note, delete doc, thumbnail preview
4. Side panel collapse/expand

Then address: whether to persist cutting instructions (add a JSON column or separate table?) and whether weighing photos should auto-save on upload or require an explicit action.

## Open questions

1. **Cutting instructions persistence** — should `cut_instructions` be a `json` column on `order_lines`, or a separate `order_line_cuts` join table? No DB column exists yet.
2. **Weighing photo auto-save** — should uploading a camera photo immediately create an `attachments` record, or should it wait for a "Save" action?
3. **`weigh_photo` column on `order_lines`** — the schema has `weigh_photo`. Should this be used to save the last weighing photo ID directly on the line, or only the `attachments` table?
4. **`docSelect` CSS class** — a dedicated `.docSelect` class (120px fixed width) exists in the old CSS but was removed. May need reinstatement if the doc type dropdown is too wide.
