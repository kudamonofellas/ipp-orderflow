# Order Scenarios — Prototype QA Reference

Every condition an order can be in, in the `Dev-*` prototype. Use this to test the current app
against the prototype side by side. Each scenario lists: **how to reach it**, **what should appear**,
and **what to verify** in both codebases.

Roles for testing: **Teza** (Admin), **Budi** (Warehouse), a Production user, **Sari** (Finance),
**Anton/Budi** (Courier), **Winata** (Owner).

Legend: ✅ = should be present · ❌ = should be absent · ⚠️ = known port-divergence to watch

---

## 1. The eight forward pipeline stages

Each stage has one responsible role (`ACTOR`), a colour, and a forward action.

| #   | Stage        | Label                | Actor      | Forward action → next                                                 |
| --- | ------------ | -------------------- | ---------- | --------------------------------------------------------------------- |
| 1   | `intake`     | New Orders           | Admin      | advance → cold                                                        |
| 2   | `cold`       | Cold Storage Picking | Warehouse  | Release to Finance → finance (or skip to production/finalise if paid) |
| 3   | `finance`    | Finance Review       | Finance    | clear payment (parallel gate)                                         |
| 4   | `production` | Processing           | Production | Done → packing                                                        |
| 5   | `packing`    | Packing              | Warehouse  | Packed & ready → finalise                                             |
| 6   | `finalise`   | Print DO/SI          | Admin      | Print → dispatch                                                      |
| 7   | `dispatch`   | Dispatch             | Courier    | Mark delivered → delivered/outstanding                                |
| 8   | `delivered`  | Delivered            | —          | terminal (+ follow-ups)                                               |

**Verify per stage:**

- [ ] The correct actor role sees the forward-action button; other roles see read-only "with X now"
- [ ] **Admin can act on cold/production/packing/dispatch via `helpOtherStages`** (floor helper) ⚠️ _port gated cold on `weighColdStorage`, excluding Admin — check_
- [ ] Finance can act only at the finance gate, NOT weigh at cold
- [ ] The stage pill colour matches the responsible role's colour
- [ ] Stepper/progress shows current stage + "next: X"

---

## 2. Cold Storage — weighing & per-unit controls

The richest stage. Controls differ by unit type.

**Per-unit control matrix** (verify each unit shows exactly its controls):

| Unit family                 | Weight inputs + "Add weighing" | Sending box | Short button | Held via    |
| --------------------------- | :----------------------------: | :---------: | :----------: | ----------- |
| kg / gram                   |               ✅               |     ❌      |      ✅      | Short flag  |
| loaf                        |               ✅               |     ✅      |      ❌      | Sending = 0 |
| counted (box/pack/pcs/ekor) |               ❌               |     ✅      |      ❌      | Sending = 0 |

- [ ] ⚠️ **Sending box hidden on kg/gram** (port showed it on all units — check)
- [ ] Loaf shows BOTH weight inputs AND Sending box (the hybrid)
- [ ] Counted shows Sending box only, no weight inputs
- [ ] kg/gram shows Short button, loaf/counted do NOT

**Weighing behaviour:**

- [ ] "+ Add weighing" logs multiple scale loads that total up (e.g. 80 kg as 4×20 kg)
- [ ] Each weighing row has its own **scale photo** camera (per load)
- [ ] Running **Total** appears once ≥1 load entered, with below-order/over-order tolerance hints
- [ ] A previously-weighed line shows a green **"X kg" success chip** (already-weighed badge)
- [ ] Counted lines get an **"Add photo"** button (general line photo, not per-weighing) ⚠️ _port shows item photo on all units — decide intended behaviour_

**Photo requirement (`requirePhoto` on in Settings):**

- [ ] Release blocked until each weighed line has a scale photo (or is held/short)
- [ ] "Add a proof photo to release" hint shows on lines missing a photo
- [ ] ⚠️ On a weighed line, the _scale_ photo must satisfy the gate — a general item photo must NOT substitute

**Release button (ONE button, dynamic label + target):**

- [ ] Disabled until weighing complete (every line: weighed, already-weighed, or held/short)
- [ ] Label = **"Release to Finance"** when payment NOT cleared → target `finance`
- [ ] Label = **"Weighed — release"** when payment ALREADY cleared → target `production` (cuts remain) or `finalise` (no cuts) ⚠️ _port always routes to production; check cut-less orders don't stall_
- [ ] ⚠️ Re-weigh case: an order sent back for re-weigh returns to its origin stage with a reprint flag (port doesn't have this branch)

---

## 3. Finance parallel gate (payment clearing)

Cold and Finance run in PARALLEL — an order at `cold` can have payment cleared before it advances.

- [ ] Finance user at a cold order sees a **finance-clear card**, NOT weighing controls
- [ ] Clearing payment sets `payment.confirmed = true` + history entry ⚠️ _port: confirm this action exists — was flagged as never-written_
- [ ] After clearing, Finance sees a "Payment cleared — waiting on weighing" confirmation
- [ ] A cleared cold order shows "Payment cleared by Finance" status + **Undo** ("Cleared by mistake?")
- [ ] Finance tile on dashboard counts `stage==='finance'` OR (cold + unpaid + not-held) — parallel queue
- [ ] Once weighed + cleared, the order skips the finance stage (already paid) and moves on

**Payment terms (from customer) drive behaviour:**

- [ ] **COD** customer → COD chip, cash-collection at delivery, reconcile after
- [ ] **Terms** customer → Finance clears credit; payment-received tracked separately
- [ ] **Upfront** customer → paid before processing

---

## 4. Dispatch — sub-states × hand-off modes

**Sub-label** (StatusPill), driven by whether a hand-off is chosen:

- [ ] No `takenBy`/`pickup`/`thirdParty` → **"Awaiting driver"**
- [ ] Any of the three set → **"Out for delivery"**
- [ ] ⚠️ Sub-label needs `taken_by`/`pickup`/`third_party` fetched — port hooks may not select them

**Three hand-off modes** (the fork before any is chosen):

| Mode                | Chosen via                                                 | Proof panel                  | Address | COD                   | Live map     |
| ------------------- | ---------------------------------------------------------- | ---------------------------- | ------- | --------------------- | ------------ |
| **Own courier**     | "Take this delivery" (sets `takenBy`)                      | Proof of delivery (3 photos) | shown   | chip if COD           | ✅ trackable |
| **Customer pickup** | "Customer is picking up" (`pickup`)                        | Proof of pickup              | hidden  | chip if COD           | ❌           |
| **3rd-party**       | "Send by online courier" (`thirdParty` + `courierService`) | Handover photo only          | shown   | ❌ (service collects) | ❌           |

- [ ] **Admin can tap "Take this delivery"** via `helpOtherStages` ⚠️ _verify in port_
- [ ] Mode selection writes a history entry ⚠️ _prototype didn't; port should_
- [ ] "Change method" resets the hand-off (keeps captured photos), logs history
- [ ] Live courier map shows only for own-courier + `trackCourier` role (Admin/Finance/Owner)
- [ ] `DriverLive` publishes GPS when the assigned courier opens their own active delivery

**Proof capture (own-courier / pickup):**

- [ ] Condition photo required FIRST (gates the rest)
- [ ] Received-by photo + name required
- [ ] Signed invoice photo always required to mark delivered
- [ ] COD "Cash collected" toggle for COD orders ⚠️ _port pre-checks it; prototype defaults off + gates delivery_

---

## 5. Delivery outcomes

- [ ] **Full delivery** → `delivered`, all lines delivered, proof + GPS stamped
- [ ] **Partial delivery** (some lines short) → `outstanding` (delivered part, rest owed)
- [ ] **Failed attempt** → order stays at dispatch, `failedAttempts` logged, amber "attempt N failed" banner, previous proof archived to `proofLog`
- [ ] **Redelivery** after failure → new run, fresh proof; old evidence preserved (never deleted)
- [ ] GPS stamps: `pickupGeo` (at condition photo), `deliverGeo` (at mark-delivered) ⚠️ _verify port captures both_

**COD outcome (your app's refined design vs prototype's boolean):**

- [ ] Cash collected in full → delivered, enters reconcile queue
- [ ] Partial/no cash → routes to outstanding with recorded amount + reason (your app's design; prototype hard-gated on the boolean)

---

## 6. Post-delivery follow-ups (on a delivered order)

- [ ] **Driver location** row — human-readable "Dropped at ... · ~Xm · time" + Map link (raw coords behind the link, not inline) ⚠️ _port may show fallback wording only, lacking the ~Xm distance_
- [ ] **Undo — back to dispatch** ("Pressed wrongly?") — self-undo, restores exact snapshot, only for the acting user/Owner while it's the LAST action
- [ ] **COD cash reconcile** — for COD delivered + unreconciled + `reconcileCOD` role → "Confirm cash received", grouped in Follow-ups pending
- [ ] **DO/SI returned?** — `confirmDocsReturned` → "Mark returned", grouped in Follow-ups pending
- [ ] Follow-ups card DISAPPEARS when both resolved (fully closed)
- [ ] **Documents log** — add/view DO/SI numbers (multiple: original, return, replacement) — Admin/Finance/Owner
- [ ] Items are READ-ONLY at delivered (no weighing inputs, no camera) ⚠️ _Figma showed editable — must be read-only_

---

## 7. Outstanding → Backorder → Awaiting (the remainder flow)

**Reaching outstanding:** partial delivery leaves lines owed.

From an **outstanding** order (Admin/Owner), three choices:

- [ ] **"Send the rest — back to Cold Storage"** → owed lines return to cold for a follow-up (nyusul) delivery, `sent` reset
- [ ] **"Close with backorder"** → spawns a `-B` child order at `awaiting`, holding ONLY owed lines, payment re-gated (`confirmed: false`), optional reminder date
- [ ] **"Close short — remainder dropped"** → closes delivered-short, nothing more owed

**The `-B` backorder child** (`awaiting` stage):

- [ ] Holds only the owed lines, `backorderOf` points to parent
- [ ] Payment re-gated (passes through Finance again — must NOT inherit parent's cleared payment)
- [ ] Team notes preserved; proof/GPS/returns/docs/cod all reset
- [ ] "Activate — stock arrived" → back to `cold` (rejoins normal pipeline)
- [ ] "Close — stock did not arrive" → `cancelled`
- [ ] Reminder-due (`remindOn` past) → surfaces on dashboard "Needs attention" as "stock reminder due" with amber bell

---

## 8. Returns flow (four buckets)

An order can be in multiple buckets at once (parallel).

| Bucket          | Meaning                         | Acting role                        | Reached when                              |
| --------------- | ------------------------------- | ---------------------------------- | ----------------------------------------- |
| **receive**     | goods coming back, weigh in     | Warehouse                          | customer refused, `returnReceived: false` |
| **settle**      | settle doc in Accurate, decide  | Admin                              | `returnReceived: true`, awaiting decision |
| **sign**        | revised DO/SI out for signing   | Admin/Courier                      | `returnSettle: 'sign'`                    |
| **replacement** | replacement re-flowing pipeline | Warehouse/Production/Courier/Admin | `isReplacement: true`                     |

**Verify:**

- [ ] Full vs partial return (`partialReturn`) — kept lines vs returned lines shown with quantities
- [ ] **Receive bucket** (#) — Warehouse can "receive & weigh" the returned goods (NOT Admin) ⚠️ _hardcoded `['Warehouse','Owner']`_
- [ ] **Settle bucket** — Admin settles the document, decides replacement vs close
- [ ] **Sign bucket** — Admin/Courier capture the signed revised DO/SI
- [ ] **Replacement** — order badged `isReplacement`, re-enters at cold, flows through pipeline again
- [ ] ⚠️ Replacement order's pill colour tracks its CURRENT stage, not a fixed "replacement" colour (the isReplacement is a badge over the real stage)
- [ ] Rare double state: `isReplacement` + `returnInbound` (replacement running while original still coming back)
- [ ] Return buckets highlight on dashboard for the roles in each bucket's list
- [ ] `returnedReason` shown; `returnNotePhoto`, `returnSignedDoc`, `returnDoc` captured

---

## 9. Hold / Resume

- [ ] "Put on hold" (`holdResume`) at any active stage → `hold: true`
- [ ] Held order EXCLUDED from finance queue and pick list
- [ ] Held order shows on dashboard/lists as held
- [ ] "Resume" → returns to flow at its stage
- [ ] Only `holdResume` roles (Admin/Owner by default) can hold/resume

---

## 10. Cancel / Restore

- [ ] "Cancel order" (`cancelOrders`) from ANY stage → `cancelled`, `cancelledFrom` records origin
- [ ] Cancelled order is grey, terminal
- [ ] "Restore" → returns to `cancelledFrom` (stage-aware, not always intake)
- [ ] Cancel from intake vs cancel from dispatch restore to different stages
- [ ] Only `cancelOrders` roles can cancel/restore

---

## 11. Reopen vs Undo (distinct!)

- [ ] **Reopen** (`reopenOrders`, Owner-only default) — on a delivered/returned order, resets fulfilment for a genuine re-delivery, clears `docsReturned`/`codReconciled` (chase NEW paperwork+cash), sends back to dispatch
- [ ] **Undo — back to dispatch** — self-undo of a MISTAKEN close, restores exact snapshot, time-boxed (only while last action) + personal (acting user/Owner)
- [ ] These are DIFFERENT: Undo reverts (same delivery); Reopen re-runs (new delivery). Verify both exist and behave differently

---

## 12. Reorder

- [ ] "Reorder — new order, same items" (`createOrders`) on any order → clones into a NEW intake-stage order
- [ ] Copies customer/channel/payment/contact/address + all non-removed lines (with cuts)
- [ ] Resets: order#, delivery date (tomorrow), stage (intake), prices/weights cleared, payment unconfirmed, fresh history
- [ ] ⚠️ **Confirmed MISSING in port** — key gap for weekly Horeca repeats

---

## 13. Send back a stage

- [ ] "Send back to {prev stage}" (`sendBackStage`) — moves order one stage back
- [ ] Label uses operational stage name (e.g. "Send back to Print DO/SI", not "Return to Finalise") ⚠️
- [ ] Available throughout the stage (incl. after a courier takes a dispatch order) ⚠️ _port may hide after hand-off_
- [ ] Sending back from dispatch resets hand-off fields (`takenBy`/`pickup`/`thirdParty`/`courierService`)
- [ ] Should sit in the consolidated "Order actions" group (bottom), not inline with the primary action ⚠️

---

## 14. Re-weigh detour

- [ ] An order can be sent back to `cold` for re-weighing (`reweighFrom` records origin)
- [ ] After re-weigh, "Release" returns it to `reweighFrom` (not the normal forward path), with a reprint-DO/SI flag
- [ ] ⚠️ Port doesn't implement this branch — only a gap if the port supports re-weigh send-backs

---

## 15. Edit lock

- [ ] Order is LOCKED when: `delivered`, OR `dispatch` + hand-off taken, OR `outstanding`/`cancelled`/`returned`
- [ ] A dispatch order still "Awaiting driver" (no hand-off) is NOT locked — still editable
- [ ] Locked order: Edit button hidden; direct `/orders/:id/edit` URL refused ("You can't edit this order")
- [ ] `editAfterLock` (Owner-only default) bypasses the lock — Owner CAN edit a locked order
- [ ] Admin CANNOT edit a locked order ⚠️ _port flagged as only disabling Save, not redirecting_

**Test truth table:**
| Order state | Locked? | Admin edit? | Owner edit? |
|---|:--:|:--:|:--:|
| intake | no | ✅ | ✅ |
| dispatch, no driver | no | ✅ | ✅ |
| dispatch, taken | yes | ❌ | ✅ |
| delivered | yes | ❌ | ✅ |
| outstanding | yes | ❌ | ✅ |
| returned | yes | ❌ | ✅ |

---

## 16. Field visibility by role (on any order)

Test each as the role, verify the field is shown/hidden:

| Field                    | Capability           | Hidden from (default)          |
| ------------------------ | -------------------- | ------------------------------ |
| Line prices, order total | `seePrices`          | Courier                        |
| Sales, Contact, PO       | `seeCustomerContact` | Warehouse, Production          |
| Credit limit / exposure  | `seeCustomerCredit`  | Warehouse, Production, Courier |
| Live courier map         | `trackCourier`       | Warehouse, Production, Courier |
| Documents (DO/SI log)    | Admin/Finance/Owner  | Warehouse, Production, Courier |

- [ ] ⚠️ **Price must NOT leak in notifications** for a no-`seePrices` role
- [ ] Customer name, company, line items, quantities, cut instructions, history — always visible

---

## 17. Dashboard by role

- [ ] Pipeline strip: role's `ROLE_FOCUS` stages highlighted (Admin: intake+finalise; Warehouse: cold+packing; Production: production; Finance: finance; Courier: dispatch; Owner: none)
- [ ] Returns strip: role's buckets highlighted (incl. **Replacement in Transit for Admin** ⚠️)
- [ ] **Quick-action cards** — verify exact per-role set:
  - Courier: My deliveries (+ COD if pending)
  - Warehouse: Pick list
  - Admin: Pick list + COD (⚠️ **NOT** My deliveries)
  - Finance: COD only
  - Owner: Pick list + COD
  - Production: none
- [ ] "Today at a glance" digest — Owner (⚠️ consider Admin too)
- [ ] "Needs attention" — role-relevant items, docs-not-returned not truncated away for Admin

---

## 18. Orders page

- [ ] Stage filter via URL (`?stage=…`) — survives open-order-then-back navigation ⚠️
- [ ] Sub-label "Awaiting driver"/"Out for delivery" on dispatch rows
- [ ] Sort by column header (hover state, direction icon), default Order ID ascending ⚠️ _if redesigned_
- [ ] Value column hidden for no-`seePrices` role

---

## Quick cross-reference: every order flag

`hold` · `pickup` · `thirdParty` · `courierService` · `takenBy`/`takenAt` · `isReplacement` ·
`backorderOf` · `closedShort` · `docsReturned`/`docsReturnedAt` · `codReconciled` · `remindOn` ·
`failedAttempts` · `partialReturn` · `returnReceived`/`returnReceivedAt` · `returnSettle` ·
`returnInbound` · `returnDispatch` · `returnDoc`/`returnSignedDoc`/`returnNotePhoto` · `returnedReason` ·
`reweighFrom` · `proof`/`proofLog` · `pickupGeo`/`deliverGeo` · `cancelledFrom` · `shortReason` ·
`sent`/`delivered`/`returned`/`short`/`inboundReturn` (per-line)

Each flag = a state to reproduce and compare. If the app can't produce or handle one, that's a gap.
