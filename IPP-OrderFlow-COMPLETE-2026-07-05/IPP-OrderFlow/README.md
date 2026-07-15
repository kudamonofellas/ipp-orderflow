# IPP OrderFlow — B2B (Horeca) order management

A responsive, offline-first order-management web app for **PT Inti Pangan Perkasa**'s
Horeca / B2B channel (meat & seafood distribution). Built with **React + Vite**, plain
CSS, no backend. The whole flow runs in the browser using mock data and a rule-based
"smart-fake" intake recognizer, so anyone can try the complete pipeline with zero setup.

---

## Quick start

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org)). Then:

```bash
npm install      # one time — downloads dependencies (needs internet)
npm run dev      # starts the app
```

Open **http://localhost:5173** — it should open automatically.

> **Windows shortcut:** double-click **`Start IPP OrderFlow.bat`**. On the first run it
> installs dependencies for you, then launches the app. Keep that window open while using
> it; close it to stop.

Other commands:

```bash
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

---

## Demo logins (no password)

On the login screen, click any account — **the role decides what you see**:

| User    | Role       | Lands on                                   |
|---------|------------|--------------------------------------------|
| Teza    | Admin      | New order + all orders                      |
| Budi    | Warehouse  | Cold Storage queue (pull & weigh)           |
| Nando   | Production | Production queue (cut)                       |
| Sari    | Finance    | Finance gate (sees price)                    |
| Anton   | Courier    | Ready-to-deliver pool + live location        |
| Winata  | Owner      | Control tower — sees & overrides everything  |

---

## How to test it

Everything is seeded with sample customers, products and orders, so you can click straight
through. A good end-to-end run:

1. **Create an order** — log in as **Teza (Admin)** → *New order* → pick a channel → paste a
   rough WhatsApp-style order into the intake box (e.g. `2) En Dining` / `1 loaf A5 striploin`
   / `5 kg lamb brisket`). The recognizer matches each line to a real SKU; review and confirm.
2. **Walk the pipeline** — open the order and advance it as each role:
   **Cold Storage** (weigh) → **Finance** (clear payment) → **Production** (cut, if any) →
   **Packing** → **Finalise** (Accurate checklist) → **Dispatch** (courier delivers, takes the
   3 proof photos incl. the signed invoice).
3. **Try a partial / "nyusul"** — send part now, keep the rest outstanding, then finish or
   create a backorder.
4. **Try a return** — from a delivered/dispatch order, refuse some or all. Watch the return
   flow: **Warehouse weighs it back in → Admin settles the Accurate document → resend a
   replacement or close**. (Returns are catch-weight: a returned loaf is re-weighed for the kg.)
5. **Reports & export** — *Reports* has month / custom-range pickers; *Orders* and *Reports*
   can export CSV. Order detail has a Print → Save-as-PDF.
6. **Reset anytime** — *Settings → Reset demo data* wipes the browser data back to the seed.

Data lives in your **browser** (localStorage + IndexedDB for photos) — nothing leaves the
machine, and each browser/device is its own independent copy.

---

## How to edit it

- **No build step to learn** — `npm run dev` hot-reloads on save.
- The code is plain **JSX + CSS** (no TypeScript, no Tailwind). Start here:

```
src/
  screens/      one file per page — Login, Home, Orders, OrderDetail (the pipeline),
                OrderEdit, Intake, Reports, Customers, Settings, …
  components/   Layout (responsive nav), OrderList, ui (shared widgets), Logo, UpdateBanner
  lib/
    store.jsx     app state + the seed data (React Context + useReducer, persisted)
    domain.js     stages, roles & permissions, units, the pipeline rules  ← the "brain"
    recognize.js  the smart-fake intake parser (swap for real AI later)
    i18n.js       English ⇄ Bahasa strings
    reports.js / export.js / backup.js / photos.js / geo.js / live.js / img.js / format.js
  data/         products.js (real catalog), customers.js (sample)
  index.css     the whole design system (CSS variables, light/dark)
public/         logo + PWA assets
scripts/        gen_products.py — regenerate the catalog from an Accurate export
```

Common edits:
- **Change the catalog** → edit `src/data/products.js`, or re-run `python scripts/gen_products.py`
  against a fresh Accurate "Item List" export.
- **Change pipeline rules / who can do what** → `src/lib/domain.js`.
- **Change colours / spacing / theme** → CSS variables at the top of `src/index.css`.
- **Add a translation** → add the key to `src/lib/i18n.js`.

After changing data shapes, do **Settings → Reset demo data** so the new seed loads.

---

## What's real vs mock (and how to go live)

This is a working front-end prototype. Three things are intentionally simulated and are the
"connect the backend" steps:

- **Intake AI is a smart fake** (`src/lib/recognize.js`) — deterministic keyword/alias matching
  against the catalog, plus a learn-from-corrections memory. To go live, replace it with a real
  **Claude API** call from a small backend (keep the API key server-side, never in the browser).
- **No database** — state is in `localStorage`, so it's single-device. Swap `src/lib/store.jsx`
  for a database + API to get multi-user, real-time sync.
- **Accurate stays manual** — the app shows an Accurate-ready checklist; the office keys the
  invoice in and prints the DO / SI / faktur. The app does not post to Accurate.
- **Live courier tracking** works across browser tabs today (BroadcastChannel). Cross-device
  (office PC ↔ driver's phone) needs a realtime backend — the hook points are marked `SEAM` in
  `src/lib/live.js` (drop in Firebase Realtime DB / Supabase). Login passwords + hosting (HTTPS)
  also come with that backend.

There is **no pricing engine** — a price only shows if the order/PO stated one; everything else
is invoiced in Accurate.

---

## Tech

React 18 · React Router 6 · Vite 5 · vite-plugin-pwa · lucide-react icons · plain CSS.
Installable PWA, offline app shell, light/dark, English/Bahasa, responsive (desktop sidebar /
mobile bottom-nav).

## License / use

Internal prototype for PT Inti Pangan Perkasa. Share within the team to try, test, and extend.
