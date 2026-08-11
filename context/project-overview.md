# IPP-OrderFlow

## Overview

IPP-OrderFlow is a B2B / Horeca order-management application for **PT Inti Pangan Perkasa**, a meat & seafood distribution company. It tracks every customer order from creation through cold-storage weighing, finance approval, production (cutting/packing), document finalisation (Delivery Order / Sales Invoice), courier dispatch, and delivery confirmation — including a returns sub-flow. The app replaces a frontend-only React prototype (which stored everything in localStorage / IndexedDB) with a production build on the company's existing backend stack: Postgres, Directus, n8n, Evolution API, and Traefik. It serves six roles — Owner, Admin, Warehouse, Production, Finance, and Courier — each with a configurable capability matrix.

## Goals

1. **Replace the prototype's local-only storage with a real backend** — all orders, customers, products, returns, proof photos, and documents persist in Postgres (`horeca_orders`) via Directus, visible across devices and roles in realtime.
2. **Give every role a focused, role-aware workspace** — each role sees the stages it is responsible for (e.g. Warehouse sees Cold Storage + Packing, Finance sees the approval gate, Courier sees dispatch + delivery proof), with a configurable capability matrix the Owner can tune.
3. **Ship a responsive web app first, APK later** — Phase 1 is a responsive web app that works well on phone browsers (installable as a PWA). The Capacitor Android APK is a later phase but remains a goal. Live courier GPS tracking uses Directus realtime (replacing the prototype's same-browser BroadcastChannel hack).
4. **Keep the existing infrastructure untouched** — no Firebase, no new servers; the app runs on the already-deployed `*.kudafellas.cloud` stack.

## Core User Flow

1. **Intake** — Admin fills the "New Order" form from scratch: customer, product lines, quantities, and price. A free-text line matcher (paste a line, match it against the product catalog) speeds up manual entry but there is no automated order-parsing/messaging intake anymore — that feature (in-app WhatsApp-message paste + parsing, and an automated Evolution API → n8n → Directus draft-order pipeline) was removed from the frontend on 2026-08-11 (see `progress-tracker.md`). Admin reviews the resulting lines before the order enters the pipeline.
2. **Cold Storage (Warehouse)** — Warehouse staff pull the order, perform pull & catch-weight weighing (kg/loaf), and attach photo proof. Weight lines self-satisfy; counted units (pcs/box/ekor) may be short.
3. **Finance (parallel to Cold Storage)** — Finance reviews the order and Approves or Rejects it. This gate runs in parallel with Cold Storage.
4. **Production** — Production receives cut instructions (e.g. steak 2cm, vacuum per pcs) and marks the order CUTTING → PACKING → READY.
5. **Packing (Warehouse)** — Warehouse packs the prepared items.
6. **Finalise (Admin)** — Admin prints the Delivery Order / Sales Invoice (Accurate-ready checklist, manual) and prepares the order for dispatch.
7. **Dispatch (Courier)** — Courier picks up the order, delivers it, and uploads 3 proof photos (item condition / received / signed invoice).
8. **Delivered** — Order is marked delivered and closed.

**Returns sub-flow:** `returned → receive (warehouse weighs back) → settle (admin Accurate doc) → sign (signed DO/SI) → replacement (rejoins pipeline) → close`

## Features

### Order Creation

- **Admin manually creates a new order in-app** — a "New Order" CTA opens a form to enter customer, product lines, and quantities directly.
- **Free-text line matcher** (`AddItemModal`) — Admin can paste/type a single line (e.g. `"udang 5kg"`) and it's matched against the Directus `products` table to speed up filling a line; this is local, per-line matching only, not an order-level parsing/intake pipeline.
- **Removed (2026-08-11)**: the in-app "paste a raw WhatsApp order message and auto-fill the whole form" flow, the automated Evolution API → n8n → Directus draft-order pipeline and its dashboard triage panel, and the per-team "learned corrections" matching memory. See `progress-tracker.md` for the removal entry and `architecture.md` for the resulting backend-orphan note (n8n/Evolution API may still write to the `messages` table; nothing in the frontend reads it anymore).

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

- Collapsible left Sidebar navigation (built 2026-07-20 — replaced the earlier horizontal top-bar nav entirely, not just a redesign-in-progress)
- Notifications bell popover (built — replaced the earlier page-column "panel" concept; toggled from the Sidebar/TopNav bell, closes on outside-click/Escape, unread-count badge + mark-as-read)
- "Needs Attention" high-signal list: late deliveries, unpaid due today, missing weigh photo, return pending receive
- Concrete action items: Finance approval, Print DO, Delivery proof missing — with counts + top 1-2 items inline
- Consistent primary CTA location for "New Order"

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
- Directus `products` table (migrated from prototype's `data/products.js`)
- **Admin manual order creation in-app** ("New Order" CTA + form, with a per-line free-text matcher against the product catalog)
- Order pipeline UI for all 8 stages + returns sub-flow
- Role-based access with configurable capability matrix
- Dashboard redesign (Sidebar nav, Needs Attention)
- Responsive, mobile-friendly web app + PWA installable (Phase 1)
- EN/Bahasa i18n, light/dark theme
- Live courier GPS tracking via Directus realtime
- Proof photos in Directus Files

### Out of Scope

- Firebase (entirely dropped — replaced by Directus + Postgres)
- Cloud Functions
- WhatsApp-message-based order intake — both the in-app copy-paste-and-parse flow and the automated Evolution API → n8n → Directus draft pipeline, plus the per-team "learned corrections" matching memory, were built and then fully removed from the frontend on 2026-08-11 (see `progress-tracker.md`). The `AddItemModal` free-text line matcher (local, per-line, no messaging involved) is kept.
- Prototype's `live.js` BroadcastChannel same-browser tracking (replaced by Directus realtime)
- Manual demo login (replaced by Directus auth)
- Full inventory management for Warehouse (only cold storage queue in v1)
- Actual DO/SI document upload (manual Accurate checklist only in v1)
- Job Costing (Retail) for Production (not in prototype; deferred)
- **Capacitor Android APK** (later phase — not in Phase 1, but remains a goal)

## Success Criteria

1. A signed-in Admin can create an order manually (customer, product lines, quantities, price — with the free-text line matcher speeding up product entry) and confirm it into the pipeline. The order then progresses through all 8 stages to `delivered` with every role's action recorded in Postgres.
2. A Warehouse user can weigh an order (pull & catch-weight), attach a photo proof, and the weight line self-satisfies while counted-unit lines correctly allow shortages.
3. A Finance user can approve or reject an order at the finance gate, with the gate running in parallel to Cold Storage.
4. A Courier can pick up, deliver, and upload 3 proof photos, and the office dashboard sees the courier's GPS position update in realtime via Directus subscriptions.
5. The Owner can toggle capabilities per role in Settings, and every other role's dashboard immediately reflects only the stages and actions it is permitted to see.
6. The app is a responsive web app that works well on a phone browser and is installable as a PWA, with EN/Bahasa toggle and light/dark theme both working. (The Capacitor Android APK is a later phase and not required for this success criterion.)
7. All data persists in Postgres `horeca_orders` via Directus — no localStorage or IndexedDB as source of truth — and is visible across devices and roles.
