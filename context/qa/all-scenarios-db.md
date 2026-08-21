# Seed the App Directus DB — all order scenarios (matches the prototype fixture)

**Goal:** recreate, as real Directus rows, the same 25 orders the prototype's `/context/qa/store.jsx` seed produces —
so every stage/state/condition can be compared **side by side** (prototype vs app) to find what's
missing or renders differently.

**For the coding agent (has Directus DB access).** Field names, types, and relations below are taken
from the live `snapshot.json` — use them exactly.

---

## STEP 0 — Reset the database first

The user has manually cleared data. Before seeding, **wipe all app (non-`directus_*`) data rows and
restart the auto-increment sequences** so id-tracked tables begin at 1 again.

**Wipe order (respect FKs — children before parents):**

```
line_weighing_photos, line_photos, line_return_photos, line_weighings, line_cuts,
draft_weighings, corrections            → then →
delivery_proofs, return_documents, order_history, purchase_orders, attachments, messages,
courier_locations, connection_events    → then →
order_lines                             → then →
orders                                  → then →
customers
```

Do NOT delete: `products`, `role_permissions`, `settings` (reuse them). Do NOT touch any
`directus_*` system tables.

**Restart sequences — ONLY these four tables have integer auto-increment ids that can start from 1:**

| Table               | id type    | Reset                                                     |
| ------------------- | ---------- | --------------------------------------------------------- |
| `order_history`     | bigInteger | `ALTER SEQUENCE order_history_id_seq RESTART WITH 1;`     |
| `attachments`       | bigInteger | `ALTER SEQUENCE attachments_id_seq RESTART WITH 1;`       |
| `messages`          | bigInteger | `ALTER SEQUENCE messages_id_seq RESTART WITH 1;`          |
| `connection_events` | integer    | `ALTER SEQUENCE connection_events_id_seq RESTART WITH 1;` |

(Confirm the exact sequence names via `\d <table>` or `SELECT pg_get_serial_sequence('order_history','id');`
— Directus/Postgres usually names them `<table>_id_seq`. If a `TRUNCATE ... RESTART IDENTITY CASCADE`
is available and safe, that both deletes and resets the sequence in one step.)

**Important — every other table uses `uuid` ids** (`orders`, `order_lines`, `customers`, `delivery_proofs`,
all `line_*`, `return_documents`, `purchase_orders`, `courier_locations`, `corrections`, `draft_weighings`).
UUIDs are random — they have **no sequence and cannot "start from 1."** Do not attempt to reset or
renumber them; just insert fresh rows and let Directus generate the uuids. `products.id` is a string
(reused, not reset); `settings.id` is a fixed integer singleton (leave as-is).

So "start from 1" applies to `order_history`, `attachments`, `messages`, `connection_events` only —
which is fine, since those are the tables where a clean 1,2,3… sequence is actually meaningful (history
rows especially). The order/line/customer uuids being non-sequential is by design and doesn't affect
the comparison.

After the reset, verify: all four sequences are at 1, and every wiped table returns 0 rows, before
proceeding to seed.

---

## Schema map (prototype shape → app Directus)

The prototype stores everything on one nested order object. The app is **relational** — lines,
weighings, cuts, proofs, docs, and history are separate collections keyed by FK. Key mappings:

| Prototype (on order/line)                              | App collection.field                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `order.stage`                                          | `orders.stage` (text: intake/cold/finance/production/packing/finalise/dispatch/delivered/outstanding/awaiting/cancelled/returned) |
| `order.customerId` / `customerName`                    | `orders.customer_id` (uuid FK → customers) + denormalized `customer_name`                                                         |
| `payment.timing` / `.method`                           | `orders.payment_timing` / `payment_method` (from customer)                                                                        |
| `payment.confirmed`                                    | `orders.payment_confirmed` (bool) + `payment_confirmed_at`                                                                        |
| `payment.codAmount`                                    | `orders.payment_amount` (decimal)                                                                                                 |
| `codReconciled`                                        | `orders.cod_reconciled` (bool) + `cod_received_at`                                                                                |
| `hold` / `pickup` / `thirdParty`                       | `orders.hold` / `pickup` / `third_party`                                                                                          |
| `takenBy` / `takenAt`                                  | `orders.taken_by` (uuid FK → user) / (no takenAt col — use history)                                                               |
| `courierService {name,ref}`                            | `orders.courier_service` (string, store "Gojek · GK-8842119")                                                                     |
| `isReplacement`                                        | `orders.is_replacement`                                                                                                           |
| `backorderOf`                                          | (no direct col — put in `notes` or a history entry "Backorder of #X")                                                             |
| `docsReturned`                                         | `orders.docs_returned`                                                                                                            |
| `deliveredAt`                                          | `orders.delivered_at`                                                                                                             |
| `remindOn` (backorder reminder)                        | (no col — omit or use `notes`; flag as a GAP if the app needs it)                                                                 |
| `cancelledFrom`                                        | `orders.cancelled_from` (text)                                                                                                    |
| `reweighFrom`                                          | `orders.reweigh_from` (text)                                                                                                      |
| `pickupGeo` / `deliverGeo`                             | `orders.pickup_geo` / `deliver_geo` (json `{lat,lng,at}`)                                                                         |
| `undo` snapshot                                        | `orders.undo_snapshot` (json)                                                                                                     |
| return flags                                           | `orders.return_received` / `return_settle` / `return_doc` / `return_inbound` / `partial_return` / `returned_reason`               |
| **line** `productId/name/qty/unit/weight/price/status` | `order_lines.product_id/name/qty/unit/weight/price/status`                                                                        |
| **line** `delivered/returned/sent/short/removed`       | `order_lines.delivered/returned/sent/short/removed`                                                                               |
| **line** `weighings[]`                                 | `line_weighings` rows (`line_id`, `weight`, `photo_id`, `created_at`)                                                             |
| **line** `cuts[]`                                      | `line_cuts` rows (`line_id`, `text`, `done`, `sort_order`)                                                                        |
| **order** `proof {cond,recv,signed,cod,name}`          | `delivery_proofs` row (`cond_photo/recv_photo/signed_photo` uuid, `cod`, `name`, `cash_collected`, `archived`)                    |
| **order** `documents[]` (DO/SI)                        | `return_documents` rows (`kind`, `photo_id`) OR `attachments` — use `return_documents` for DO/SI numbers                          |
| **order** `history[]`                                  | `order_history` rows (`order_id`, `at`, `what`, `who` uuid, `stage`)                                                              |

**Notes on gaps to record while seeding** (these are the comparison payoff):

- `remindOn` (backorder reminder date) — **no column** in the app. Scenario 17 can't fully reproduce → flag.
- `failedAttempts[]` / `proofLog[]` (archived prior delivery attempts) — app uses `delivery_proofs.archived` for the archive, but there's **no failed-attempt list column**. Reproduce the archived proof; flag the missing attempt log.
- `backorderOf` — no FK; use notes/history. Flag if the app needs the parent link.
- Loaf/counted `sending` box + `short` hold logic — verify the app renders it (known divergence).

---

## Customers (create first — orders FK to these)

Reuse the app's existing customers if present; otherwise create these to match the prototype roster.
Set `pay_timing` exactly, since it drives COD/terms/upfront behaviour. Leave `address`/`contact` as
given; set `address_geo` null (or a Jakarta coord if you want the ~40m delivery check to work).

| name              | company_name      | channel | pay_timing | pay_method | term_days |
| ----------------- | ----------------- | ------- | ---------- | ---------- | --------- |
| En Dining Senci   | En Dining Senci   | horeca  | terms      | transfer   | 14        |
| Nishi Nakasu      | Nishi Nakasu      | horeca  | terms      | transfer   | 14        |
| Jiang Nan         | Jiang Nan         | horeca  | terms      | transfer   | 30        |
| Firepot Puri      | Firepot Puri      | horeca  | terms      | transfer   | 7         |
| Rudy Catering     | Rudy Catering     | horeca  | terms      | transfer   | 14        |
| K Mart Grocer     | K Mart Grocer     | retail  | terms      | transfer   | 30        |
| Tatemukai Izakaya | Tatemukai Izakaya | horeca  | cod        | cash       | 0         |
| Maya Pasta House  | Maya Pasta House  | horeca  | cod        | cash       | 0         |
| Ri Ri Xian        | Ri Ri Xian        | horeca  | cod        | cash       | 0         |
| Eat Tells Cafe    | Eat Tells Cafe    | horeca  | cod        | cash       | 0         |
| Warung Abdul      | Warung Abdul      | retail  | cod        | cash       | 0         |
| Rifai             | Rifai             | horeca  | cod        | cash       | 0         |
| Ducking Setiabudi | Ducking Setiabudi | horeca  | cod        | cash       | 0         |
| Yen Signature     | Yen Signature     | horeca  | upfront    | transfer   | 0         |
| Happy Home Bistro | Happy Home Bistro | horeca  | upfront    | transfer   | 0         |
| Wolfgang          | Wolfgang          | horeca  | terms      | transfer   | 14        |
| Ivy Restaurant    | Ivy Restaurant    | horeca  | terms      | transfer   | 14        |
| Munro             | Munro             | horeca  | terms      | transfer   | 7         |
| Saffron Kitchen   | Saffron Kitchen   | horeca  | upfront    | transfer   | 0         |

Use existing product rows for `order_lines.product_id`/`name` (match by name substring:
Lamb Leg Boneless, Aus Wagyu Cube Roll 4-5, Aus Wagyu Striploin 8-9, Aus Wagyu Ribeye 8-9,
US Choice Ribeye IBP, A5 Striploin, Short Rib Dice 500 Gram, Hokkaido Scallop 2L,
Tasmania Salmon Portion, Foie Gras Slice 1 KG). Match units exactly (kg / loaf / pack / box).

---

## The 25 orders — each a scenario to compare

For each: create the `orders` row + its `order_lines` (+ `line_weighings`/`line_cuts`/`delivery_proofs`/
`order_history` where noted). `order_date`/`deliver_at` relative to today. Every order gets at least one
`order_history` row ("Order created"). Set `no` like `2608XX-NN`.

### A — forward stages

1. **INTAKE** · En Dining · `stage=intake`, `payment_confirmed=false`. 3 lines (wagyu striploin loaf w/ cut, scallop box, short rib pack), no weights.
2. **COLD** · Nishi · `stage=cold`, unconfirmed. 2 lines: lamb kg WITH one `line_weighings` row (weight 3.12) + set `order_lines.weight=3.12`; wagyu cube loaf w/ `line_cuts` "cut 1.5 cm", no weight (→ shows unweighed).
3. **FINANCE** · Jiang Nan (terms) · `stage=finance`, unconfirmed. 1 scallop pack. (Finance gate active.)
4. **PRODUCTION** · Firepot · `stage=production`, `payment_confirmed=true`. 1 wagyu ribeye loaf w/ `line_cuts` "steak cut 3 cm · lapor gram".
5. **PACKING** · Wolfgang · `stage=packing`, confirmed. 1 ribeye loaf, `weight=4.05` + a `line_weighings` row.
6. **FINALISE** · Saffron · `stage=finalise`, confirmed. 1 scallop box.

### B — dispatch modes/sub-states

7. **DISPATCH · awaiting driver** · Maya Pasta · `stage=dispatch`, `taken_by=null`, `pickup=false`, `third_party=false` → sub-label "Awaiting driver". 1 salmon pack.
8. **DISPATCH · out for delivery (own courier, COD)** · Rifai · `stage=dispatch`, `taken_by=<courier uuid>`, `payment_timing=cod`, `payment_amount=6400000`, `payment_confirmed=true`, `customer_address` set. 1 A5 striploin loaf w/ cuts. History: "Handover: own courier".
9. **DISPATCH · customer pickup** · Happy Home · `stage=dispatch`, `pickup=true`, confirmed. 1 short rib pack.
10. **DISPATCH · 3rd-party** · Tatemukai · `stage=dispatch`, `third_party=true`, `courier_service="Gojek · GK-8842119"`, `payment_timing=cod`, `payment_amount=450000`. 1 lamb kg.
11. **DISPATCH · failed attempt** · Nishi · `stage=dispatch`, `taken_by=<courier>`, `customer_address` set. 1 wagyu striploin loaf. Add an **archived** `delivery_proofs` row (`archived=true`, empty photos) to represent the failed run. History: "Failed delivery attempt". _Flag: no failed-attempt list column._

### C — delivered variants

12. **DELIVERED · clean (terms)** · Rudy · `stage=delivered`, `delivered_at=today`, `taken_by=<courier>`, confirmed, `docs_returned=false`. 1 foie gras pack, `delivered=2`. `delivery_proofs` row (`name="Chef Rudy"`, `cod=false`). `deliver_geo={lat:-6.2091,lng:106.8461,at:today}`, `pickup_geo` too.
13. **DELIVERED · COD awaiting reconcile** · Rifai · `stage=delivered`, `payment_timing=cod`, `payment_amount=2100000`, `cod_reconciled=false`, `delivered_at=-1d`. 1 wagyu cube loaf `delivered=1`. `delivery_proofs` (`cod=true`, `cash_collected=2100000`, `name="Rifai"`). `deliver_geo` set. → shows COD reconcile follow-up + Cash-up row.
14. **DELIVERED · fully closed** · Eat Tells · `stage=delivered`, `payment_timing=cod`, `cod_reconciled=true`, `cod_received_at` set, `docs_returned=true`, `delivered_at=-5d`. 1 short rib pack `delivered=4`. `delivery_proofs` (`cod=true`). 2 `return_documents` rows (`kind=DO` no "DO-260807-14", `kind=SI` no "IPP-35611"). → no follow-ups (card gone).

### D — off-pipeline

15. **OUTSTANDING** · K Mart · `stage=outstanding`, confirmed, `delivered_at=-1d`. 1 scallop box `qty=5, delivered=3, sent=3` (2 owed). `delivery_proofs` (`name="K Mart receiving"`).
16. **AWAITING (backorder child)** · K Mart · `stage=awaiting`, `payment_confirmed=false`, `notes="Backorder of #<order15 no>"`. 1 scallop box qty 2. _Flag: no `remind_on` column, no `backorder_of` FK._
17. **AWAITING · reminder due** · Jiang Nan · `stage=awaiting`, unconfirmed, `notes="Backorder — stock reminder overdue"`. 1 wagyu ribeye loaf. _Flag: reminder can't drive a dashboard nudge without a `remind_on` column._
18. **ON HOLD** · Yen Signature · `stage=cold`, `hold=true`. 1 wagyu striploin loaf w/ cut. → excluded from finance queue + pick list.
19. **CANCELLED (from intake)** · Warung Abdul · `stage=cancelled`, `cancelled=true`, `cancelled_from="intake"`. 1 short rib pack.

### E — returns (4 buckets)

20. **RETURNED · receive** · Munro · `stage=returned`, `return_received=false`, `partial_return=true`, `returned_reason="Quality — 1 pack short-dated"`, confirmed. 1 short rib pack `qty=2, delivered=1, returned=1`.
21. **RETURNED · settle** · Ivy · `stage=returned`, `return_received=true`, `partial_return=true`, `returned_reason="Wrong item sent — 2 packs"`. 1 salmon pack `qty=4, delivered=2, returned=2`.
22. **RETURNED · sign + replacement** · Wolfgang · `stage=returned`, `return_received=true`, `return_settle="sign"`, `return_doc="DO-RET-260805-22"`, `is_replacement=true`, `returned_reason="Damaged in transit"`. 1 ribeye loaf `returned=1`. → shows in sign AND replacement buckets; **verify pill colour tracks current stage, not a fixed replacement colour.**
23. **REPLACEMENT + inbound** · En Dining · `stage=cold`, `is_replacement=true`, `return_inbound=true`, `return_received=false`, `return_doc="DO-RET-260808-23"`. 1 lamb kg. → rare double state (replacement running + original coming back).

### F — history spread

24. **DELIVERED · earlier month** · Ri Ri Xian · `stage=delivered`, `payment_timing=cod`, `cod_reconciled=true`, `docs_returned=true`, `delivered_at=-18d`. 1 wagyu striploin loaf `delivered=2`. `delivery_proofs` (`cod=true`). → feeds Reports/period tiles.
25. **CANCELLED (from dispatch)** · Maya Pasta · `stage=cancelled`, `cancelled=true`, `cancelled_from="dispatch"`, `payment_timing=cod`, `payment_amount=285000`. 1 short rib pack. → Restore should return to dispatch.

---

## Extra edge orders (app-specific features not in the base prototype seed)

To test features you added to the app beyond the prototype, also create:

26. **UNWEIGHED-ADDED guard** · any terms customer · `stage=production`, confirmed. 2 lines: one weighed (has `line_weighings` + weight), one kg line with NO weight and NO short → should trigger the "isn't weighed yet (added after Cold Storage)" banner. _(Confirm the app has this guard — flagged missing earlier.)_
27. **UNDO window** · any customer · `stage=cold`, with a valid `undo_snapshot` json (`{who:<the advancing user uuid>, at:<matches the LAST order_history.at>, prevStage:"intake", changedFields:{stage:"intake"}}`). **Critical:** the snapshot `at` MUST equal the last `order_history.at` for that order, or the undo button won't render (known bug). Use this to verify the undo fix.
28. **PARTIAL by short flag** · any · `stage=cold`. 2 lines: one kg with `short=true` (ran out), one kg weighed → release gate should enable. Tests the short-hold logic.

---

## Seeding order (respect FKs)

1. `customers` → 2. `products` (reuse existing) → 3. `orders` → 4. `order_lines` (FK order_id) →
2. `line_weighings` / `line_cuts` (FK line_id) → 6. `delivery_proofs` / `return_documents` (FK order_id) →
3. `order_history` (FK order_id — and for scenario 27, write history BEFORE the undo_snapshot so you can copy its `at`).

For `taken_by` / `who` (uuid → directus_users), use real user ids for each role (Admin/Warehouse/
Finance/Courier/Owner) so role-based rendering and the undo `who`-match can be tested.

---

## How to compare (the payoff)

For each numbered scenario, open the SAME order in the prototype and the app and diff:

- **Does it render at all?** (missing feature)
- **Stage pill + sub-label** — colour, "Awaiting driver"/"Out for delivery", replacement colour
- **Which panels/buttons show** per stage (weighing controls, finance gate, dispatch modes, follow-ups)
- **Per-role visibility** (prices, contact, credit, documents, undo)
- **Content parity** — same lines, weights, cuts, proof, history

Record differences per scenario. The `*Flag*` notes above are the known schema gaps — confirm each is
truly missing (`remind_on`, `backorder_of` FK, failed-attempt log) or handled another way.

---

## Verify after seeding

- All 25 base orders visible in the app Orders list, filterable by stage.
- Each off-pipeline state (outstanding/awaiting/cancelled/returned) shows with correct pill.
- COD orders 13/14/24 appear/clear correctly in Cash-up.
- Return orders 20-23 populate the right buckets on the dashboard.
- Delivered orders show proof + geo + follow-ups per their flags.
- Scenario 27's undo button actually renders (validates the timestamp fix).
- Scenario 26's unweighed banner shows (or confirm the guard is missing).

---

## COMPLETE PER-LINE DATA (exact prices, cuts, quantities — from the prototype `store.jsx`)

This is the authoritative line-level data. Create one `order_lines` row per row below; for any non-empty
**Cut(s)**, also create `line_cuts` rows (split multi-cuts on comma into separate rows, `done=false`).
Map `Price` → `order_lines.price` (decimal); a `—` price means leave `price` NULL (no price on order —
invoiced in Accurate). `weight=` → set both `order_lines.weight` AND create one `line_weighings` row.
Line flags map to `order_lines.delivered / returned / sent / short` and (for `inboundReturn`) the
return-inbound handling.

Notes:

- **Prices are per-unit in Rp** (e.g. `2100000` = Rp 2,100,000). Line value = price × qty; the app
  computes the order total, don't store it.
- Products: match `order_lines.product_id`/`name` to existing `products` rows by name substring.
- `KERANG HOKKAIDO SCALLOP 2L` (order 3) is the same product family as `HOKKAIDO SCALLOP 2L` — use the
  matching product; the prototype's `find()` resolves it by substring.
- Multi-cut example (order 8): `kantong 1: cut 1.5 cm` and `kantong 2: cut 2 cm belah tengah, vacuum per
pcs` are **two** `line_cuts` rows (the prototype passed them as an array).

| #   | Customer                  | Stage              | Product                 | Qty | Unit | Price (Rp) | Cut(s)                                                                            | Line flags                      |
| --- | ------------------------- | ------------------ | ----------------------- | --- | ---- | ---------- | --------------------------------------------------------------------------------- | ------------------------------- |
| 1   | En Dining? no—**Saffron** | intake             | Wagyu Striploin 8-9     | 1   | loaf | 2,100,000  | steak cut 2 cm                                                                    | —                               |
| 1   | Saffron                   | intake             | Hokkaido Scallop 2L     | 2   | box  | 850,000    | —                                                                                 | —                               |
| 1   | Saffron                   | intake             | Short Rib Dice 500 Gram | 3   | pack | 95,000     | —                                                                                 | —                               |
| 2   | En Dining Senci           | cold               | Lamb Leg Boneless       | 3   | kg   | —          | —                                                                                 | weight=3.12 (+1 line_weighings) |
| 2   | En Dining Senci           | cold               | Wagyu Cube Roll 4-5     | 1   | loaf | —          | cut 1.5 cm                                                                        | —                               |
| 3   | Nishi Nakasu              | finance            | Hokkaido Scallop 2L     | 1   | pack | —          | —                                                                                 | —                               |
| 4   | Jiang Nan                 | production         | Wagyu Ribeye 8-9        | 1   | loaf | —          | steak cut 3 cm · lapor gram                                                       | —                               |
| 5   | Wolfgang                  | packing            | US Choice Ribeye IBP    | 1   | loaf | 1,275,000  | steak cut 2.5 cm                                                                  | weight=4.05 (+1 line_weighings) |
| 6   | Firepot Puri              | finalise           | Hokkaido Scallop 2L     | 2   | box  | 850,000    | —                                                                                 | —                               |
| 7   | Maya Pasta House          | dispatch           | Tasmania Salmon Portion | 3   | pack | 220,000    | —                                                                                 | —                               |
| 8   | Rifai                     | dispatch           | A5 Striploin            | 2   | loaf | 3,200,000  | (2 cuts) kantong 1: cut 1.5 cm · kantong 2: cut 2 cm belah tengah, vacuum per pcs | —                               |
| 9   | Happy Home Bistro         | dispatch           | Short Rib Dice 500 Gram | 4   | pack | 95,000     | —                                                                                 | —                               |
| 10  | Tatemukai Izakaya         | dispatch           | Lamb Leg Boneless       | 5   | kg   | 90,000     | —                                                                                 | —                               |
| 11  | Nishi Nakasu              | dispatch           | Wagyu Striploin 8-9     | 1   | loaf | 2,100,000  | cut 2 cm                                                                          | —                               |
| 12  | Rudy Catering             | delivered          | Foie Gras Slice 1 KG    | 2   | pack | 1,050,000  | —                                                                                 | delivered=2                     |
| 13  | Rifai                     | delivered          | Wagyu Cube Roll 4-5     | 1   | loaf | 2,100,000  | cut 2 cm                                                                          | delivered=1                     |
| 14  | Eat Tells Cafe            | delivered          | Short Rib Dice 500 Gram | 4   | pack | 95,000     | —                                                                                 | delivered=4                     |
| 15  | K Mart Grocer             | outstanding        | Hokkaido Scallop 2L     | 5   | box  | 850,000    | —                                                                                 | delivered=3, sent=3 (2 owed)    |
| 16  | K Mart Grocer             | awaiting           | Hokkaido Scallop 2L     | 2   | box  | 850,000    | —                                                                                 | —                               |
| 17  | Jiang Nan                 | awaiting           | Wagyu Ribeye 8-9        | 1   | loaf | 1,900,000  | —                                                                                 | —                               |
| 18  | Yen Signature             | cold (hold)        | Wagyu Striploin 8-9     | 1   | loaf | 2,100,000  | cut 2 cm                                                                          | —                               |
| 19  | Warung Abdul              | cancelled          | Short Rib Dice 500 Gram | 2   | pack | 95,000     | —                                                                                 | —                               |
| 20  | Munro                     | returned           | Short Rib Dice 500 Gram | 2   | pack | 95,000     | —                                                                                 | delivered=1, returned=1         |
| 21  | Ivy Restaurant            | returned           | Tasmania Salmon Portion | 4   | pack | 220,000    | —                                                                                 | delivered=2, returned=2         |
| 22  | Wolfgang                  | returned           | US Choice Ribeye IBP    | 1   | loaf | 1,275,000  | —                                                                                 | delivered=0, returned=1         |
| 23  | En Dining Senci           | cold (replacement) | Lamb Leg Boneless       | 4   | kg   | 90,000     | —                                                                                 | inboundReturn=4                 |
| 24  | Ri Ri Xian                | delivered          | Wagyu Striploin 8-9     | 2   | loaf | 2,100,000  | —                                                                                 | delivered=2                     |
| 25  | Maya Pasta House          | cancelled          | Short Rib Dice 500 Gram | 3   | pack | 95,000     | —                                                                                 | —                               |

**Unpriced lines** (Price `—`): orders 2, 3, 4 have NO price on any/some lines — these are the ones that
should render "No price on the order — invoiced in Accurate" (order-level, once) in the app. Leave
`order_lines.price` NULL for them (NOT 0 — 0 would wrongly read as "priced at zero").

The full prototype source, if the agent wants to cross-check any detail, is the companion `store.jsx`.
