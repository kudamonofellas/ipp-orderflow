# Implementation Plan — Customers Page, Products Page, Channel Selection, WhatsApp Intake, Token Fix, and Metrics

## Background

This plan covers 5 separate features requested in one session:
1. **Customers Page** — implement it (currently a Placeholder)
2. **Products Page** — new page + add to navbar tab with `hugeicons:package`
3. **Channel Selection + WhatsApp Intake Flow** — multi-step "Add New Order" flow with channel picker → intake paste form → auto-populate the existing modal
4. **Expired Token Fix** — diagnose and fix the silent auth token expiry issue
5. **Metrics Card Real Data** — fix the filter logic to match real DB schema field: `cancelled` boolean column instead of a status string

---

## Open Questions / Discussion

> [!IMPORTANT]
> **WhatsApp Intake: `recognize.js` vs. AI approach**
>
> The prototype's `recognize.js` is a **pure regex + token-matching** parser that lives 100% in the frontend. It works offline and with no API cost. The project-overview.md says the production plan is to use **n8n + Evolution API** to parse inbound WhatsApp messages automatically, but that is for incoming messages, not manually-pasted ones.
>
> **For the manual intake form** (admin pastes a message), we have three options:
>
> **Option A — Port `recognize.js` directly (Recommended for now)**
> - Convert the 319-line `recognize.js` from the prototype to TypeScript
> - Run it on the frontend like the prototype does — no AI cost, works offline
> - Proven: it already handles Indonesian + English mixed messages, recognizes quantities, units, delivery dates, customer names, and product token matching
> - Limitation: product matching depends on having the product catalog in memory
>
> **Option B — Gemini API for parsing**
> - Send the pasted message to Gemini/Claude API via Directus n8n webhook
> - The LLM outputs structured JSON (customer name, lines, date, etc.)
> - Pros: much better accuracy for messy/unusual messages
> - Cons: network required, API cost, latency (~1-2s), requires n8n webhook setup
>
> **Option C — Hybrid: regex pre-parse + optional AI fallback**
> - Use `recognize.js` logic for fast pre-fill
> - Add an "AI Enhance" button to send to the LLM for refinement
> - Best UX but most complex to build
>
> **My recommendation: Option A for Phase 1.** Port recognize.js to TypeScript since it is already proven in the prototype and requires zero infrastructure changes. We can add AI enhancement as Phase 2 once n8n is wired up. Please confirm before I proceed.

---

## User Review Required

> [!WARNING]
> **Database field for "cancelled" metric**: The `orders` schema has a boolean `cancelled` field. The current code queries by `status = 'Cancelled'` which may not match. I will change the cancelled metric to filter `{ cancelled: { _eq: true } }`.

> [!WARNING]
> **Total Orders metric**: The current code uses a date-range filter applied to `order_date`. Per user request, "total orders" = total **open** orders (not filtered by date). I will change total orders to filter by stage being in the active pipeline (not delivered, not cancelled), OR simply use no date filter and return all orders that are not cancelled/delivered. Please confirm: should "Total Orders" on the metric card = count of all currently active pipeline orders (regardless of date), or count of orders created today/this-week depending on the range toggle?

> [!NOTE]
> **Database environment**: We are using `horeca_orders_dev` for development (the Directus URL `dev-admin.kudafellas.cloud`). The project-overview.md and context files reference `horeca_orders` (production). I will update the context files to note `horeca_orders_dev` as the current dev database.

---

## Proposed Changes

### 1. Token Expiry Fix

**Root cause identified**: The `RoleContext.tsx` rehydrate flow calls `readMe()` on mount but if the access token is expired and the SDK fails to auto-refresh (e.g., refresh token is also expired), `readMe()` returns an error and the user is silently logged out. However, the `hasToken()` check looks at `localStorage` for a stored token — it doesn't check expiry. So the user appears to have a token but `readMe()` fails with 401.

**Fix**: Add token expiry check in `hasToken()` + auto-refresh attempt in the `init()` flow in `RoleContext.tsx`. When `readMe()` fails, attempt `refresh()` first, then retry `readMe()`. If refresh also fails, clear storage and go to login.

#### [MODIFY] [directus.ts](file:///d:/IPP/IPP-OrderFlow/src/lib/directus.ts)
- Update `hasToken()` to also check `expires_at` in localStorage — if the token is past expiry, return `false` so the user goes to login cleanly instead of failing mid-flight.

#### [MODIFY] [RoleContext.tsx](file:///d:/IPP/IPP-OrderFlow/src/hooks/RoleContext.tsx)
- In the `init()` function, if `readMe()` fails, attempt `refresh()` first, then retry `readMe()`. If that still fails, call `clearAuthStorage()` and `setLoading(false)` so the `ProtectedRoute` redirects to `/login`.

---

### 2. Metrics Card Real Data Fix

#### [MODIFY] [useDashboardCounts.ts](file:///d:/IPP/IPP-OrderFlow/src/hooks/useDashboardCounts.ts)
- **Total Orders**: Change to count orders where `cancelled` is not `true` AND `stage` is not `delivered` — i.e., currently active pipeline orders. (Or — per range selector: orders created in the selected date range that are in any active stage.) Keep the date range filter.
- **Delivered Orders**: Change filter from `status = 'Delivered'` to `stage = 'delivered'` (or `status = 'Delivered'` — check which column has the value). Also add the date filter on `deliver_at` instead of `order_date` (delivered orders have a delivery date).
- **Returned Orders**: Change filter to `stage` being one of the return workflow stages: `awaiting_return`, `admin_action`, `awaiting_signed_doc`, `replacement_transit`, or `status = 'Returned'`.
- **Cancelled Orders**: Change filter from `status = 'Cancelled'` to `cancelled: { _eq: true }` to use the boolean column.

---

### 3. Customers Page

#### [NEW] [Customers.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Customers/Customers.tsx)
- Search + filter bar at top
- Paginated list of customers from `readCustomers()`
- Each row: Avatar with initials, customer name, company, area, contact, `pay_timing · pay_method` badge, order count badge
- Role-gated: Owner/Admin can see "New Customer" button (future — just show it, disable for now with a tooltip)
- Loading + error states

#### [NEW] [Customers.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/Customers/Customers.module.css)
- CSS Modules using design tokens only

#### [MODIFY] [App.tsx](file:///d:/IPP/IPP-OrderFlow/src/App.tsx)
- Import `Customers` and replace the Placeholder at `/customers`

---

### 4. Products Page + Navbar Tab

#### [NEW] [Products.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Products/Products.tsx)
- Search bar + category filter
- Paginated grid/list of products from `readProducts()`
- Each row: product name, accurate_name, category, origin/grade badges, catch_weight badge, active/inactive badge
- Role-gated: Warehouse/Admin/Owner can toggle "out of stock" flag (future — show placeholder)

#### [NEW] [Products.module.css](file:///d:/IPP/IPP-OrderFlow/src/pages/Products/Products.module.css)

#### [MODIFY] [icons.ts](file:///d:/IPP/IPP-OrderFlow/src/components/Icon/icons.ts)
- Add `products: 'hugeicons:package'`

#### [MODIFY] [TopNav.tsx](file:///d:/IPP/IPP-OrderFlow/src/layouts/TopNav/TopNav.tsx)
- Add `{ to: '/products', label: 'Products', icon: 'products' }` to `NAV_ITEMS`

#### [MODIFY] [App.tsx](file:///d:/IPP/IPP-OrderFlow/src/App.tsx)
- Add route `/products` → `<Products />`

---

### 5. Channel Selection + WhatsApp Intake Flow

The "New Order" CTA currently opens `NewOrderModal` directly. We need to insert a multi-step flow:

**Step 1: Channel Selection modal** (similar to prototype's ChannelSelect screen)
- Two option cards: Horeca (B2B) → proceeds to Step 2; Meatfellas (B2C) → disabled with "Soon" badge
- Rendered as a modal overlay, not a full page (matches existing modal pattern)

**Step 2: WhatsApp Intake modal** (for Horeca channel)
- Textarea to paste the WhatsApp message
- "Attach PO" file button (stores file locally as a File object reference — backend upload is a later phase)
- Parse button runs the ported `recognize.js` logic against the product catalog
- On "Next" → pre-fills `NewOrderModal` with parsed data and opens it

The existing `NewOrderModal` will receive an optional `prefill` prop with parsed data.

#### [NEW] [src/lib/recognize.ts](file:///d:/IPP/IPP-OrderFlow/src/lib/recognize.ts)
- TypeScript port of the prototype's `recognize.js` (319 lines)
- Exports: `parseOrder()`, `recognizeItem()`, `matchCustomer()`, `learnCorrection()`
- Uses the products from Directus (passed in as param — no local state)
- Uses a localStorage key for learned corrections (same as prototype)

#### [NEW] [ChannelSelectModal.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/ChannelSelectModal/ChannelSelectModal.tsx)
- Modal overlay with two channel cards
- Horeca card → `onSelectHoreca()` callback
- Meatfellas card → disabled with "Soon" badge, no action

#### [NEW] [ChannelSelectModal.module.css](file:///d:/IPP/IPP-OrderFlow/src/components/ChannelSelectModal/ChannelSelectModal.module.css)

#### [NEW] [IntakeModal.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/IntakeModal/IntakeModal.tsx)
- Modal overlay with textarea for WhatsApp paste
- File attach button (PDF or image — stored in state as a File object)
- "Next →" button runs `parseOrder()` and calls `onParsed(parsedData)` 
- Loading state during parse (near-instant since it's pure JS)

#### [NEW] [IntakeModal.module.css](file:///d:/IPP/IPP-OrderFlow/src/components/IntakeModal/IntakeModal.module.css)

#### [MODIFY] [NewOrderModal.tsx](file:///d:/IPP/IPP-OrderFlow/src/components/NewOrderModal/NewOrderModal.tsx)
- Add optional `prefill` prop with shape:
  ```typescript
  interface OrderPrefill {
    customerName?: string;
    deliverAt?: string;
    sales?: string;
    notes?: string;
    lines?: LineDraft[];
  }
  ```
- On mount (when `open` + `prefill`), pre-populate form state with prefill values

#### [MODIFY] [Dashboard.tsx](file:///d:/IPP/IPP-OrderFlow/src/pages/Dashboard/Dashboard.tsx)
- Replace direct `NewOrderModal` open with a `step` state machine:
  - `null` → nothing open
  - `'channel'` → `ChannelSelectModal` open
  - `'intake'` → `IntakeModal` open (after Horeca selected)
  - `'order'` → `NewOrderModal` open (with prefill after intake)
- "Add New Order" button sets step to `'channel'`

---

### 6. Context Files Update

#### [MODIFY] [context/project-overview.md](file:///d:/IPP/IPP-OrderFlow/context/project-overview.md)
- Note that we are in development phase using `horeca_orders_dev` database

#### [MODIFY] [context/progress-tracker.md](file:///d:/IPP/IPP-OrderFlow/context/progress-tracker.md)
- Update current phase and add new completed items after implementation

#### [MODIFY] [context/ui-registry.md](file:///d:/IPP/IPP-OrderFlow/context/ui-registry.md)
- Add new UI patterns: ChannelSelectModal, IntakeModal, Customers/Products pages

---

## Verification Plan

### Automated Tests
```bash
npm run lint
npm run build
```

### Manual Verification
1. Sign in → verify token refresh doesn't randomly log you out
2. Dashboard metrics show real counts from DB
3. Click "Add New Order" → Channel Selection modal opens
4. Click Horeca → Intake modal opens with textarea and attach button
5. Paste a WhatsApp message → parse → New Order modal opens pre-filled
6. Click Meatfellas → "Soon" shown, nothing navigates
7. Navigate to /customers → Customers page shows customer list
8. Navigate to /products → Products page shows product list
9. Products tab appears in TopNav
