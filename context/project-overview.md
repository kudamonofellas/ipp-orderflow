# IPP-OrderFlow

## Overview

IPP-OrderFlow is a B2B / Horeca order-management application for **PT Inti Pangan Perkasa**, a meat & seafood distribution company. It tracks every customer order from WhatsApp intake through cold-storage weighing, finance approval, production (cutting/packing), document finalisation (Delivery Order / Sales Invoice), courier dispatch, and delivery confirmation — including a returns sub-flow. The app replaces a frontend-only React prototype (which stored everything in localStorage / IndexedDB) with a production build on the company's existing backend stack: Postgres, Directus, n8n, Evolution API, and Traefik. It serves six roles — Owner, Admin, Warehouse, Production, Finance, and Courier — each with a configurable capability matrix.

## Goals

1. **Replace the prototype's local-only storage with a real backend** — all orders, customers, products, returns, proof photos, and documents persist in Postgres (`horeca_orders`) via Directus, visible across devices and roles in realtime.
2. **Automate WhatsApp intake, keep manual paste** — orders can be created two ways: (a) Admin pastes a raw WhatsApp order message into the app and the form auto-fills, or (b) inbound messages from the customer WhatsApp group (via Evolution API → n8n) are parsed into draft orders in Directus automatically. Both paths share one parsing service (a production port of the prototype's `recognize.js` logic) so matching behavior is identical regardless of entry point — see "Message Parsing" under Features.
3. **Give every role a focused, role-aware workspace** — each role sees the stages it is responsible for (e.g. Warehouse sees Cold Storage + Packing, Finance sees the approval gate, Courier sees dispatch + delivery proof), with a configurable capability matrix the Owner can tune.
4. **Ship a responsive web app first, APK later** — Phase 1 is a responsive web app that works well on phone browsers (installable as a PWA). The Capacitor Android APK is a later phase but remains a goal. Live courier GPS tracking uses Directus realtime (replacing the prototype's same-browser BroadcastChannel hack).
5. **Keep the existing infrastructure untouched** — no Firebase, no new servers; the app runs on the already-deployed `*.kudafellas.cloud` stack.

## Core User Flow

1. **Intake** — an order reaches the pipeline one of three ways:
   - **Manual paste**: Admin copies a WhatsApp order message and pastes it into the app; the parsing service returns a draft and the form auto-fills for review.
   - **Automated WhatsApp**: a customer sends an order in the WhatsApp group. Evolution API forwards the message to n8n, which calls the same parsing service and writes a draft order straight into Directus, surfaced in the WhatsApp Intake panel.
   - **Manual entry**: Admin fills the "New Order" form from scratch, bypassing parsing entirely.

   In every path, Admin reviews the resulting lines — confirming, correcting, or manually picking a product for any line the parser couldn't match — before the order enters the pipeline.
2. **Cold Storage (Warehouse)** — Warehouse staff pull the order, perform pull & catch-weight weighing (kg/loaf), and attach photo proof. Weight lines self-satisfy; counted units (pcs/box/ekor) may be short.
3. **Finance (parallel to Cold Storage)** — Finance reviews the order and Approves or Rejects it. This gate runs in parallel with Cold Storage.
4. **Production** — Production receives cut instructions (e.g. steak 2cm, vacuum per pcs) and marks the order CUTTING → PACKING → READY.
5. **Packing (Warehouse)** — Warehouse packs the prepared items.
6. **Finalise (Admin)** — Admin prints the Delivery Order / Sales Invoice (Accurate-ready checklist, manual) and prepares the order for dispatch.
7. **Dispatch (Courier)** — Courier picks up the order, delivers it, and uploads 3 proof photos (item condition / received / signed invoice).
8. **Delivered** — Order is marked delivered and closed.

**Returns sub-flow:** `returned → receive (warehouse weighs back) → settle (admin Accurate doc) → sign (signed DO/SI) → replacement (rejoins pipeline) → close`

## Features

### Intake & Messaging

- **Two parsed-entry paths, one parsing service:**
  - **Copy-paste (Admin, in-app)** — Admin pastes a raw order message (WhatsApp text, note, etc.) into the app; the form auto-fills from the parsed draft, same UX as the prototype's `Intake.jsx` flow.
  - **Automated WhatsApp** — inbound messages from the customer WhatsApp group (via Evolution API → n8n) are parsed into draft orders written directly into Directus, no manual paste needed.
  - Both paths call the same **parsing service** (a server-side port of the prototype's `recognize.js` — product/customer name matching, quantity/unit/price/cut extraction, delivery-date detection) so recognition behavior is consistent regardless of entry point. See "Message Parsing" below for how it works.
- WhatsApp Intake dashboard panel with triage state: Unprocessed / Parsed (needs review) / Linked to order
- Per-message cards: sender, time, preview, badges (Edited, Has photo, OCR ready, Parsed), linked `order_id`
- Attachments collection: photos, OCR text, captions, linked to messages
- **Admin can manually create a new order in-app** — a "New Order" CTA in the top bar opens a form to enter customer, product lines, and quantities directly, bypassing parsing entirely when needed

### Message Parsing

- A shared **parsing service** (n8n workflow or Node function on the existing stack) is called by both the in-app copy-paste flow and the n8n WhatsApp automation — one implementation, not two.
- Input: raw text (+ optional language hint). Output: a structured draft — customer match, delivery date, payment method, and item lines (each with matched `productId`, qty, unit, price, cut instructions, and a match status).
- **Product/customer matching** — Products live in a Directus `products` table (fields include `accurateName`, grade, brand, form, origin, etc.); customer matching runs name/phone/fuzzy-token tiers against the Directus `customers` table.
- **Match status per line** — `recognized` / `probable` / `unrecognized`, shown as a colored badge in the review UI. Unrecognized or low-confidence lines require Admin to manually pick the product before confirming.
- **Learned corrections** — when Admin manually assigns a product to a line the parser missed, the correction is saved to a Directus `corrections` table (raw-text-tokens → productId), replacing the prototype's per-device `localStorage` memory so corrections apply for every user, every device, going forward.
- **Fallback matching (future/optional)** — lines that remain `unrecognized` after rule-based matching may be passed to the Claude API with the product catalog as context, as a secondary matching pass before falling back to a fully manual pick.

### Order Pipeline

- 8-stage pipeline: `intake → cold → finance → production → packing → finalise → dispatch → delivered`
- Off-pipeline states: `outstanding`, `awaiting`, `cancelled`, `returned`
- Stage pills on the dashboard are clickable + role-aware (click → filtered orders for that stage; only the role's responsible stages are emphasised)
- Parallel gates (Finance runs alongside Cold Storage)
- Returns sub-flow with weigh-back, Accurate settlement, signed DO/SI, and replacement re-entry

### Role-Based Access

- Six roles: Owner (god mode), Admin, Warehouse, Production, Finance, Courier
- Configurable capability matrix per role (`CAPABILITIES` in the domain layer)
- Owner can toggle any capability per role in Settings
- Role-aware dashboard scope (open decision: Admin-only vs per-role default view)

### Warehouse & Cold Storage

- Pull & catch-weight weighing (kg/loaf) with photo proof
- Weight lines self-satisfy; counted units (pcs/box/ekor) can be short
- Packing queue for Warehouse
- Partial inventory visibility (cold storage queue; full inventory management is out of scope for v1)

### Finance

- Payment approval gate (Approve / Reject)
- Runs in parallel with Cold Storage
- "Need approval" surfaced as concrete action items on the dashboard

### Production

- Cut instructions (e.g. steak 2cm, vacuum per pcs)
- Status progression: CUTTING → PACKING → READY
- Job Costing (Retail) — noted in user's role table but NOT in prototype; deferred

### Dispatch & Delivery

- Courier pickup and delivery
- 3 proof photos required: item condition / received / signed invoice
- Live courier GPS tracking via Directus realtime (replaces BroadcastChannel same-browser hack)
- Cross-device tracking (office UI subscribes to courier pings)

### Documents

- Delivery Order / Sales Invoice generation (Accurate-ready checklist, manual)
- Proof photos stored in Directus Files (`directus_uploads`), visible across devices
- Manual Accurate checklist (actual DO/SI document upload is out of scope for v1)

### Dashboard & Notifications

- Top-bar navigation (redesign in progress)
- WhatsApp Intake panel (triage state per message)
- Notifications panel (system events; collapsible if both Intake + Notifications shown)
- "Needs Attention" high-signal list: late deliveries, unpaid due today, missing weigh photo, return pending receive
- Concrete action items: Finance approval, Print DO, Delivery proof missing — with counts + top 1-2 items inline
- Consistent primary CTA location for "New Order"
- Search with scope toggle (Orders vs Messages)

### Platform & i18n

- Responsive web app (mobile-first, works well on phone browsers) — Phase 1
- PWA installable (vite-plugin-pwa) — Phase 1
- Android APK via Capacitor 8 — later phase, but kept as a goal
- EN / Bahasa Indonesia i18n
- Light / dark theme
- Served over HTTPS via Traefik + Let's Encrypt

## Scope

### In Scope

- React 18 + React Router 6 + Vite 5 frontend, ported from the prototype
- `@directus/sdk` integration replacing the prototype's localStorage reducer
- WhatsApp intake automation via Evolution API → n8n → Directus
- **Shared parsing service** (production port of prototype's `recognize.js`) called by both the in-app copy-paste flow and the n8n WhatsApp flow
- Directus `products` table (migrated from prototype's `data/products.js`) and `corrections` table (replaces prototype's per-device `localStorage` learned corrections)
- **Admin manual order creation in-app** ("New Order" CTA + form)
- **Admin copy-paste order creation in-app** (paste raw text → auto-filled draft via the parsing service, reviewed before confirming)
- Order pipeline UI for all 8 stages + returns sub-flow
- Role-based access with configurable capability matrix
- Dashboard redesign (top-bar nav, WhatsApp Intake, Needs Attention)
- Responsive, mobile-friendly web app + PWA installable (Phase 1)
- EN/Bahasa i18n, light/dark theme
- Live courier GPS tracking via Directus realtime
- Proof photos in Directus Files

### Out of Scope

- Firebase (entirely dropped — replaced by Directus + Postgres)
- Cloud Functions
- Prototype's `recognize.js` as a **client-side, localStorage-backed** parser — the matching logic itself is kept and ported server-side into the shared parsing service (see Message Parsing); only the old implementation (browser-only, per-device corrections) is dropped, not the copy-paste feature
- Prototype's `live.js` BroadcastChannel same-browser tracking (replaced by Directus realtime)
- Manual demo login (replaced by Directus auth)
- Full inventory management for Warehouse (only cold storage queue in v1)
- Actual DO/SI document upload (manual Accurate checklist only in v1)
- Job Costing (Retail) for Production (not in prototype; deferred)
- **Capacitor Android APK** (later phase — not in Phase 1, but remains a goal)

## Success Criteria

1. A signed-in Admin can create an order via either parsed path — pasting a WhatsApp message in-app, or receiving one automatically through the Evolution API → n8n flow — review the parsed draft (correcting any unrecognized lines), and confirm it into the pipeline. The order then progresses through all 8 stages to `delivered` with every role's action recorded in Postgres, and any manual product correction is saved for future parses.
2. A Warehouse user can weigh an order (pull & catch-weight), attach a photo proof, and the weight line self-satisfies while counted-unit lines correctly allow shortages.
3. A Finance user can approve or reject an order at the finance gate, with the gate running in parallel to Cold Storage.
4. A Courier can pick up, deliver, and upload 3 proof photos, and the office dashboard sees the courier's GPS position update in realtime via Directus subscriptions.
5. The Owner can toggle capabilities per role in Settings, and every other role's dashboard immediately reflects only the stages and actions it is permitted to see.
6. The app is a responsive web app that works well on a phone browser and is installable as a PWA, with EN/Bahasa toggle and light/dark theme both working. (The Capacitor Android APK is a later phase and not required for this success criterion.)
7. All data persists in Postgres `horeca_orders` via Directus — no localStorage or IndexedDB as source of truth — and is visible across devices and roles.
