## 1. Navigation & access (what Admin can reach)

- [x] Sidebar shows: Home, Orders, **Customers**, **Products**, **Reports**, Settings (Customers/Products/Reports appear because Admin has `browseCustomers`/`browseProducts`/`accessReports`)
- [x] `/customers` and `/customers/:id` load (not redirected)
- [x] `/products`, `/products/:id`, `/products/new` load
- [x] `/reports` loads
- [x] `/cashup` loads (has `reconcileCOD`)
- [x] `/picklist` loads
- [x] **`/deliveries`** — check whether Admin should reach the run-sheet (prototype had no guard; port should gate on `viewDeliveryRun`)
- [x] `/new` and `/new/intake` load (has `createOrders`)
- [x] `/orders/:id/edit` loads (has `editOrders`)

## 2. Dashboard (Home)

- [x] **Pick list** card shows (Admin is in the pick-list role set)
- [x] "My deliveries" card does **not** show (Courier-only) — _unless_ you've widened it
- [x] COD cash-up card shows when COD pending exists
- [x] **"Today at a glance" digest** — verify whether it shows for Admin (prototype = Owner-only; you were considering extending to Admin)
- [x] Pipeline strip: **New Orders (intake) + Print DO/SI (finalise)** tiles highlighted (Admin's `ROLE_FOCUS`), nothing else
- [ ] Returns strip: **Admin Action Required (settle)**, **Awaiting Signed DO/SI (sign)**, **Replacement in Transit** buckets highlighted
- [x] "Needs attention" list shows Admin-actionable items (outstanding, returns-to-settle, docs-not-returned, stock reminders)
- [x] New order button visible (`createOrders`)

## 3. Order creation & editing

- [x] Can create an order via `/new` → intake flow (WhatsApp paste / manual)
- [x] Can edit an unlocked order (`editOrders`)
- [x] **Cannot** edit a locked order — `editAfterLock` is Owner-only, so Admin should be blocked on a locked order (verify the port's lock gate)
- [x] **Reorder** button present on any order (clone → new intake order) — _confirmed missing in port earlier; this is a key QA item_

## 4. Stage actions Admin can perform

- [x] **Intake** — Admin is actor; can advance the order forward
- [x] **Finalise (Print DO/SI)** — Admin is actor; can print/advance to dispatch
- [x] **Help other stages** — because `helpOtherStages`, Admin can act on cold/production/packing/dispatch when covering (verify Admin sees action buttons on a stage they don't own, e.g. can weigh at cold)
- [x] **Cannot** act as the finance gate unless covering — `actFinanceGate` is Finance-only; Admin at finance should _not_ clear payment (verify Admin doesn't get the finance-clear button)
- [x] **Hold / Resume** (`holdResume`) — can pause/resume an order
- [x] **Send back a stage** (`sendBackStage`) — the "Send back to Print DO/SI" and other send-backs; verify label + availability
- [x] **Cancel / Restore** (`cancelOrders`) — can cancel any order and restore it
- [x] **Reopen** a closed order (`reopenOrders`) — verify it resets fulfilment for redelivery

## 5. Outstanding / backorder / awaiting (Admin owns these)

- [ ] Outstanding order (#15) — Admin can act: close-with-backorder or resolve
- [ ] "Close with backorder" spawns the `-B` child at awaiting with payment re-gated
- [ ] Awaiting order (#16, #17) — Admin can "Activate — stock arrived" (→ cold) or "Close — didn't arrive" (→ cancelled)
- [ ] Stock-reminder-due (#17) surfaces on the dashboard attention list

## 6. Returns flow (Admin owns settle + sign)

- [ ] Return in **settle** bucket (#21) — Admin can settle the document, decide replacement vs close
- [ ] Return in **sign** bucket (#22) — Admin can capture the signed revised DO/SI (Admin is in the sign role set)
- [ ] **Cannot** receive/weigh returned goods — that's Warehouse (`['Warehouse','Owner']` hardcoded); verify Admin does _not_ get the "receive & weigh" button on #20
- [ ] "Reprinted — done" action (Admin|Owner hardcoded) available

## 7. Delivered-order follow-ups (Admin's back-office loose ends)

- [ ] **COD reconcile** (`reconcileCOD`) — on a delivered COD order (#13), Admin sees "Confirm cash received", can reconcile
- [ ] **DO/SI returned** (`confirmDocsReturned`) — Admin can mark signed docs returned/filed
- [ ] **Documents log** (DO/SI entry) — Admin can add/view document numbers (`['Admin','Finance','Owner']` hardcoded)
- [ ] Cash-up screen (`/cashup`) — Admin sees the reconcile queue

## 8. Field visibility (what Admin sees on an order)

- [ ] **Prices** visible (`seePrices`) — line prices + order total
- [ ] **Customer contact** visible (`seeCustomerContact`) — Sales, Contact, PO block
- [ ] **Customer credit** visible (`seeCustomerCredit`) — credit limit / exposure
- [ ] **Courier live map** visible (`trackCourier`) — on an out-for-delivery order
- [ ] Full history with who+role visible

## 9. Customers & Products management

- [ ] Customers: Import / New / Edit (`manageCustomers`) — full CRUD
- [ ] Customer export (`exportCSV` + `seeCustomerContact`) — with contact columns
- [ ] Products: Import / New / Edit (`manageProducts`)
- [ ] **OOS toggle** on products — Admin is in the hardcoded set `['Warehouse','Admin','Owner']`
- [ ] Product export

## 10. Reports (`accessReports`)

- [ ] Reports page loads with volume-by-customer, demand-by-product
- [ ] **AR / receivables block** visible (`seeCustomerCredit`)
- [ ] CSV export from reports

## 11. Settings — what Admin CAN and CANNOT do

- [ ] **Cold Storage / Dispatch settings** (`manageSettings`) — editable, incl. the two proof toggles (`requirePhoto`, `dispatchProofRequired`)
- [ ] **Backup / Restore / CSV** (`backupRestore`) — available
- [ ] **Team block** — `manageTeam` is Owner-only (empty default), so Admin should **NOT** see team management unless Owner granted it
- [ ] **Roles & permissions matrix** — Owner-only (`role === 'Owner'` hardcoded); Admin should **NOT** see it
- [ ] **Reset demo data** — `resetData` Owner-only; Admin should **NOT** see it

---

## The high-value gaps to watch for (from our earlier findings)

These are the specific things most likely to fail QA for Admin, based on what we've already traced:

1. **Reorder** — confirmed absent from the port. Admin creates repeat Horeca orders constantly; this is the biggest functional gap.
2. **Send-back label + reachability** — "Return to Finalise" should read "Send back to Print DO/SI", and must be reachable after a courier takes the order.
3. **The two proof toggles in Settings** — `requirePhoto` / `dispatchProofRequired` reported not working + causing full re-render.
4. **`editAfterLock` boundary** — verify Admin is actually blocked on locked orders (Owner-only capability).
5. **Docs-not-returned attention item** — was last in the truncated attention list; verify Admin actually sees it on the dashboard.
