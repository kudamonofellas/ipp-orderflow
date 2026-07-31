# ipp-orderflow — Session Handoff (v2)

Paste this into a new conversation along with the current versions of: `App.tsx` (router), `OrderNew.tsx` + its CSS module, `OrderDetail.tsx` + `OrderDetail.module.css`, `Dashboard.tsx`, `IntakeModal.tsx`, `lib/directus.ts`, `lib/schemas.ts`, `lib/customerMatch.ts`, `types/directus.ts`, `snapshot.json`, `components/AddItemModal/AddItemModal.tsx` + its CSS. (Also useful if referenced again: prototype files `Dev-OrderDetail.jsx`, `Dev-Home.jsx`, `Dev-Intake.jsx`, `recognize.js`, and the `order-api` Directus extension `index.js`.)

**Project:** `ipp-orderflow` — React + TypeScript + Directus admin panel for Kuda Fellas (`dev-admin.kudafellas.cloud`), an order-pipeline management app (stages: intake → cold → finance → production → packing → finalise → dispatch → delivered, plus outstanding/cancelled/returned side-states). Directus 10.13.0, self-hosted via Docker/PM2 on a VPS, container name `directus_dev`. A custom Directus endpoint extension `order-api` (ported from a prototype's `recognize.js`) provides `/order-api/parse-order` and `/order-api/corrections` for WhatsApp-message → order-draft parsing.

---

## Fully completed (confirmed working, prior sessions)

- **`order_history`/`attachments`/`messages` bigint-as-string bug**: `id` columns are Postgres `bigint`, serialized as strings by Directus; zod schemas had `id: z.number()`, silently failing `safeParse` on every read/write. Fixed with `z.union([z.number(), z.string()]).transform(String)`.
- **History duplication**: `handleSaveAllEdits` had two `appendOrderHistory` calls; removed the old unconditional one.
- **Rich diff-based history text**: `buildEditSummary()` diffs header + line fields + cuts, producing `Edited — Field a→b; ...` or `Order edited (no change)`; `hasEditChanges` disables Save until there's a real diff.
- **`line_cuts` full CRUD**: was a hardcoded UI stub, now real `readLineCuts`/`createLineCut`/`updateLineCut`/`deleteLineCut`, wired into load/edit/save/diff.
- **`line_weighings` + `line_weighing_photos` full CRUD**: multi-weighing/multi-photo persistence (previously fake, local-state-only with a hardcoded `'2.01'` stub). Write-on-blur/discrete-action pattern (not per-keystroke).
- **`INVALID_FOREIGN_KEY` on `line_weighings.photo_id`**: root cause was Directus field-metadata `special: [uuid]` mistakenly set on a non-PK column (only meant for auto-generated PKs) — auto-generates a random UUID on create when the field is omitted, which then fails FK validation. Fixed via `PATCH /fields/line_weighings/photo_id` (and `.line_id`) with `{"meta": {"special": null}}`. Confirmed NOT present on `line_weighing_photos` (its fields have `meta: null` — never opened in Admin UI, so never got the flag).
- **Broken thumbnails (403 on `/assets/<id>`)**: `<img>` tags send no `Authorization` header, so asset requests hit the Public role, not the logged-in role. Fixed via `getAccessTokenSync()` + `getAssetUrl(fileId)` appending `?access_token=...` to the URL.
- **Thumbnail hover-trash UX**: shrunk from a full-inset overlay to a small corner badge; `@media (hover: none)` keeps it always visible on touch devices.
- **Sticky header + sticky side panel jump-at-bottom**: header got `position: sticky; top: 0`; side panel given both `top` and `bottom` sticky offsets plus `max-height` instead of fixed `height`.
- **`products` schema/query mismatch**: `products` has no `active`/`created_at`/`updated_at` columns — real names are `oos` (inverted), `date_created`, `date_updated`. Fixed schema + all queries (`filter: { oos: { _neq: true } }`).
- **Parsing/autofill contract mismatch**: `parseOrderText()` claimed a flat `customerId`/`productId`/`name` shape but `order-api` actually returns nested `customer: {...}`/`product: {...}` objects. Fixed with a normalization step inside `parseOrderText()`, including the previously-dropped `company` field.

## New-Order feature parity with prototype — DONE (all 4 original checklist items + page conversion)

- [x] **1. New-customer creation path** — free-text customer name + `<datalist>` autocomplete, plus Phone/Address fields. `lib/customerMatch.ts` ports `matchCustomer()` verbatim (exact/phone/fuzzy/new/none). Only `exact` silently reuses; `phone`/`fuzzy` create new (avoids silent merge into a possibly-wrong record). Also fixed `CreateOrderInput` never sending `customer_name`/`customer_contact`/`customer_address`.
- [x] **2. `rawText`/`attachments` wiring** — flows through to order creation (attachments uploaded as PO documents post-creation).
- [x] **3. `customerMatch`/`dateGuessed`/`multiCustomer` banners** — fuzzy/phone/exact/new-customer, dateGuessed warning (cleared on manual edit), multiCustomer warning.
- [x] **4. Company field** — `ParsedOrderDraft`/`parseOrderText()` + `CreateOrderInput.customer_legal_name` (kept separate from customer's own `company_name`). Only sets a NEW customer's `company_name` on creation, doesn't overwrite existing.

**Architecture decisions confirmed intentional:** server-side `getNextOrderNo()` kept over prototype's original client-guessed scheme (see below — this is now being reworked, see "In progress" section); selective merge-checkbox UI for existing-customer field differences explicitly deferred, not built.

### Modal to Page conversion (done)
Step 3 of "Add New Order" converted from modal (`NewOrderModal`) to a full page styled like `OrderDetail`'s edit mode (sticky header, side panel). Renamed `NewOrderModal` to `OrderNew` (`OrderNew.tsx`), route `/orders/new` added in `App.tsx` (before `/orders/:id`). `Dashboard.tsx`'s `handleParsed` now does `navigate('/orders/new', { state: { prefill, rawText, attachments } })`. Side panel shows the original pasted WhatsApp message (+ attachments) instead of Notes/History. After creation, navigates to `/orders/{newOrderId}`. Old `NewOrderModal`/`.module.css` are dead code, safe to delete once confirmed.

### Bugs found/fixed during the page conversion
- **`Order no.` field**: was a literal copy-paste of the Customer field (same state/handler) — being reworked further, see below.
- **Collapsing side panel**: ported `isPanelOpen` state + toggle button + `.layoutGridFull`/`.panelToggleBtn`/`.sidePanelStickyContentCollapsed` CSS from `OrderDetail_module.css` (confirmed identical tokens).
- **Add Item modal extracted into a shared component** — `components/AddItemModal/AddItemModal.tsx` + `.module.css`. Owns its own internal state, only returns a generic `{qty, unit, name, productId}` via `onConfirm` — callers own their own line-draft shape. Takes `unitOptions` as a required prop (no hardcoded default) since `OrderNew`'s `UNITS` are lowercase while `OrderDetail`'s `UNIT_OPTIONS` are Title-Case — resolves matched units case-insensitively against whatever list the caller passes.

**Not yet confirmed by user at last handoff:** whether `App.tsx`'s import/route correctly points at `OrderNew` post-rename (suspected cause of an earlier "clicking through intake does nothing" symptom); the three fixes above untested at last check-in.

## IN PROGRESS (this round): Order number format rework + related fixes

Discovered while comparing against the prototype (`Dev-Intake.jsx` / `recognize.js`):

- [ ] **Status chip beside line items** — prototype shows a chip (`recognized`/`probable`/`unrecognized`, or a "learned" indicator if matched via a saved correction) next to each parsed line. `OrderNew`'s `LineDraft` already carries `parseStatus` but nothing renders it. Needs: `learned: boolean` added to `ParsedOrderLine`/`parseOrderText()` normalization (currently dropped, same class of gap as `company` was); a chip rendered in the line row (needs a 7th grid column added to `.lineRow`); new `.statusChip[data-status]` CSS variants.
- [ ] **Order no. should be editable with live gap/duplicate detection** — prototype allows editing the autofilled order number, with a banner along the lines of: "The next open queue number is #X, but you entered #Y — typo, or keep it?", plus a one-click fix, and separate duplicate/bad-format warnings. Currently `OrderNew`'s field is read-only-preview only (a decision made before this requirement was known) — needs reverting to editable + adding the gap-detection banners.
- [ ] **Order number format change** — target format is YYMMDD plus a 3-digit sequence, no separator (e.g. 260730005), derived from the delivery date (not creation date/year), gap-filling (lowest free sequence, not just max+1) — ported from the prototype's dateCode/nextFreeFor logic but adapted to query Directus server-side rather than requiring the full order list in memory like the prototype does. This is a breaking change to `getNextOrderNo()`'s signature (now takes a dateCode string param instead of none) — all call sites need updating. New helper file planned: `lib/orderNo.ts` (`dateCode()`, `parseOrderNo()`, `buildOrderNo()`).
- [ ] **Notes autofill bug** — `OrderNew` currently does `if (prefill.ref) setNotes(prefill.ref)`. `ref` is NOT a notes field — it's the WhatsApp message's own queue reference number (e.g. a "14) ..." line), meant to feed the order-number computation directly (prototype overrides auto-sequencing when present), not to populate Notes at all. Prototype always inits notes empty — notes are purely manual/admin-typed, never auto-filled. Fix: remove the bad ref-to-notes mapping entirely; wire ref into the order-no seeding logic instead (ties directly into the item above).

These four items are tightly coupled — the order-no rework naturally resolves the notes bug as a byproduct, since fixing where `ref` is actually supposed to go is the same fix.

---

## Next round (scoped, not started): OrderDetail / OrderEdit split

**Motivation:** `OrderDetail.tsx` holds view mode, edit mode, weighing/photo capture, returns, documents, and notes/history all in one component; `isEditing` toggles between two largely-disjoint render trees within the same mounted component, so every edit-state update re-renders the entire tree (stepper, history, notes included) even though those don't need to re-render mid-edit. Believed to be a real contributing cause of noticed slowness, not just a style preference — prototype already uses a separate edit page, matching the NewOrder-to-page conversion pattern already completed.

**Planned split:** `/orders/:id` (view: stage actions, weighing, returns, documents, notes/history) plus `/orders/:id/edit` (header fields + line items + cuts).

**Known trade-off to resolve when scoping:** `handleSaveAllEdits`/`buildEditSummary`/cuts-diffing all currently read `lines`/`lineCutsByLine` (the view's loaded state) to diff against. A separate edit page needs its own copy. Leaning toward re-fetch-on-mount (simpler, one extra round-trip) over passing state through router state/context (faster but more fragile, and this exact save/diff logic has already produced several subtle bugs — an extra data-passing mechanism seems riskier than the round-trip it'd save).

**Also part of this round:** migrate `OrderDetail.tsx`'s inline Add Item modal (state: `isAddItemModalOpen`, `addItemText`, `matchedItem`; functions: `parseFreeTextLine`, `handleMatchItem`, `handleConfirmAddMatchedItem`, `closeAddItemModal`) to use the shared `AddItemModal` component — delete the inline version, pass `unitOptions={UNIT_OPTIONS}`, `onConfirm` builds an `EditableLine` instead of `OrderNew`'s `LineDraft`.

---

## Recurring bug patterns worth remembering for this project

1. Directus serializes Postgres `bigint` columns as strings over JSON. Any zod schema with `id: z.number()` on a `bigint`-backed table silently fails `safeParse` on every read/write — a 200-but-broken experience. Hit on `order_history`, `attachments`; flagged (not necessarily fixed) on `messages`.
2. Directus field metadata `special: [uuid]` mistakenly present on a non-PK column (typically introduced by opening/editing that field once in the Admin UI) causes Directus to auto-generate a random UUID whenever that field is omitted on create — a foreign-key error blaming a field the client never sent, only on create. Check `snapshot.json`'s `meta.special` if this recurs.
3. Cross-page constant/logic drift: more than one place defines "the" unit list (`OrderNew`'s lowercase `UNITS` vs. `OrderDetail`'s Title-Case `UNIT_OPTIONS`); customer-matching logic has been hand-copied across `recognize.js` to `order-api/index.js` to `lib/customerMatch.ts` rather than sharing one source; order-number logic is being ported a similar way from prototype `format.js`/`Intake.jsx` now. Worth a dedicated consolidation pass at some point.
4. Prefill fields get misread if not checked against what the prototype actually did with them — e.g. `ref` was assumed to mean "reference note" and wired into Notes, when it actually feeds the order-number computation. When porting a prefill field from the parser, trace its actual usage in the prototype rather than inferring from the field name alone.
