# IPP-OrderFlow — Project Context (imported from opncd.ai/share/8SxuLQHw)

Imported 2026-07-06 from an OpenCode session (GLM-5.2 / gpt-5.2-codex). This workspace (`d:\Ranto\AI Agents\IPP\IPP-OrderFlow`) is the NEW project being built based on the original prototype. The original prototype codebase lives elsewhere and was read during that session.

## What IPP OrderFlow is
B2B/Horeca order-management app for **PT Inti Pangan Perkasa** (meat & seafood distribution). The original is a frontend-only React prototype (state in localStorage + IndexedDB). The new project rebuilds it on a real backend the user already has deployed.

## The order pipeline (the "brain" = `src/lib/domain.js`)
`intake → cold → finance → production → packing → finalise → dispatch → delivered`
Off-pipeline states: `outstanding`, `awaiting`, `cancelled`, `returned`

- **Intake (Admin)** — WhatsApp-style message parsed by recognizer (`recognize.js` in prototype) matching text to real SKUs. Admin reviews/confirms.
- **Cold Storage (Warehouse)** — pull & catch-weight weigh (kg/loaf), photo proof. Weight lines self-satisfy; counted units (pcs/box/ekor) can be short.
- **Finance (Finance)** — payment gate, runs in parallel with Cold Storage. Approve/Reject.
- **Production** — cut instructions (steak 2cm, vacuum per pcs); marks CUTTING → PACKING → READY.
- **Packing (Warehouse)**
- **Finalise (Admin)** — print DO/SI (Accurate-ready checklist, manual).
- **Dispatch (Courier)** — pickup, deliver, 3 proof photos (condition / received / signed invoice).
- **Delivered**

Return sub-flow: `returned → receive (warehouse weighs back) → settle (admin Accurate doc) → sign (signed DO/SI) → replacement (rejoins pipeline) → close`

## Roles (domain.js)
Owner (god mode), Admin, Warehouse, Production, Finance, Courier.
Permissions = configurable per-role capability matrix (`CAPABILITIES` at domain.js:153). Owner can toggle any capability per role in Settings.

## Discrepancies vs user's original role table
- "Delivery" in table = "Courier" in code (Anton)
- "Job Costing (Retail)" for Production — NOT in prototype
- True "Inventory dashboard" for Warehouse — only partial (cold storage queue, no real inventory mgmt)
- "Upload DO/SI" — prototype has manual Accurate checklist, not actual doc upload
- "Conflict Resolution dashboard" / "WhatsApp edits" — maps to the intake recognizer

## Original prototype tech stack (frontend)
React 18, React Router 6, Vite 5, vite-plugin-pwa, Capacitor 8 (Android APK), lucide-react, plain CSS (no Tailwind, no TypeScript), EN/Bahasa i18n, light/dark theme, localStorage + IndexedDB, BroadcastChannel (same-browser live courier tracking).

## NEW project — user's existing backend (VPS docker-compose, domain *.kudafellas.cloud)
Already deployed and running:
- **Traefik** — reverse proxy, auto-HTTPS via Let's Encrypt
- **Hermes agent** (GPT-4o LLM gateway) — *user said "we don't need hermes at this moment"* → set aside
- **n8n** + its own Postgres — workflow automation; triggered on WhatsApp group messages; shares `directus_uploads` volume
- **Evolution API** + its own Postgres + Redis — WhatsApp integration; webhooks → n8n
- **Business Postgres** (`horeca_orders` db, user `admin`) — the real business database
- **Directus** (prod `admin.kudafellas.cloud` + dev `dev-admin.kudafellas.cloud`) — headless CMS over Postgres: REST/GraphQL API, auth, file storage, role ACLs, realtime

## Stack mapping (prototype SEAM → user's service)
| Prototype gap | User's service | Role |
|---|---|---|
| localStorage → real DB | Postgres horeca_orders | single source of truth |
| API/auth/files/perms/realtime | Directus | replaces Firebase entirely |
| smart-fake recognize.js | n8n + (LLM, Hermes on hold) | WhatsApp → parse → draft order in Directus |
| manual paste WhatsApp text | Evolution API | real group messages trigger flow |
| live.js cross-device courier GPS | Directus realtime | courier pings → office UI subscribes |
| Firebase Hosting/HTTPS | Traefik + Let's Encrypt | already serving TLS |
| proof photos stuck on device | Directus Files (directus_uploads) | visible everywhere |

## New project tech stack (planned)
**Frontend (port from prototype):** React 18 + React Router 6 + Vite 5, vite-plugin-pwa, Capacitor 8, lucide-react, plain CSS, EN/Bahasa, light/dark, `@directus/sdk` (replaces store.jsx localStorage reducer).
**Backend (already running, no new infra):** Postgres horeca_orders, Directus (prod/dev), n8n intake workflow, Evolution API, Traefik.
**Dropped:** Firebase, Cloud Functions, recognize.js smart-fake, live.js BroadcastChannel, manual demo login. Hermes on hold per user.

## Directus schema (current, from user's snapshot — Directus 12.0.2, postgres)
Collections so far (minimal — needs expansion to match prototype shapes):
- `attachments` — id (int PK), message_id (FK→messages.message_id, varchar 255), doc_type (varchar 100), file_path (varchar 500), caption (text), ocr_text (text)
- `messages` — (WhatsApp messages; details not fully captured)
- `orders` — (details not fully captured)

NOTE: The schema snapshot shared was incomplete/early. The collections need to grow to cover: orders, order lines, customers, products, returns, users/roles, proof photos, documents (DO/SI). Mapping to prototype's order/line/customer/product/return shapes was deferred pending the fuller schema.

## Dashboard UI discussion (latest turn)
User shared two screenshots (`dashboard current.png` = original, `dashboard.png` = their redesign). Changes they made: moved navigation to a **top bar**, added a **WhatsApp Intake** panel to monitor group messages.
Feedback given:
- Stage pills should be clickable + role-aware (click → filtered orders for that stage; emphasize only the role's responsible stages)
- WhatsApp Intake should show triage state: Unprocessed / Parsed (needs review) / Linked to order; each card = sender + time + preview + badges (Edited, Has photo, OCR ready, Parsed) + linked order_id
- Unify Notifications vs WhatsApp Intake (Notifications = system events; Intake = inbound messages); make Notifications collapsible if both kept
- "Need approval" → rename to concrete action (Finance approval, Print DO, Delivery proof missing) with counts + top 1-2 items inline
- Keep a high-signal "Needs Attention" list (late deliveries, unpaid due today, missing weigh photo, return pending receive)
- Top bar: one consistent primary CTA location for "New Order"; search should have a scope toggle (Orders vs Messages)
- Open question: is the dashboard optimized for Admin only, or per-role?

## Open items / next steps
- User to share the fuller database schema (the snapshot was minimal: attachments/messages/orders only)
- Decide dashboard role scope (Admin-only vs per-role)
- Hermes explicitly on hold
- No code written yet — user said "don't make any changes yet, I just want you to have context"
