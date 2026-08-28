## Part A — the six forward pipeline stages (clean, one per stage)

**Order 1 — INTAKE (Saffron Kitchen).** A brand-new order sitting at the Admin's desk. No weights entered, payment not confirmed. Three lines: a wagyu striploin loaf (cut 2 cm), scallop box, short rib pack. What to see: the item list is **read-only** — no weighing inputs or camera, because those only appear at cold storage. This is the "just arrived, nothing done yet" state.

**Order 2 — COLD STORAGE (En Dining Senci).** At the warehouse weighing desk. Two lines: the lamb (kg) is **already weighed** at 3.12 kg (shows the green weighed chip), the wagyu cube loaf is **not yet weighed** (shows the "needs weighing" state). Payment still open — this is the stage where weighing and finance run in parallel. What to see: weight inputs + camera on the weighed lines, and the contrast between a done line and a pending one.

**Order 3 — FINANCE REVIEW (Nishi Nakasu).** A terms customer at the payment gate. Because they're on 14-day terms, Finance must clear the credit before it proceeds. What to see: the finance-gate panel, and credit exposure info for roles that can see it (`seeCustomerCredit`). Note this is an _unpriced_ order (no line prices) — it should show "No price on the order — invoiced in Accurate."

**Order 4 — PRODUCTION (Jiang Nan).** At the processing desk, with a cutting job: "steak cut 3 cm · lapor gram" (lapor gram = report the grams back after cutting). Payment already confirmed (auto-set for production+ stages). Also unpriced.

**Order 5 — PACKING (Wolfgang).** At the pack desk, one step before finalise. Weighed (4.05 kg) and priced (US Choice Ribeye, Rp 1,275,000). Ready to have documents printed. What to see: a weighed, priced order awaiting the "Packed & ready" action.

**Order 6 — FINALISE / Print DO/SI (Firepot Puri).** At the Admin's print desk — printing the delivery order + invoice is what releases it into dispatch. Two scallop boxes, priced.

## Part B — dispatch, every mode and sub-state

**Order 7 — DISPATCH · Awaiting Driver (Maya Pasta House).** Printed and ready, but no courier assigned yet (`taken_by`, `pickup`, `third_party` all empty). What to see: StatusPill sub-label reads **"Awaiting driver"** — the unassigned state.

**Order 8 — DISPATCH · Out for Delivery, own courier (Rifai).** Taken by Anton (`taken_by` set). A COD customer with Rp 6,400,000 to collect. What to see: sub-label **"Out for delivery"**, the "Collect COD" chip on the address, and the live courier map is trackable (for Admin/Finance/Owner). This order also has multi-cut instructions (two bags with different cuts).

**Order 9 — DISPATCH · Customer Pickup (Happy Home Bistro).** `pickup=true` — the customer is collecting rather than being delivered to. What to see: proof panel relabels to **"Proof of pickup"**, the delivery address is hidden (nothing to navigate to), and there's no live map.

**Order 10 — DISPATCH · 3rd-party courier (Tatemukai Izakaya).** `third_party=true` via Gojek (ref GK-8842119). What to see: the proof is light (handover photo only), the COD toggle is hidden ("the service collects and remits later"), and the courier service name shows.

**Order 11 — DISPATCH · Failed Attempt (Nishi Nakasu).** One failed delivery attempt logged ("Customer closed — nobody to receive"), brought back, and out again. What to see: the amber **"attempt N failed"** banner, and the previous run's proof archived to `proofLog` (evidence never deleted).

## Part C — delivered, with post-delivery variations

**Order 12 — DELIVERED · clean, terms customer (Rudy Catering).** Fully delivered and closed, delivered **today**. Proof captured, GPS stamped. Because it's a terms customer, there's **no COD reconcile row** — but the "DO/SI returned?" follow-up shows until docs are marked filed. What to see: the three-tier delivered layout, drop-location, and one pending office follow-up.

**Order 13 — DELIVERED · COD awaiting reconcile (Rifai).** Delivered yesterday, COD, cash collected at the door (`proof.cod=true`) but **not yet reconciled** at the office (`cod_reconciled=false`). What to see: the "COD cash awaiting office reconcile" follow-up, and this order appearing in the Cash-up queue. This is the classic "courier took the cash, office hasn't counted it yet" state.

**Order 14 — DELIVERED · fully closed (Eat Tells Cafe).** The complete end state: COD reconciled **and** signed DO/SI returned/filed. Delivered last week, with document numbers recorded (DO-260807-14, IPP-35611). What to see: **no follow-up rows at all** — the "Follow-ups pending" card disappears entirely because nothing's outstanding.

## Part D — off-pipeline states

**Order 15 — OUTSTANDING (K Mart Grocer).** Partial delivery: ordered 5 scallop boxes, delivered 3, **2 still owed**. Reached because the warehouse was short. What to see: the outstanding state (delivered-part, rest-owed), with the entry into the backorder flow. This is Admin's desk.

**Order 16 — AWAITING STOCK / backorder (K Mart Grocer).** The `-B` child order spawned when an outstanding order is closed with a backorder. Holds **only** the owed lines (2 boxes), payment re-gated (`confirmed:false`), with a reminder set. What to see: the grey awaiting state with "Activate — stock arrived" and "Close" options. _Note: the app schema has no `backorder_of` FK, so the parent link is in notes._

**Order 17 — AWAITING STOCK · reminder due (Jiang Nan).** Same as 16, but the reminder date has **passed**. What to see: in the prototype, it surfaces on the dashboard "Needs attention" list as "stock reminder due" with an amber bell. _Note: the app has no `remind_on` column, so this nudge may not fire — a flagged gap._

**Order 18 — ON HOLD (Yen Signature).** An order paused mid-pipeline at cold (`hold=true`, stage stays `cold`). What to see: it keeps its "Cold Storage Picking" pill but shows an "On hold" notice + Resume button, and it's **excluded** from the finance queue and pick list. This is the exact scenario you've been debugging — hold as a flag over the stage, not a stage change.

**Order 19 — CANCELLED, from intake (Warung Abdul).** A voided order, grey and terminal, with `cancelled_from='intake'`. What to see: "Restore" would return it to intake. Nothing was delivered.

## Part E — the return flow (all four buckets)

**Order 20 — RETURNED · receive bucket (Munro).** Customer refused 1 of 2 packs (quality — short-dated). Kept 1, returned 1. Sits in the **receive** bucket: Warehouse must confirm and weigh the goods back before Admin can settle. This is bucket #1.

**Order 21 — RETURNED · settle bucket (Ivy Restaurant).** Goods already received and weighed back (`return_received=true`), now waiting for Admin to settle the document and decide replacement vs close (wrong item sent, 2 packs). Bucket #2.

**Order 22 — RETURNED · sign + replacement (Wolfgang).** Admin issued a revised DO/SI, out with the courier for signing (`return_settle='sign'`), **and** it's flagged `is_replacement=true`. So it shows in **two** buckets at once — sign (#3) and replacement (#4). What to see: this is your replacement-colour test case — the pill should track its current stage, not a fixed "replacement" colour.

**Order 23 — REPLACEMENT + inbound (En Dining Senci).** The rare double state: a replacement is running through the pipeline (at cold, `is_replacement=true`) while the **original** goods are still coming back (`return_inbound=true`). This is the edge case the domain comment specifically calls out — replacement and receive active simultaneously.

## Part F — history spread (for Reports)

**Order 24 — DELIVERED · earlier this month (Ri Ri Xian).** Delivered 18 days ago, COD, fully reconciled and docs returned. Exists so the "delivered this month/year" tiles and Reports volume charts have data spread beyond today/this week — otherwise every delivered order would cluster on the same day.

**Order 25 — CANCELLED, from dispatch (Maya Pasta House).** Cancelled out of **dispatch** rather than intake (`cancelled_from='dispatch'`), COD. What to see: "Restore" would return it to **dispatch**, not intake — proving cancel can happen at any stage and restore is stage-aware.
