# IPP OrderFlow — Prototype Audit

**Subject:** the `Dev-*` prototype (React + Vite + localStorage PWA)
**Purpose:** ground-truth reference for the `ipp-orderflow` TypeScript/Directus port, plus a prioritised defect list.
**Audit date:** 2026-08-06
**Files reviewed:** all 39 `Dev-*` files (5,918 lines). Nothing was inferred — every claim below cites `file:line`.
**Update 2026-08-06 (1):** `OrderDetail.tsx` price/contact gating fixed (new `seeCustomerContact` capability + existing `seePrices` now checked) — see the Enforcement row in §10.1, the F-09 row in §10.2, and the revised checklist rows in §10.3.
**Update 2026-08-06 (2):** `ROLE_FOCUS: Record<Role, Stage[]>` built in `src/lib/pipeline.ts`, replacing the flat `ADMIN_HIGHLIGHT_STAGES` array; the Dashboard's pipeline strip and Return Workflows panel now both highlight per the signed-in role instead of always showing Admin's stages — see the "Role → highlighted stages" / "Highlight application bug" rows in §10.1 and the F-04/F-05 rows in §10.2.
**Update 2026-08-06 (3):** `Dashboard.tsx:49`'s hardcoded `isAdminOrOwner` role check (gating the 3-column panel layout + WhatsApp Intake panel) replaced with a new `viewIntakePanel` capability — see the F-07 row in §10.2.
**Update 2026-08-06 (4):** `useAttentionItems.ts` buckets tagged with the `Capability` that owns each one; role-owned (+ universal) items now sort first instead of a fixed, unordered list — see the F-03 row in §10.2.
**Update 2026-08-06 (5):** F-09/Enforcement's server-ACL plan (`context/schema/roles-and-permissions`) was found already drafted (the earlier "exists but is empty" claim was wrong) and extended to cover the new `seeCustomerContact` fields + a verification checklist — still not yet applied in the live Directus admin panel, which requires manual admin access this session doesn't have.
**Update 2026-08-06 (6):** F-06's Finance-parallel-queue predicate extracted to `financeParallelQueueFilter()` in `pipeline.ts` — turned out to have 3 live copies, not the 2 the audit found (`useAttentionItems.ts`'s `finance` bucket was a third, unflagged duplicate).
**Update 2026-08-06 (7):** `ACTOR: Record<string, Role>` added to `pipeline.ts` and wired into `OrderDetail.tsx` as a read-only "who owns this stage" notice — see the Stage→actor row in §10.1.
**Update 2026-08-06 (8):** `Orders.tsx` now drives its `stage`/`search` filters from the URL (`useSearchParams`) instead of `useState` + router `location.state` — see the URL-as-filter-state row in §10.1.
**Update 2026-08-07 (1):** Pick List built for real (`usePickList.ts` + `PickList.tsx`, new `viewPickList`/`viewDeliveryRun`/`reconcileCOD` capabilities, Dashboard action-card row started). Deliveries/Cash Up were stubbed routes only at this point. This made F-01's warning concrete: `/picklist` was now a real, capability-button-gated-but-route-unguarded page — see the F-01 row in §10.2.
**Update 2026-08-07 (2):** the Action-card row finding is now fully closed — Deliveries and Cash Up are real pages too (not stubs), and Reports + Settings (previously `<Placeholder>` Sidebar routes) are also real. F-01's route-guard gap now applies to all 3 action-card routes, not just `/picklist` — see the revised Action-card row and F-01 rows in §10.1/§10.2.

> **Filename convention.** In this audit `Dev-X.jsx` maps to the prototype's real path:
> `Dev-Home.jsx` → `src/screens/Home.jsx`, `Dev-domain.js` → `src/lib/domain.js`,
> `Dev-App.jsx` → `src/App.jsx`, `Dev-Layout.jsx` → `src/components/Layout.jsx`,
> `Dev-ui.jsx` → `src/components/ui.jsx`, `Dev-OrderList.jsx` → `src/components/OrderList.jsx`,
> `Dev-store.jsx` → `src/lib/store.jsx`. Screens live in `src/screens/`, libs in `src/lib/`,
> components in `src/components/`.

---

## Table of contents

1. [Authority model — ground truth](#1-authority-model--ground-truth)
2. [Route guard map](#2-route-guard-map)
3. [Dashboard — what renders for whom](#3-dashboard--what-renders-for-whom)
4. [Stage-card highlighting](#4-stage-card-highlighting)
5. [Per-screen visibility matrix](#5-per-screen-visibility-matrix)
6. [Data-read patterns](#6-data-read-patterns)
7. [Findings — prioritised defect list](#7-findings--prioritised-defect-list)
8. [Port gap — prototype vs TypeScript app](#8-port-gap--prototype-vs-typescript-app)
9. [Verification checklist](#9-verification-checklist)

---

## 1. Authority model — ground truth

All of it lives in **`Dev-domain.js`**. There is exactly one resolver:

```js
// Dev-domain.js:229
export const can = (role, cap, settings) => {
  if (role === 'Owner') return true
  const o = settings?.permissions?.[cap]?.[role]
  if (o !== undefined) return !!o
  return !!DEFAULT_PERMISSIONS[cap]?.[role]
}
```

Owner is hardcoded to always-allow and is deliberately absent from the Settings matrix
(`Dev-Settings.jsx:13` — `ROLE_COLS = ['Admin','Warehouse','Production','Finance','Courier']`).

`PRICE_VISIBLE(role, settings)` is **not** a separate system — it is `can(role,'seePrices',settings)`
(`Dev-domain.js:236`), kept as a named alias for call-site stability.

### 1.1 Roles

`Dev-domain.js:3` — `['Admin','Warehouse','Production','Finance','Courier','Owner']`

### 1.2 Default capability matrix

Source: `ALLOW` at `Dev-domain.js:189`. `●` = allowed by default, `○` = denied. Owner = always `●`.

| Capability | Group | Admin | Warehouse | Production | Finance | Courier |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `seePrices` | Visibility | ● | ● | ● | ● | ○ |
| `seeCustomerContact` | Visibility | ● | ○ | ○ | ● | ● |
| `seeCustomerCredit` | Visibility | ● | ○ | ○ | ● | ○ |
| `browseCustomers` | Visibility | ● | ○ | ○ | ● | ○ |
| `browseProducts` | Visibility | ● | ● | ● | ● | ● |
| `accessReports` | Visibility | ● | ○ | ○ | ● | ○ |
| `trackCourier` | Visibility | ● | ○ | ○ | ● | ○ |
| `createOrders` | Orders | ● | ○ | ○ | ○ | ○ |
| `editOrders` | Orders | ● | ○ | ○ | ○ | ○ |
| `editAfterLock` | Orders | ○ | ○ | ○ | ○ | ○ |
| `helpOtherStages` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `actFinanceGate` | Pipeline | ○ | ○ | ○ | ● | ○ |
| `holdResume` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `cancelOrders` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `sendBackStage` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `reopenOrders` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `confirmDocsReturned` | Pipeline | ● | ○ | ○ | ○ | ○ |
| `overrideCreditLimit` | Money | ○ | ○ | ○ | ● | ○ |
| `reconcileCOD` | Money | ● | ○ | ○ | ● | ○ |
| `exportCSV` | Money | ● | ● | ● | ● | ● |
| `manageCustomers` | Admin area | ● | ○ | ○ | ○ | ○ |
| `manageProducts` | Admin area | ● | ○ | ○ | ○ | ○ |
| `manageSettings` | Admin area | ● | ○ | ○ | ○ | ○ |
| `backupRestore` | Admin area | ● | ○ | ○ | ○ | ○ |
| `manageTeam` | Admin area | ○ | ○ | ○ | ○ | ○ |
| `resetData` | Admin area | ○ | ○ | ○ | ○ | ○ |

`editAfterLock`, `manageTeam`, `resetData` default to **Owner-only** (empty allow-lists).

### 1.3 Stage → responsible role (`ACTOR`, `Dev-domain.js:143`)

| Stage | Actor |
|---|---|
| `intake` | Admin |
| `cold` | Warehouse |
| `finance` | Finance |
| `production` | Production |
| `packing` | Warehouse |
| `finalise` | Admin |
| `dispatch` | Courier |
| `outstanding` | Admin |
| `awaiting` | Admin |

`delivered`, `cancelled`, `returned` have **no** actor — they are terminal/off-pipeline and are
excluded from the `canAct` guard at `Dev-OrderDetail.jsx:656`.

### 1.4 Role → highlighted stages (`ROLE_FOCUS`, `Dev-domain.js:133`)

| Role | Focus stages |
|---|---|
| Admin | `intake`, `finalise`, `delivered` ⚠️ *(see F-04)* |
| Warehouse | `cold`, `packing` |
| Production | `production` |
| Finance | `finance` |
| Courier | `dispatch` |
| Owner | *(empty — oversees everything)* |

`ROLE_QUEUE` (`Dev-domain.js:130`) is a separate single-stage map. **It is imported and computed in
`Dev-Home.jsx:76` but never read** — see F-02.

### 1.5 Return buckets (`RETURN_BUCKETS`, `Dev-domain.js:70`)

| Key | Label | Highlighted for |
|---|---|---|
| `receive` | Awaiting Return | Warehouse, Owner |
| `settle` | Admin Action Required | Admin, Owner |
| `sign` | Awaiting Signed DO/SI | Admin, Courier, Owner |
| `replacement` | Replacement in Transit | Warehouse, Production, Courier, Admin, Owner |

This is a **second, independent role→work mapping** parallel to `ROLE_FOCUS` — a drift risk (F-05).
`returnBuckets(o)` (`Dev-domain.js:80`) can return several keys at once by design (parallel receive ∥ settle).

### 1.6 Pipeline stages (`STAGES`, `Dev-domain.js:14`)

`intake → cold → finance → production → packing → finalise → dispatch → delivered`

Off-pipeline states with labels/colours but **not** in `STAGES`: `outstanding`, `awaiting`,
`cancelled`, `returned`. This matters for `nextStage`/`prevStage` and for sorting (see F-11).

---

## 2. Route guard map

`Dev-App.jsx:25` defines a `<Guarded cap="…">` wrapper that redirects to `/` when `can()` is false.

| Route | Guard | Reachable by (default) |
|---|---|---|
| `/` | none | everyone |
| `/orders` | none | everyone |
| `/orders/:id` | none | everyone |
| `/orders/:id/edit` | `editOrders` | Admin, Owner |
| `/new`, `/new/intake` | `createOrders` | Admin, Owner |
| `/settings` | none | everyone *(sections gated inside — intended)* |
| `/customers`, `/customers/:id` | `browseCustomers` | Admin, Finance, Owner |
| `/products`, `/products/:id` | `browseProducts` | everyone |
| `/products/new` | `manageProducts` | Admin, Owner |
| `/reports` | `accessReports` | Admin, Finance, Owner |
| `/cashup` | `reconcileCOD` | Admin, Finance, Owner |
| **`/deliveries`** | **NONE** ⚠️ | **everyone** — see F-01 |
| **`/picklist`** | **NONE** ⚠️ | **everyone** — see F-01 |

Sidebar/tab nav (`Dev-Layout.jsx:8`) hides `/customers`, `/products`, `/reports` by capability.
`/deliveries`, `/picklist`, `/cashup` are **not** in `NAV` at all — they are reached only via dashboard
cards, which is why the two missing guards went unnoticed.

Two screens self-guard in addition to the route guard, which is the correct defence-in-depth pattern
and should be copied:

- `Dev-OrderEdit.jsx:27` — re-checks `editOrders` **and** `editAfterLock`, because the route guard
  only knows the base capability.
- `Dev-ProductDetail.jsx:16` — degrades to read-only via `canManage` rather than redirecting.

---

## 3. Dashboard — what renders for whom

`Dev-Home.jsx`. The file's own header comment states the intent: *"One dashboard for everyone — the
pipeline overview helps the whole team coordinate. What each role can SEE in detail is gated on click."*

### 3.1 Ungated — every logged-in role sees these

| Block | Line | Links to |
|---|---|---|
| Open orders stat | 143 | `/orders?stage=active` |
| Today's Orders stat | 147 | `/orders?filter=today` |
| Delivered Orders `PeriodStat` | 153 | `/orders?dtype=delivered&dfrom=…&dto=…` |
| Cancelled Orders `PeriodStat` | 154 | `/orders?dtype=cancelled&dfrom=…&dto=…` |
| Current order pipeline strip | 205 | `/orders?stage=<s>` |
| Returns workflow strip (when `retTotal > 0`) | 227 | `/orders?ret=<key>` |
| Needs attention (max 6) | 243 | `/orders/<id>` |
| Open orders `OrderList` | 255 | `/orders/<id>` |

**Consequence to accept or change deliberately:** a Courier's home screen shows company-wide pipeline
counts, every return bucket, and a full open-order list. Order *values* are hidden from Courier
(`OrderList` gates the value column on `seePrices`, `Dev-OrderList.jsx:22`), but customer names,
order numbers and delivery dates are not.

### 3.2 Gated blocks

| Block | Line | Gate | Type |
|---|---|---|---|
| "New order" button | 133 | `can('createOrders')` | capability |
| **My deliveries** card | 153 | `role === 'Courier'` | **hardcoded** |
| **Pick list** card | 158 | `['Warehouse','Admin','Owner'].includes(role)` | **hardcoded** |
| COD cash-up card | 163 | `can('reconcileCOD') && codPending.length > 0` | capability |
| Owner "Today at a glance" digest | 186 | `role === 'Owner'` | **hardcoded** |

Wrapper condition at line 151 correctly suppresses the whole row when no card would render.

### 3.3 Action-card row resolved per role

| Role | My deliveries | Pick list | COD cash-up |
|---|:--:|:--:|:--:|
| Admin | ✗ | ✓ | ✓ *(when pending)* |
| Warehouse | ✗ | ✓ | ✗ |
| Production | ✗ | ✗ | ✗ |
| Finance | ✗ | ✗ | ✓ *(when pending)* |
| Courier | ✓ | ✗ | ✗ |
| Owner | ✗ | ✓ | ✓ *(when pending)* |

This is the asymmetry to be aware of: **Courier is the only role with a delivery view; Admin and Owner
have no route into the run-sheet at all** (Owner gets an indirect `/orders?stage=dispatch` link from
the digest at line 197; Admin gets nothing). Production and Finance get no action card in normal
operation.

### 3.4 `myDeliveries` predicate (`Dev-Home.jsx:102`)

```js
const myDeliveries = orders.filter((o) =>
  (o.stage === 'dispatch' && (o.takenBy === user.name || !o.takenBy)) ||
  (o.stage === 'returned' && o.returnSettle === 'sign' &&
   (!o.returnDispatch || !o.returnDispatch.takenBy || o.returnDispatch.takenBy === user.name)))
```

`|| !o.takenBy` means unassigned dispatch orders count as "mine" for **any** user. Harmless while the
card is Courier-only; becomes a wrong label the moment the gate widens. `Dev-Deliveries.jsx:20`
(`takenByMe`) has the identical property and **is** reachable by any role (F-01).

### 3.5 `attention` list (`Dev-Home.jsx:112–128`)

Nine filters concatenated in fixed order, then `.slice(0, 6)`:

| # | Condition | Role-gated? |
|---|---|---|
| 1 | `stage === 'outstanding'` | no |
| 2 | return to receive (`!returnReceived` or `returnInbound`) | no |
| 3 | return needs admin decision | no |
| 4 | revised DO/SI out for signing | no |
| 5 | stock reminder due (`awaiting` + `remindOn`) | no |
| 6 | dispatch with no driver | no |
| 7 | COD unreconciled | `reconcileCOD` |
| 8 | terms payment overdue | `seeCustomerCredit` |
| 9 | past delivery date | no |
| 10 | signed DO/SI not returned | `confirmDocsReturned` |

Only 3 of 10 are role-filtered, and the two Admin-owned items sit **last** — see F-03.

---

## 4. Stage-card highlighting

### 4.1 Pipeline strip (`Dev-Home.jsx:205–222`)

```js
const counts = STAGES.filter((s) => s !== 'delivered').map(...)   // line 90
const mine = focus.includes(s)                                     // line 208
```

Highlighted card styling (line 215):
- `borderColor: STAGE_COLOR[s]`
- `background: var(--surface-2)`
- `boxShadow: inset 0 0 0 1px ${STAGE_COLOR[s]}` — a doubled ring
- number recoloured to `STAGE_COLOR[s]` (line 216)

Legend "Highlighted modules are your responsibility." renders only when `focus.length > 0`
(line 223) — so Owner sees no legend and no highlights, matching `ROLE_FOCUS.Owner = []`.

**Highlights at zero.** `mine` does not check `n > 0`, so an empty owned stage still lights up
("your desk, it's clear"). This is arguably correct — but it contradicts the returns strip.

### 4.2 Returns strip (`Dev-Home.jsx:231`)

```js
const mine = b.roles.includes(role) && role !== 'Owner' && b.n > 0
```

Different in three ways from the pipeline strip:
1. requires `b.n > 0` (pipeline does not)
2. uses `RETURN_BUCKETS[].roles`, not `ROLE_FOCUS`
3. highlight is `borderColor: 'var(--danger)'` with no inset ring — a different visual language

The `role !== 'Owner'` clause is needed only because every `RETURN_BUCKETS` entry lists `Owner` in
`roles`; `ROLE_FOCUS.Owner` solves the same problem by being empty.

### 4.3 Resolved highlight per role

| Role | Pipeline tiles highlighted | Return buckets highlighted (when n > 0) |
|---|---|---|
| Admin | New Orders, Print DO/SI | Admin Action Required, Awaiting Signed DO/SI, Replacement in Transit |
| Warehouse | Cold Storage Picking, Packing | Awaiting Return, Replacement in Transit |
| Production | Processing | Replacement in Transit |
| Finance | Finance Review | *(none)* |
| Courier | Dispatch | Awaiting Signed DO/SI, Replacement in Transit |
| Owner | *(none — by design)* | *(none — by design)* |

`ROLE_FOCUS.Admin` also lists `delivered`, which **never renders** because `delivered` is filtered out
of the strip at line 90 — see F-04.

### 4.4 Finance tile double-counts by design (`Dev-Home.jsx:90`)

```js
s === 'finance'
  ? orders.filter(o => o.stage === 'finance' ||
      (o.stage === 'cold' && !o.hold && !(o.payment && o.payment.confirmed))).length
  : orders.filter(o => o.stage === s).length
```

Cold + Finance run in parallel, so a cold, unpaid, un-held order is counted in **both** the Cold and
Finance tiles. Intentional and documented. Two side effects to keep in mind:
- the strip does not sum to the order count
- the Cold tile counts held orders while the Finance tile excludes them (asymmetric `!o.hold`)

This exact predicate is duplicated verbatim at `Dev-Orders.jsx:43` — see F-06.

---

## 5. Per-screen visibility matrix

### 5.1 `Dev-OrderDetail.jsx` — the main gating surface

`canAct` (line 122):

```js
const canAct = role === ACTOR[order.stage]
  || (['cold','production','packing','dispatch'].includes(order.stage) && can(role,'helpOtherStages'))
  || (['cold','finance'].includes(order.stage) && (role === 'Finance' || can(role,'actFinanceGate')))
  || role === 'Owner'
```

Note `helpOtherStages` covers cold/production/packing/dispatch but **not** `intake` or `finalise` —
a floor helper cannot cover the Print DO/SI desk. Non-actors get the read-only notice at line 656;
`ACTOR` has entries for `outstanding` and `awaiting`, so that message never renders blank.

Field-level gates:

| What | Line | Gate | Hidden from (default) |
|---|---|---|---|
| Line prices, order total | 1436, 1451 | `can('seePrices')` | Courier |
| Sales, Contact | 1293–1294 | `can('seeCustomerContact')` | Warehouse, Production |
| PO block | 1460 | `can('seeCustomerContact')` | Warehouse, Production |
| Delivery address (dispatch panel) | 870 | `!hideCustInfo \|\| canAct` | nobody acting on the order |
| Credit limit / exposure | 588 | `can('seeCustomerCredit')` | Warehouse, Production, Courier |
| Live courier map | 1513, 1515 | `can('trackCourier')` | Warehouse, Production, Courier |
| Documents (DO/SI log) | 1615 | **`['Admin','Finance','Owner']`** hardcoded | Warehouse, Production, Courier |

Always visible to every role: customer name, company, line items, quantities, cut instructions,
notes, and the full history (each entry carries `who` + `role`).

Action gates:

| Action | Line | Gate |
|---|---|---|
| Edit button | 136 | `can('editOrders') && (!editLocked \|\| can('editAfterLock'))` |
| Hold / Resume | 150, 644 | `can('holdResume')` |
| Send back a stage | 151 | `can('sendBackStage')` |
| Cancel / Restore | 154, 158 | `can('cancelOrders')` |
| Reopen closed order | 156 | `can('reopenOrders')` |
| Reorder | 161 | `can('createOrders')` |
| WhatsApp copy | 1278 | `can('createOrders')` |
| COD reconcile + undo | 1569, 1595 | `can('reconcileCOD')` |
| Terms payment received + undo | 1578, 1587 | `Finance \| Owner \| can('actFinanceGate')` |
| DO/SI returned + undo | 1599, 1609 | `can('confirmDocsReturned')` |
| Clear finance gate | 684 | **`Finance \| Owner \| can('actFinanceGate')`** hardcoded |
| Undo payment clearance | 165 | **`Finance \| Owner \| can('actFinanceGate')`** hardcoded |
| Weigh controls at Cold | 171 | **`Warehouse \| Owner \| (≠Finance && helpOtherStages)`** hardcoded |
| Weigh-fix banner | 146 | **`Admin \| Owner \| Warehouse \| can('sendBackStage')`** hardcoded |
| Return: receive & weigh | 1094 | **`['Warehouse','Owner']`** hardcoded |
| Return: settle document | 1095 | **`['Admin','Owner']`** hardcoded |
| Return: capture signed copy | 1096 | **`['Admin','Courier','Owner']`** hardcoded |
| Re-open & re-weigh | 1183 | **`['Warehouse','Owner']`** hardcoded |
| Inbound-return panel + undo | 1537, 1565 | **`['Warehouse','Owner']`** hardcoded |
| "Reprinted — done" | 1328 | **`Admin \| Owner`** hardcoded |

Undo actions are consistently gated by the same capability as the forward action — good, keep it.

The `returned` stage panel renders for **everyone** (the `!canAct` early return at line 656 excludes
`returned`), then the three hardcoded booleans gate the buttons. Read-only exposure is intended, but
note the gate order inverts here relative to every other stage.

### 5.2 Other screens

| Screen | Gate | Line |
|---|---|---|
| `Dev-Orders.jsx` — Export button | `can('exportCSV')` | 57 |
| `Dev-Customers.jsx` — Export | `can('exportCSV') && can('seeCustomerContact')` | 15 |
| `Dev-Customers.jsx` — Import / New | `can('manageCustomers')` | 13 |
| `Dev-CustomerDetail.jsx` — edit form vs read-only | `can('manageCustomers')` | 18 |
| `Dev-CustomerDetail.jsx` — exposure card | `can('seeCustomerCredit')` | 19, 66 |
| `Dev-Products.jsx` — Export | `can('exportCSV')` | 15 |
| `Dev-Products.jsx` — Import / New | `can('manageProducts')` | 14 |
| `Dev-Products.jsx` — OOS toggle | **`['Warehouse','Admin','Owner']`** hardcoded | 18 |
| `Dev-ProductDetail.jsx` — all fields incl. OOS | `can('manageProducts')` | 16 |
| `Dev-Reports.jsx` — AR / receivables block | `can('seeCustomerCredit')` | 53, 178 |
| `Dev-Settings.jsx` — Team | `can('manageTeam')` | 66 |
| `Dev-Settings.jsx` — Roles & permissions table | **`role === 'Owner'`** hardcoded | 118 |
| `Dev-Settings.jsx` — Cold Storage / Dispatch settings | `can('manageSettings')` | 158 |
| `Dev-Settings.jsx` — Backup / Restore / CSV | `can('backupRestore')` | 191 |
| `Dev-Settings.jsx` — Reset demo data | `can('resetData')` | 200 |
| `Dev-Deliveries.jsx` | **none** | — |
| `Dev-PickList.jsx` | **none** | — |
| `Dev-CashUp.jsx` | **none** (route-guarded only) | — |

`Dev-export.js:16` makes CSV export role-aware — contact columns behind `seeCustomerContact`, value
column behind `seePrices` — and neutralises spreadsheet formula injection at line 6. Good; keep both
behaviours in the port.

---

## 6. Data-read patterns

- **Single source.** Everything derives from one `orders` array in a `useReducer` store
  (`Dev-store.jsx`), persisted as one JSON blob under `localStorage['ipp-orderflow-v7']`.
  Photos live separately in IndexedDB (`Dev-photos.js`), referenced by id.
- **Cross-tab sync.** `Dev-store.jsx:171` listens for `storage` events and hydrates, keeping this
  tab's user. It compares against a memoised `sharedSig` to stop the two-tab hydrate ping-pong. Sound.
- **Quota handling.** `Dev-store.jsx:157` alerts the user once when the write fails, rather than
  failing silently. Good pattern, keep it.
- **URL as filter state.** `Dev-Orders.jsx:17` treats search params as the single source of truth, so
  dashboard deep-links, the dropdown, and browser Back all stay in sync. This is the strongest
  architectural idea in the prototype — **port it as-is.**
- **No memoisation in the dashboard.** `Dev-Home.jsx` performs ~20 full array passes per render, plus
  `RETURN_BUCKETS.length × orders.length` calls to `returnBuckets()`, plus an `orders.filter()` inside
  the `counts.map()` render loop (line 213). `Dev-Reports.jsx` memoises correctly; `Dev-Home.jsx`
  memoises nothing. Fine at demo scale, will stutter at a few thousand orders.
- **Date convention split.** The codebase deliberately appends `'T00:00:00'` to date-only strings to
  force local midnight (documented WIB/UTC 7-hour bug at `Dev-Home.jsx:120`), but `PeriodStat` builds
  its links with `toISOString()` (line 41). The round-trip through `new Date(dfrom)` in
  `Dev-Orders.jsx:34` is safe — but two conventions now coexist in one file.
- **`PeriodStat` persistence.** Persists `period` to `localStorage` per card (line 18) but not `back`,
  so "Month, 3 back" returns as "this month" on reload. Probably desirable.
- **Terminal-date helpers.** `deliveredOn()` / `cancelledOn()` (`Dev-domain.js:98,105`) fall back from
  the explicit stamp → last matching history entry → scheduled date. Single source, used by both the
  dashboard tiles and the Orders filter. Good.

---

## 7. Findings — prioritised defect list

Severity: **P1** = fix before go-live · **P2** = fix during the port · **P3** = hygiene.

---

### F-01 · P1 · `/deliveries` and `/picklist` have no route guard

**Files:** `Dev-App.jsx:51-52`, `Dev-Deliveries.jsx`, `Dev-PickList.jsx`

Every other sensitive route is wrapped in `<Guarded>`. These two are not, and neither screen
self-guards. Any authenticated role can reach them by typing the URL.

What leaks:
- `/picklist` — customer names, order numbers, quantities and cutting jobs for every order at
  `intake`/`cold` on the chosen date (`Dev-PickList.jsx:30`).
- `/deliveries` — every dispatch order's **delivery address** plus a live Google Maps link
  (`Dev-Deliveries.jsx:46`), with no `seeCustomerContact` check. The file comments justify showing the
  address *to the courier*; there is nothing restricting it to couriers.

Compounding: `takenByMe` (`Dev-Deliveries.jsx:20`) returns `true` for unassigned orders, so a
Production user opening `/deliveries` sees every unassigned delivery listed under **"My deliveries"**.

**Fix.** Add capabilities `viewPickList` and `viewDeliveryRun` to `CAPABILITIES` in `Dev-domain.js`,
with defaults `viewPickList: ['Warehouse','Admin']` and `viewDeliveryRun: ['Courier','Admin']`. Then:

```jsx
// Dev-App.jsx
<Route path="/deliveries" element={<Guarded cap="viewDeliveryRun"><Deliveries /></Guarded>} />
<Route path="/picklist"   element={<Guarded cap="viewPickList"><PickList /></Guarded>} />
```

Also add a self-guard at the top of both screens (and of `Dev-CashUp.jsx`) mirroring
`Dev-OrderEdit.jsx:27`, so the check is visible in the file and survives a router refactor.

---

### F-02 · P3 · Dead code in `Dev-Home.jsx`

Three separate leftovers, same class of problem as the `previewNo` / zero-arg `getNextOrderNo()`
residue in `OrderNew.tsx`:

1. **`myStage` is never read.** `Dev-Home.jsx:76` computes `ROLE_QUEUE[role]`; no other reference
   exists in the file. Delete the line and drop `ROLE_QUEUE` from the import on line 6.
2. **Unreachable colour branch.** `Dev-Home.jsx:216` reads
   `s === 'delivered' && !mine ? 'var(--c-done)' : …`, but line 90 filters `delivered` out of `counts`.
   The condition can never be true. Simplify to `mine ? STAGE_COLOR[s] : 'var(--text)'`.
3. **Stale comment + no-op alias.** `Dev-Home.jsx:72-73` aliases `orders = allOrders` and the comment
   at line 95 claims *"Voided orders live in allOrders — they're filtered out of the live `orders`"*.
   Void was absorbed into cancel (`Dev-store.jsx:24` migration); no filtering happens. Delete the
   alias, use `orders` from the store directly, and fix the comment.

---

### F-03 · P2 · "Needs attention" truncation buries role-owned items

**File:** `Dev-Home.jsx:112-128`

Ten filters are concatenated in a fixed order and then `.slice(0, 6)`. Two consequences:

- **Admin's own nags are last.** `confirmDocsReturned` is filter #10 and `past delivery date` is #9.
  During a busy returns week the first six slots are consumed by returns items, so an Admin never sees
  "signed DO/SI not returned" — the one item only they can action.
- **Most rows are not role-filtered.** Only #7, #8 and #10 check `can()`. A Courier is shown
  *"return — admin to update Accurate & decide"* and *"stock reminder due"*, neither of which they can
  act on. Their own relevant row (#6, "ready — awaiting a driver") is sixth and may be cut.

**Fix.** Tag each entry with the roles that can act on it, partition into *mine* / *others*, take
`mine` first and backfill to six:

```js
const tagged = [ /* …existing entries, each with `for: ['Admin']` etc… */ ]
const mine   = tagged.filter(x => x.for.includes(role) || role === 'Owner')
const others = tagged.filter(x => !mine.includes(x))
const attention = [...mine, ...others].slice(0, 6)
```

---

### F-04 · P3 · `ROLE_FOCUS.Admin` contains a stage that never renders

**Files:** `Dev-domain.js:135`, `Dev-Home.jsx:90`

`Admin: ['intake','finalise','delivered']` — but `delivered` is filtered out of the pipeline strip, so
the third entry is inert. It is almost certainly the reason the dead branch in F-02(2) exists.

**Fix.** Either drop `'delivered'` from `ROLE_FOCUS.Admin`, or decide `delivered` belongs in the strip
and remove the filter at line 90. Do not leave both.

---

### F-05 · P2 · Two competing role→work mappings, two highlight rules

**Files:** `Dev-domain.js:70` (`RETURN_BUCKETS[].roles`) vs `Dev-domain.js:133` (`ROLE_FOCUS`);
`Dev-Home.jsx:208` vs `Dev-Home.jsx:231`

The pipeline strip highlights from `ROLE_FOCUS` and highlights at zero. The returns strip highlights
from `RETURN_BUCKETS[].roles`, requires `n > 0`, needs an extra `role !== 'Owner'` clause, and uses a
different visual treatment (`var(--danger)` border, no inset ring).

**Fix.** Extend `ROLE_FOCUS` to hold return-bucket keys alongside stage keys, derive both strips from
it, drop the `b.n > 0` and `role !== 'Owner'` clauses, and unify the highlight style into one shared
helper so "yours" looks identical in both strips.

---

### F-06 · P2 · Three business predicates duplicated across files

| Predicate | Copy A | Copy B |
|---|---|---|
| Finance parallel queue | `Dev-Home.jsx:90` | `Dev-Orders.jsx:43` |
| COD pending | `Dev-Home.jsx:100` | `Dev-CashUp.jsx:12` |
| Courier's run | `Dev-Home.jsx:102` | `Dev-Deliveries.jsx:17-20` |

All three agree today. All three will drift on the next change.

**Fix.** Move into `Dev-domain.js` as `financeQueue(orders)`, `codPending(orders)`,
`myRun(orders, userName)`; import at all six sites.

---

### F-07 · P1 · Roughly a dozen hardcoded role checks bypass the permissions matrix

`Dev-Settings.jsx:119` tells the Owner: *"Turn each function on or off per role."* That is only true
for the 26 capability-gated call sites. These do not consult `can()` and cannot be changed from the UI:

| Location | Hardcoded gate | Controls |
|---|---|---|
| `Dev-Home.jsx:153` | `role === 'Courier'` | My deliveries card |
| `Dev-Home.jsx:158` | `['Warehouse','Admin','Owner']` | Pick list card |
| `Dev-Home.jsx:186` | `role === 'Owner'` | Today-at-a-glance digest |
| `Dev-OrderDetail.jsx:146` | `Admin\|Owner\|Warehouse \|\| sendBackStage` | Weigh-fix banner |
| `Dev-OrderDetail.jsx:165` | `Finance\|Owner \|\| actFinanceGate` | Undo payment clearance |
| `Dev-OrderDetail.jsx:171` | `Warehouse\|Owner \|\| (≠Finance && helpOtherStages)` | Weigh controls |
| `Dev-OrderDetail.jsx:684` | `Finance\|Owner \|\| actFinanceGate` | Clear finance gate |
| `Dev-OrderDetail.jsx:1094` | `['Warehouse','Owner']` | Receive returned goods |
| `Dev-OrderDetail.jsx:1095` | `['Admin','Owner']` | Settle return document |
| `Dev-OrderDetail.jsx:1096` | `['Admin','Courier','Owner']` | Capture signed revised DO/SI |
| `Dev-OrderDetail.jsx:1183, 1537, 1565` | `['Warehouse','Owner']` | Re-open & re-weigh, inbound return |
| `Dev-OrderDetail.jsx:1328` | `Admin\|Owner` | "Reprinted — done" |
| `Dev-OrderDetail.jsx:1615` | `['Admin','Finance','Owner']` | Documents (DO/SI log) |
| `Dev-Products.jsx:18` | `['Warehouse','Admin','Owner']` | OOS toggle |
| `Dev-Settings.jsx:118` | `role === 'Owner'` | The permissions table itself |

Concrete failure: an Owner grants Production `helpOtherStages` so they can cover Dispatch. Production
can now act on the order, but gets no run-sheet card, no delivery route, and no way to be given one
without a code change.

`Dev-domain.js:200` explicitly notes this was already fixed once for `editOrders`
(*"the code no longer hardcodes the role, so granting this to another role in Settings now actually
works (the matrix cells used to be dead)"*). The same treatment is owed to the rows above.

**Fix.** Add capabilities and convert the call sites:

```js
{ key: 'viewPickList',     label: 'See the aggregate pick list',        group: 'Pipeline' },
{ key: 'viewDeliveryRun',  label: 'See the delivery run-sheet',         group: 'Pipeline' },
{ key: 'receiveReturns',   label: 'Receive & weigh returned goods',     group: 'Pipeline' },
{ key: 'settleReturns',    label: 'Settle the return document',         group: 'Pipeline' },
{ key: 'signReturns',      label: 'Capture the signed revised DO/SI',   group: 'Pipeline' },
{ key: 'seeDocuments',     label: 'See the DO/SI document log',         group: 'Visibility' },
{ key: 'flagOutOfStock',   label: 'Flag a product out of stock',        group: 'Admin area' },
{ key: 'managePermissions',label: 'Edit the roles & permissions matrix',group: 'Admin area' },
```

Defaults reproducing today's behaviour:

```js
viewPickList:      ['Warehouse','Admin'],
viewDeliveryRun:   ['Courier'],
receiveReturns:    ['Warehouse'],
settleReturns:     ['Admin'],
signReturns:       ['Admin','Courier'],
seeDocuments:      ['Admin','Finance'],
flagOutOfStock:    ['Warehouse','Admin'],
managePermissions: [],            // Owner-only
```

Leave the Owner-digest check (`Dev-Home.jsx:186`) hardcoded — it is a role-shaped view, not a
permission.

---

### F-08 · P2 · `exportCSV` lets Courier dump data `browseCustomers` denies them

**Files:** `Dev-domain.js:207` (`exportCSV` allows all five roles), `Dev-domain.js:196`
(`browseCustomers: ['Admin','Finance']`), `Dev-export.js:16`, `Dev-Orders.jsx:57`

Courier has `seeCustomerContact: true` and `exportCSV: true` but `browseCustomers: false`. They cannot
open `/customers` — but they can hit Export on `/orders` and receive a CSV with Company, Sales,
Contact and Address columns for **every order in the filtered set**, not just their own deliveries.
`Dev-Customers.jsx:15` correctly requires *both* capabilities for the customer export; the orders
export does not apply the same reasoning.

**Fix.** Either narrow `exportCSV` defaults to `['Admin','Finance']`, or scope the orders export to
the rows the role can act on, or gate the contact columns in `ordersToCSV` on `browseCustomers` as
well as `seeCustomerContact`. Pick one and document it.

---

### F-09 · P1 · Auth is decorative, and the backup file carries PINs in cleartext

**Files:** `Dev-Login.jsx`, `Dev-store.jsx`, `Dev-backup.js:9`, `Dev-domain.js:5`

Understood and acceptable *as a prototype*, but must be recorded before anything ships:

1. `DEMO_USERS` (`Dev-domain.js:5`) seed with **no `pin`**, so on a fresh install all six users —
   including Owner — appear in the one-tap demo quick-login (`Dev-Login.jsx:42`).
2. PINs are compared as plain strings (`Dev-Login.jsx:21`), with no hashing, lockout or rate limit.
3. `login({name, role})` writes client state only. Every gate in this document is UX, not security.
4. `backupAll()` (`Dev-backup.js:9`) serialises the entire `localStorage` blob — which includes
   `users[].pin` — into a downloadable JSON, available to anyone with `backupRestore`.
5. **Escalation path:** `manageTeam` defaults to Owner-only, but if an Owner grants it to Admin via
   the matrix, that Admin can set any user's role to `Owner`, or add a new PIN-less Owner and quick-log
   in as them. `lastActiveOwner` (`Dev-Settings.jsx:24`) prevents removing the last Owner but does not
   restrict *creating* one.

**Fix (prototype-level, cheap):** strip `pin` from the backup payload; block role-change-to-Owner
unless the actor is Owner; ship at least one seeded PIN for the Owner.

**Fix (port-level, mandatory):** re-express the entire capability matrix as Directus policies and
permissions server-side. The React `can()` stays, but purely for hiding UI — never as the enforcement
boundary. Any Directus read the UI hides (prices, contact, credit) must also be denied by field-level
permissions, or the data is still in the API response.

---

### F-10 · P3 · Warehouse can toggle OOS in the list but not in the detail

**Files:** `Dev-Products.jsx:18` vs `Dev-ProductDetail.jsx:16,68`

`canFlagStock = ['Warehouse','Admin','Owner']` makes the OOS chip tappable in the list. The same field
in `ProductDetail` is `disabled={!canManage}` where `canManage = can('manageProducts')` — Admin/Owner
only. Same field, two different authorities, depending on which screen you are on.

**Fix.** Introduce `flagOutOfStock` (see F-07) and use it in both places.

---

### F-11 · P3 · Sorting by stage groups all off-pipeline orders together

**File:** `Dev-OrderList.jsx:28`

```js
if (sort === 'stage') return STAGES.indexOf(a.o.stage) - STAGES.indexOf(b.o.stage)
```

`STAGES` contains only the eight pipeline stages. `outstanding`, `awaiting`, `cancelled` and
`returned` all return `-1`, so they sort as a single indistinguishable block above `intake`.

**Fix.** Use an explicit ordered array covering all twelve states, or push `-1` to the end.

---

### F-12 · P2 · No memoisation in the dashboard

**File:** `Dev-Home.jsx`

~20 full passes over `orders` per render, `returnBuckets()` called `orders.length × 4` times
(line 108), and an `orders.filter()` **inside** the render loop at line 213. Zero `useMemo` in the
file, while `Dev-Reports.jsx:54` memoises correctly.

**Fix.** One `useMemo` keyed on `[orders, role, settings]` producing every derived set at once, plus a
single pre-pass computing per-stage counts in one reduce instead of one filter per stage.

---

### F-13 · P3 · Dead migration scaffolding in the store

**File:** `Dev-store.jsx:12-31`

```js
let v = saved.__v || 7
… // no branching on v anywhere
saved.__v = v
```

`v` is read and rewritten but never used to decide anything; both migration steps run unconditionally
on every load. Harmless today (both are idempotent), but it is a trap the first time a genuinely
non-idempotent migration is added.

Also note `case 'reset'` (`Dev-store.jsx:135`) deliberately preserves `settings` and `users`, so
"Reset demo data" does **not** reset permissions or the team. Confirm that is intended and document it
in the Settings copy.

---

## 8. Port gap — prototype vs TypeScript app

| Concern | Prototype | `ipp-orderflow` (TS) | Action |
|---|---|---|---|
| Capability resolver | `can()` + `DEFAULT_PERMISSIONS`, 26 caps (`Dev-domain.js:229`) | `useCan()` exists; matrix not ported | Port `CAPABILITIES` + `ALLOW` into `src/lib/domain.ts`, typed as `Record<Role, boolean>` |
| Role → highlighted stages | `ROLE_FOCUS`, all 6 roles (`Dev-domain.js:133`) | `ADMIN_HIGHLIGHT_STAGES` only (`pipeline.ts:74`) | Replace with `ROLE_FOCUS: Record<Role, Stage[]>` |
| Highlight application | per-role via `focus.includes(s)` | `ADMIN_HIGHLIGHT_STAGES.includes(...)` applied **to every role** (`Dashboard.tsx:142`) | **Bug in the port today** — a Courier sees Admin's stages highlighted. Drive from `useRole()` |
| Stage → actor | `ACTOR`, 9 entries (`Dev-domain.js:143`) | not present | Port verbatim |
| Return buckets | `RETURN_BUCKETS` + `returnBuckets()` | `RETURN_STAGES` labels only (`pipeline.ts:51`) | Port the bucket predicate; note keys differ (`receive`/`settle`/`sign`/`replacement` vs `awaiting_return`/`admin_action`/…) — pick one vocabulary |
| Action-card row | My deliveries / Pick list / COD cash-up (`Dev-Home.jsx:151`) | absent from `Dashboard.tsx` | Build after the capabilities land, gated on `viewDeliveryRun` / `viewPickList` / `reconcileCOD` |
| Finance parallel queue | `Dev-Home.jsx:90` | already replicated in `useDashboardCounts.ts:200` | Good — extract to one shared helper so all three copies collapse |
| Route guards | `<Guarded cap>` (`Dev-App.jsx:25`) | n/a | Port, **including** the two missing routes from F-01 |
| URL-as-filter-state | `Dev-Orders.jsx:17` | partial | Port fully — best pattern in the prototype |
| Enforcement | client-only | Directus | **Server-side policies are mandatory** — see F-09 |

Stage-key vocabulary differs between the two codebases. `pipeline.ts` uses `packing` and the four
`ReturnStage` keys; the prototype uses `packing` plus the four bucket keys. Reconcile before wiring
`ROLE_FOCUS`, or the highlight lookup will silently miss.

---

## 10. Port status audit — 2026-08-06

Re-checked every row above and every F-xx finding against the current `ipp-orderflow` codebase
(not the prototype). ✅ done · 🔶 done differently / partial · ❌ not done · ➖ not applicable
(the concerned screen doesn't exist yet, so the defect can't manifest).

### 10.1 Section 8 table, re-verified

| Concern | Status | Note |
|---|:--:|---|
| Capability resolver | 🔶 | `domain.ts` has its own `can()` + `ALLOW`, but it's a **redesign, not a port** — 16 keys (`createOrders`/`advanceStage`/`weighColdStorage`/… — stage-action oriented) vs. the prototype's 26 (visibility-oriented: `seeCustomerContact`, `seeCustomerCredit`, `browseCustomers`, `browseProducts`, `accessReports`, `trackCourier` — **none of these six exist as capabilities today**). `role_permissions` override loader (`loadRolePermissions()`) exists in `domain.ts:166` but its call site (whether it's actually invoked after login and threaded into `can()` calls) wasn't traced in this pass. |
| Role → highlighted stages | ✅ | **Fixed 2026-08-06.** `ROLE_FOCUS: Record<Role, Stage[]>` in `pipeline.ts` replaces the flat `ADMIN_HIGHLIGHT_STAGES` array — one map covering all 6 roles across both pipeline stages and return buckets (merges the prototype's `ROLE_FOCUS` + `RETURN_BUCKETS[].roles` into a single source, per F-05's own recommendation). Owner maps to `[]` by design, matching the prototype. |
| Highlight application bug | ✅ | **Fixed 2026-08-06.** `Dashboard.tsx` now computes `focusStages = role ? ROLE_FOCUS[role] : []` from `useRole()` and drives `highlight` on both the pipeline strip (`StagePill`) and the Return Workflows panel (`ReturnWorkflowsPanel`, which previously had no highlight concept at all) from that. A Courier now sees only Dispatch + their return buckets highlighted, not Admin's stages. |
| Stage → actor | ✅ | **Fixed 2026-08-06.** `ACTOR: Record<string, Role>` added to `pipeline.ts` (9 entries, ported from the prototype's `ACTOR`; `delivered`/`cancelled`/`returned` intentionally omitted — terminal/off-pipeline, same as the prototype). Wired into `OrderDetail.tsx` as a small read-only notice ("This order is currently with **Admin**.") shown when the signed-in role isn't the stage's actor, isn't Owner, and can't advance the stage via their own capability grant — purely informational, doesn't change any existing button's capability gate. |
| Return buckets | ✅ | Built 2026-08-06: `returnBucketsForOrder()` in `pipeline.ts`, directly ported from `returnBuckets()`, parallel-membership semantics preserved (an order can be in `awaiting_return` + `admin_action` simultaneously, exactly like `receive` ∥ `settle` in the prototype). **Vocabulary kept as the pre-existing `awaiting_return`/`admin_action`/`awaiting_signed_doc`/`replacement_transit`** (the port's own pre-existing enum) rather than switching to the prototype's `receive`/`settle`/`sign`/`replacement` — a deliberate choice to avoid a breaking rename of an enum already used across `useOrders.ts`, `useDashboardCounts.ts`, `Orders.tsx`, dashboard docs, etc. This *is* "picking one vocabulary" per the audit's own suggested action, just picking the port's rather than the prototype's. |
| Action-card row | ✅ | **Fully built 2026-08-07.** All 3 cards are now real pages, not stubs: Pick List (`usePickList.ts`/`PickList.tsx`), Deliveries (`useDeliveries.ts`/`Deliveries.tsx` — hero "Next stop" card + "Then" list, Mark Delivered, Navigate via Google Maps), Cash Up (`useCashUp.ts`/`CashUp.tsx` — courier-grouped COD reconciliation queue). All 3 buttons live in `Dashboard.tsx`'s `topActions`, each gated on its own capability (`viewPickList`/`viewDeliveryRun`/`reconcileCOD`). One known gap carried over from the Pick List build: Cash Up's "Confirm" is ephemeral, not persisted — no `cod_reconciled`-style field exists in the live schema (writing to a nonexistent field hard-errors in Directus), so Expected/Collected/Remaining reset on reload. That's schema-first work, a separate unit. |
| Finance parallel queue | ✅ | **Fixed 2026-08-06.** Extracted to `financeParallelQueueFilter()` in `pipeline.ts` — turned out there were **three** hand-rolled copies, not two (the audit's scan missed `useAttentionItems.ts`'s `finance` bucket, which had the identical `_or: [{stage:'finance'}, {stage:'cold' AND hold≠true AND payment_confirmed≠true}]` shape). All three (`useDashboardCounts.ts`, `useOrders.ts`, `useAttentionItems.ts`) now call the one shared function; confirmed via `grep` that no inline copy of `payment_confirmed: { _neq: true }` remains outside `pipeline.ts`. |
| Route guards | ❌ | `App.tsx`'s only guard, `ProtectedRoute`, is **auth-only** (checks `user`/`loading`), not capability-based — there is no `<Guarded cap="...">`-equivalent anywhere in the app. Every route today is reachable by any logged-in role regardless of capability; screens self-gate their *content* (buttons, fields) but nothing blocks *navigating* to a route a role shouldn't see. Currently low-consequence only because no route yet exposes data as sensitive as the prototype's `/picklist`/`/deliveries` (see F-01) — but the moment such a screen is added, it inherits this gap by default, not by exception. |
| URL-as-filter-state | ✅ | **Fixed 2026-08-06.** `Orders.tsx` now reads `stage`/`search` from `useSearchParams()` (`?stage=`/`?search=` in the URL) instead of `useState` + `location.state`; the old `prevLocKey` manual re-sync effect is gone — React Router re-renders the page directly on any URL change, whether from the stage dropdown, the search input, browser Back/Forward, or a dashboard deep-link. The 3 Dashboard call sites (`StagePill`, `ReturnWorkflowsPanel`, `AttentionPanel` click handlers) switched from `navigate('/orders', { state: { stage } })` to `navigate(\`/orders?stage=${stage}\`)`. A refreshed or bookmarked Orders URL now keeps its filter. |
| Enforcement | 🔶 | **Identity is real now** (Directus `authentication('json')` email/password, `src/lib/directus.ts:154` — no PIN list, no decorative login; see F-09 below), which structurally closes the PIN-leak/backup-blob part of F-09. **Data enforcement is still 100% client-side** — no Directus collection/field-level ACL or policy config has been *applied* on the live instance yet; `architecture.md:166` documents server-side ACLs as the *intended* design. **Correction**: `context/schema/roles-and-permissions` is not empty (an earlier pass's claim) — it's a complete, unfinished plan: full collection-level CRUD matrix for all 6 roles across every collection, plus the `order_lines.price` field-level restriction, written but never clicked through in the Directus admin UI. **Update 2026-08-06**: `OrderDetail.tsx`'s previously-ungated fields (order total, per-line price, Sales Rep, Contact, Address) are now gated client-side on `can('seePrices')` / the new `can('seeCustomerContact')`, and the plan doc was extended with the matching `orders.customer_contact`/`customer_email`/`customer_address`/`sales`/`sales_rep`/`sales_phone_number` field-level rules + a verification checklist (raw-API spot checks per role) — still just a plan, not yet applied. The server-ACL half of this row remains the sole open gap: absent applying that plan in Directus, this data is still in the raw API response for any authenticated role regardless of what the UI hides. |

### 10.2 F-01 → F-13, current-app status

| Finding | Status | Note |
|---|:--:|---|
| F-01 route guards missing | ❌ | **The predicted defect is now fully live, not just for `/picklist`.** As of 2026-08-07, `/picklist`, `/deliveries`, and `/cashup` are all real pages exposing exactly what the audit warned they would: `/picklist` — customer names, order numbers, quantities, cutting-job detail; `/deliveries` — delivery addresses + a Google Maps link + COD cash amounts for the signed-in courier's run; `/cashup` — every courier's outstanding COD totals by customer. Each route's *button* is capability-gated (`viewPickList`/`viewDeliveryRun`/`reconcileCOD`), but none of the *routes* are — `ProtectedRoute` in `App.tsx` is still auth-only, so any authenticated role can reach any of the three directly by URL regardless of capability. Fix is unchanged from the original recommendation: a `<Guarded cap="...">`-style wrapper (or a per-route capability check inside `ProtectedRoute`) — now covering 3 routes instead of 1. |
| F-02 dead code in Home.jsx | ➖ | Prototype-specific artifacts (unread `myStage`, unreachable colour branch, stale `allOrders` alias) — nothing to port, not applicable. |
| F-03 attention-list truncation buries role-owned items | ✅ | **Fixed 2026-08-06.** `useAttentionItems.ts`'s truncation mechanism never existed in the port (no `.slice()`, no fixed cap), so the literal "buried past position 6" failure mode was never reachable — but the **role-blindness half is now also fixed**: each bucket is tagged with the `Capability` that owns it (`printDocuments` for docs/finalise, `approveFinance` for finance, `processReturns` for both return buckets; `late` stays untagged/universal, matching the prototype's own choice to leave that entry unfiltered). The hook now sorts role-owned (+ universal) items first via a stable sort, so every role still sees the full list (same as the prototype's own mostly-unfiltered design — see §3.5) but their own actionable items surface at the top instead of being interleaved in fixed bucket order. |
| F-04 `ROLE_FOCUS.Admin` has a dead stage | ✅ | Avoided by construction: the port's `ROLE_FOCUS.Admin` (`pipeline.ts`) lists `intake`/`finalise`/`admin_action`/`awaiting_signed_doc`/`replacement_transit` — every one of those is a real key rendered somewhere (pipeline strip or returns panel). No `delivered`-style dead entry, since the map was written fresh against the port's own filtered stage lists rather than copied from the prototype. |
| F-05 two competing role→work mappings | ✅ | **Fixed 2026-08-06** — heeded the audit's own warning before building `ROLE_FOCUS`: one map (`pipeline.ts`'s `ROLE_FOCUS`) now covers both pipeline stages and return-bucket keys, and both the pipeline strip and the Return Workflows panel read from it and render the same `.pillHighlight` visual treatment (`ReturnWorkflowsPanel.module.css` now mirrors `StagePill.module.css`'s highlight class — same accent border/background/text, not a separate visual language). No `n > 0` gate and no `role !== 'Owner'` special case needed — `ROLE_FOCUS.Owner = []` already produces "no highlights" for Owner in both strips. |
| F-06 duplicated business predicates | ✅ | **Fixed 2026-08-06** — see the Finance parallel queue row in §10.1 (all 3 live copies collapsed to `financeParallelQueueFilter()` in `pipeline.ts`). COD-pending / courier's-run predicates remain ➖ not applicable — those features don't exist in the port. |
| F-07 hardcoded role checks bypass the capability matrix | ✅ | The returns sub-flow built 2026-08-06 deliberately avoided this (`auth.can("processReturns")` everywhere, no hardcoded role arrays). The other instance this audit found — `Dashboard.tsx:49`'s `const isAdminOrOwner = role === 'Admin' || role === 'Owner'` gating the 3-column panel layout + WhatsApp Intake panel — is **fixed 2026-08-06**: new `viewIntakePanel` capability added to `domain.ts` (default `true` for Admin, unset/`false` for the other four roles — reproduces today's behaviour exactly), `Dashboard.tsx` now reads `can('viewIntakePanel')` instead of the hardcoded role check. An Owner can now delegate "sees the Intake panel" to e.g. Finance via a `role_permissions` override, no code change needed — closing the concrete escalation gap the audit called out. No other hardcoded role-array gates were found in the port outside this one (only the prototype's Dev-* files still have the full dozen listed in §7 F-07, which don't carry over). |
| F-08 `exportCSV` over-permissive | ➖ | No CSV/export feature exists anywhere in the port yet (confirmed by full-repo grep) — nothing to be over-permissive about until it's built. Worth a note-to-self for whoever builds it: this audit already has the right default split (`['Admin','Finance']`) ready to reuse. |
| F-09 auth decorative + PIN leak | 🔶 | **Identity layer fixed**: real Directus email/password auth (`src/lib/directus.ts:154`, `src/pages/Login/Login.tsx`), no PIN list, no quick-login-as-anyone, nothing resembling `backupAll()` serializing credentials. `OrderDetail.tsx`'s price/contact gating is fixed (2026-08-06 — see Enforcement row above). The **"server-side enforcement mandatory" half of the prescribed fix is still open, but now has a ready-to-apply plan**: `context/schema/roles-and-permissions` has the full 6-role collection-CRUD matrix + the `order_lines.price` and `orders` contact-field restrictions (extended 2026-08-06 to match `seeCustomerContact`) + a raw-API verification checklist — it just hasn't been clicked through in the live Directus admin panel yet. That's a manual/admin-access step outside what this session can execute (no write-capable Directus token available, and live role-ACL mutation on shared infrastructure isn't something to script unattended). |
| F-10 OOS toggle inconsistent between list and detail | ✅ | Resolved, and resolved correctly: `Products.tsx:18`, `ProductDetail.tsx:20`, and `ProductEdit.tsx:28` all gate on the **same** `manage_products` capability — no split-authority gap like the prototype's `canFlagStock` (list) vs `manageProducts` (detail) mismatch. |
| F-11 sorting by stage groups off-pipeline orders together | ➖ | The port's `Orders.tsx` sort dropdown only offers Order ID / Delivery Date — there's no "sort by stage" option at all, so this specific bug has no surface to occur on today. |
| F-12 no memoisation in the dashboard | ✅ | Resolved by a different architecture rather than by adding `useMemo`: the port's dashboard hooks (`useDashboardCounts`, `useAttentionItems`, `useOpenOrders`) fetch pre-aggregated counts from Directus (`aggregateOrders()`) instead of pulling every order into the browser and filtering/counting client-side. The whole class of "N full array passes per render" the finding describes doesn't apply to a server-aggregated read model. |
| F-13 dead migration scaffolding in the store | ➖ | Prototype-specific to the `localStorage` `__v` versioning scheme — no equivalent concept in a Directus-backed app (schema migrations are Directus's/Postgres's concern now, not app-level). |

### 10.3 Section 9 checklist, re-verified against the port

Marking only what's actually checkable today — most rows require role-scoped dashboard highlighting
(`ROLE_FOCUS`) or screens (`/deliveries`, `/picklist`) that don't exist in the port yet, so they're
left unchecked with a reason rather than guessed at.

- [ ] **Courier** — cannot reach `/picklist` (redirects to `/`); can reach `/deliveries` — *N/A, neither route exists in the port yet.*
- [ ] **Production** — cannot reach `/deliveries` or `/picklist` — *N/A, same reason.*
- [ ] **Production** — dashboard shows no action-card row (no empty container rendered) — *N/A, the action-card row itself doesn't exist yet (trivially "true" today since nothing renders for anyone, but that's absence of the feature, not a verified guard).*
- [x] **Warehouse** — `Cold Storage Picking` and `Packing` tiles highlighted; nothing else — **passes as of 2026-08-06**: `ROLE_FOCUS.Warehouse = ['cold', 'packing', 'awaiting_return', 'replacement_transit']` — the two named pipeline tiles highlight, Admin's `intake`/`finalise` no longer do.
- [x] **Finance** — only `Finance Review` highlighted; tile count includes cold+unpaid orders — **passes**: `ROLE_FOCUS.Finance = ['finance']` only; the count-includes-cold+unpaid part was already ✅ true (`useDashboardCounts.ts`'s finance-parallel query).
- [x] **Admin** — `New Orders` + `Print DO/SI` highlighted; `Delivered` absent from the strip — **passes**: `ROLE_FOCUS.Admin` includes `intake`/`finalise` (+ the port's own `admin_action`/`awaiting_signed_doc`/`replacement_transit` return buckets in place of the prototype's return-bucket set); `delivered` was never in the port's pipeline strip to begin with (filtered stages list doesn't include it) and isn't in `ROLE_FOCUS.Admin` either, so there's no F-04-style dead entry.
- [x] **Owner** — no tiles highlighted, no "Highlighted modules…" legend, digest visible — **partially passes**: `ROLE_FOCUS.Owner = []`, so Owner now sees zero highlighted tiles in either strip, matching the prototype. There is still no "Highlighted modules are your responsibility" legend and no "Today at a glance" Owner digest in the port — those are separate, not-yet-built UI pieces, not part of this fix.
- [x] **Admin** — with ≥6 return items pending, "signed DO/SI not returned" still appears in Needs attention — **passes trivially, and now for the right reason**: there's still no 6-item truncation in the port (nothing to bury regardless of pending count), but as of 2026-08-06 `useAttentionItems` *is* role-partitioned — the "pending-docs" bucket is tagged `printDocuments` (Admin-owned) and sorts to the top of Admin's list rather than being interleaved. There's still no `confirmDocsReturned`-equivalent capability (the port reuses `printDocuments` as the closest existing match) — a dedicated capability is a further-refinement, not required for this row to pass.
- [x] **Courier** — Needs attention shows only rows they can act on — **partially passes, by design**: Courier still sees every bucket (matches the prototype — only 3 of 10 prototype entries were ever role-filtered; "one dashboard for everyone" is the stated intent, not a bug), but none of the current 6 buckets are Courier-owned (`printDocuments`/`approveFinance`/`processReturns` are all Admin/Finance/Warehouse capabilities) so nothing sorts to the top for Courier today — that's expected until a Courier-relevant bucket (e.g. "ready — awaiting a driver", from the prototype's own attention list) gets built.
- [x] **Courier** — no prices anywhere (OrderDetail lines, order total, OrderList value column, CSV) — **passes at the client layer as of 2026-08-06**: `OrderDetail.tsx`'s per-line price/total and order-total rows are now gated on `can('seePrices')` (Courier defaults to `false`), matching `OrderRows.tsx`'s existing gate. No CSV export exists yet (F-08, N/A). Server-side field ACL is still absent — see Enforcement row — so this is a UI-layer pass, not a defense-in-depth pass.
- [x] **Warehouse** — no Sales/Contact/PO on OrderDetail; delivery address still visible when acting on dispatch — **passes at the client layer as of 2026-08-06**: Sales Rep, Contact, and Address fields in `OrderDetail.tsx`'s customer-details grid are now gated on the new `can('seeCustomerContact')` capability (Warehouse defaults to `false`). No separate "delivery address visible when acting on dispatch" panel exists in the port (that's prototype-specific dispatch-panel UI not yet built), so that half of the row is N/A rather than verified.
- [x] **Warehouse** — OOS toggle behaves identically in `/products` and `/products/:id` — **passes**, both gated on `manage_products` (see F-10 above).
- [x] **Any role** — an order at `outstanding`/`awaiting` shows "This order is with Admin now", not a blank name — **passes as of 2026-08-06**: `ACTOR.outstanding = ACTOR.awaiting = 'Admin'` in `pipeline.ts`, surfaced in `OrderDetail.tsx` as "This order is currently with **Admin**." for any non-Admin/Owner role viewing such an order (exact wording differs slightly from the prototype's phrasing, but the substance — a named role, not a blank — matches).
- [ ] **Owner** — toggling `viewPickList` off for Warehouse in Settings actually removes their Pick list card — *N/A — no Owner Settings UI exists yet (`/settings` is a bare `<Placeholder>`), and neither `viewPickList` nor the Pick List card exist.*
- [ ] Backup JSON contains no `pin` field — *N/A — the port has no backup/export feature and no `pin` field anywhere (real Directus auth); the underlying risk this checks for doesn't exist in this architecture.*
- [ ] Sorting `/orders` by Stage places cancelled/returned/outstanding/awaiting deliberately, not as one `-1` block — *N/A — no "sort by stage" option exists in the port's Orders page (see F-11).*
- [ ] Dashboard render profile flat with ~2,000 seeded orders — *Not measured this pass, but architecturally likely fine — see F-12 (server-side aggregation, not client-side array passes).*

**Net read**: the returns-workflow and product-management gaps this audit flagged are now solved (often
better than the prototype — single capability instead of split authority, server aggregation instead of
client-side passes). The **stage-highlight role-blindness is now fixed** (2026-08-06, `ROLE_FOCUS` in
`pipeline.ts`, F-04/F-05 resolved) — the pipeline strip and Return Workflows panel both highlight per
the signed-in role now, sharing one map and one visual treatment. **The port's one hardcoded-role-check
instance of F-07 is also fixed** (2026-08-06, new `viewIntakePanel` capability replaces
`Dashboard.tsx:49`'s `isAdminOrOwner` check) — an Owner can now delegate the Intake panel to another
role via Settings without a code change. **The Needs Attention list's role-blindness (F-03) is also
fixed** (2026-08-06) — buckets are now tagged by owning `Capability` and role-owned items sort first,
matching the prototype's "mine first" intent without needing its 6-item cap (which the port never had).
**F-06's duplicated finance-parallel-queue predicate is also fixed** (2026-08-06, `financeParallelQueueFilter()`
in `pipeline.ts`) — turned out to have 3 live copies, not 2, once `useAttentionItems.ts` was checked.
**The `ACTOR` map and URL-as-filter-state are both fixed too** (2026-08-06) — `ACTOR` now drives a small
read-only notice on `OrderDetail.tsx` for non-actor roles, and `Orders.tsx` reads its filters from the
URL (`useSearchParams`) instead of router state, matching the prototype's strongest architectural pattern.
**The Action-card row is now fully built** (2026-08-07) — Pick List, Deliveries, and Cash Up are all real
pages (`usePickList.ts`/`useDeliveries.ts`/`useCashUp.ts`), each gated by its own capability
(`viewPickList`/`viewDeliveryRun`/`reconcileCOD`) on the Dashboard button. Reports and Settings (the two
remaining `<Placeholder>` Sidebar routes) are also real now — `Placeholder` itself was deleted, no route
in the app points to a stub anymore. This makes F-01 fully concrete rather than partially hypothetical:
all 3 action-card routes now genuinely expose what the audit warned they would, gated only at the
Dashboard-button level, not the route level. **Still open, and now the largest remaining gaps**: F-01's
route guard (needed now for 3 routes, not eventually for 1), capability-resolver parity for the
prototype's remaining visibility capabilities (`seeCustomerCredit`, `browseCustomers`, `browseProducts`,
`accessReports`, `trackCourier`), and a real persisted COD-reconciliation field (Cash Up's "Confirm" is
still ephemeral — see the Action-card row entry in §10.1). The
**data-exposure gap
at the client layer is now fixed** (2026-08-06): `OrderDetail.tsx` gates prices on `seePrices` and
customer contact/sales/address on the new `seeCustomerContact` capability, matching (and for Courier's
delivery-contact default, slightly refining) the prototype's approach. The **remaining, larger gap is
server-side enforcement** — a full plan now exists (`context/schema/roles-and-permissions`) but hasn't
been applied in the live Directus admin panel yet, so this data is still present in the raw API response
for any authenticated role regardless of what the UI now hides — that was already true of the prototype
and remains the mandatory next step per F-09's port-level fix.

---

## 9. Verification checklist

After the fixes, confirm each row by logging in as the named role:

- [ ] **Courier** — cannot reach `/picklist` (redirects to `/`); can reach `/deliveries`
- [ ] **Production** — cannot reach `/deliveries` or `/picklist`
- [ ] **Production** — dashboard shows no action-card row (no empty container rendered)
- [ ] **Warehouse** — `Cold Storage Picking` and `Packing` tiles highlighted; nothing else
- [ ] **Finance** — only `Finance Review` highlighted; tile count includes cold+unpaid orders
- [ ] **Admin** — `New Orders` + `Print DO/SI` highlighted; `Delivered` absent from the strip
- [ ] **Owner** — no tiles highlighted, no "Highlighted modules…" legend, digest visible
- [ ] **Admin** — with ≥6 return items pending, "signed DO/SI not returned" still appears in Needs attention
- [ ] **Courier** — Needs attention shows only rows they can act on
- [ ] **Courier** — no prices anywhere (OrderDetail lines, order total, OrderList value column, CSV)
- [ ] **Warehouse** — no Sales/Contact/PO on OrderDetail; delivery address still visible when acting on dispatch
- [ ] **Warehouse** — OOS toggle behaves identically in `/products` and `/products/:id`
- [ ] **Any role** — an order at `outstanding`/`awaiting` shows "This order is with Admin now", not a blank name
- [ ] **Owner** — toggling `viewPickList` off for Warehouse in Settings actually removes their Pick list card
- [ ] Backup JSON contains no `pin` field
- [ ] Sorting `/orders` by Stage places cancelled/returned/outstanding/awaiting deliberately, not as one `-1` block
- [ ] Dashboard render profile flat with ~2,000 seeded orders

---

## Suggested execution order

1. **F-01** — add the two route guards + self-guards (smallest change, largest exposure closed)
2. **F-09** — strip PINs from backup; restrict Owner-role assignment
3. **F-07** — add the eight capabilities, convert the hardcoded call sites
4. **F-03** — role-partition the attention list
5. **F-06** — extract the three duplicated predicates into `domain.js`
6. **F-05 / F-04** — unify the two highlight rules; fix `ROLE_FOCUS.Admin`
7. **F-02 / F-10 / F-11 / F-13** — dead code and small inconsistencies
8. **F-08** — decide and document the export policy
9. **F-12** — memoise the dashboard
10. **Section 8** — port `ROLE_FOCUS` + role-driven highlight into `Dashboard.tsx` before building the action-card row
