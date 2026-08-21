import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { products } from "../data/products.js";
import { customers as baseCustomers } from "../data/customers.js";
import { orderNo } from "./format.js";
import { t } from "./i18n.js";
import { DEMO_USERS } from "./domain.js";

const KEY = "ipp-orderflow-v7";
// Schema version stored INSIDE the blob. Bump this (not KEY) for future shape changes and add a
// migration step in migrate() — so upgrades transform data instead of silently wiping + reseeding.
const DATA_VERSION = 7;
function migrate(saved) {
  if (!saved) return saved;
  let v = saved.__v || 7;
  // The old single 'showFloorPrice' toggle became the per-role 'seePrices' capability — preserve an
  // owner who had turned it OFF for the floor.
  if (saved.settings && saved.settings.showFloorPrice === false) {
    saved.settings.permissions = saved.settings.permissions || {};
    saved.settings.permissions.seePrices = {
      ...(saved.settings.permissions.seePrices || {}),
      Warehouse: false,
      Production: false,
    };
    delete saved.settings.showFloorPrice;
  }
  // The old Void flow (removed round 74) left some orders flagged `voided` — convert them to the
  // one visible Cancelled state so the dead `!o.voided` filters could be deleted from every screen.
  if (Array.isArray(saved.orders)) {
    saved.orders = saved.orders.map((o) =>
      o && o.voided
        ? {
            ...o,
            voided: undefined,
            cancelled: true,
            stage: "cancelled",
            cancelledFrom:
              o.stage !== "cancelled" ? o.stage : o.cancelledFrom || null,
          }
        : o,
    );
  }
  saved.__v = v;
  return saved;
}

// ── EXTRA DEMO CUSTOMERS ────────────────────────────────────────────────────
// The base roster in data/customers.js has 6 names. These extras give the seed
// more variety (so the order book isn't the same 6 names repeating) WITHOUT
// having to edit data/customers.js. They cover the three payment terms so
// COD / terms / upfront states all have several customers behind them.
// Shape matches data/customers.js exactly (id, name, channel, payment, contact,
// address, area, sales, creditLimit, termDays).
const EXTRA_CUSTOMERS = [
  {
    id: "entea",
    name: "En Dining Senci",
    channel: "horeca",
    payment: { timing: "terms", method: "transfer" },
    contact: "0812-3300-1188",
    address: "Sudirman Central, Jl. Jend. Sudirman Kav. 21, Jakarta Pusat",
    area: "Jakarta Pusat",
    sales: "Disty",
    creditLimit: 40000000,
    termDays: 14,
  },
  {
    id: "tatemukai",
    name: "Tatemukai Izakaya",
    channel: "horeca",
    payment: { timing: "cod", method: "cash" },
    contact: "0813-7788-2200",
    address: "Jl. Wolter Monginsidi No. 63, Kebayoran Baru, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "firepot",
    name: "Firepot Puri",
    channel: "horeca",
    payment: { timing: "terms", method: "transfer" },
    contact: "0811-9090-4545",
    address: "Puri Indah Mall, Jl. Puri Agung, Jakarta Barat",
    area: "Jakarta Barat",
    sales: "Disty",
    creditLimit: 25000000,
    termDays: 7,
  },
  {
    id: "yensig",
    name: "Yen Signature",
    channel: "horeca",
    payment: { timing: "upfront", method: "transfer" },
    contact: "0812-1200-7788",
    address: "Pantai Indah Kapuk, Jl. Pantai Indah Utara, Jakarta Utara",
    area: "Jakarta Utara",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "ririxian",
    name: "Ri Ri Xian",
    channel: "horeca",
    payment: { timing: "cod", method: "cash" },
    contact: "0813-5566-9090",
    address: "Jl. Pluit Karang Ayu, Penjaringan, Jakarta Utara",
    area: "Jakarta Utara",
    sales: "Disty",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "nishi",
    name: "Nishi Nakasu",
    channel: "horeca",
    payment: { timing: "terms", method: "transfer" },
    contact: "0811-2323-6767",
    address: "Jl. Senopati No. 88, Kebayoran Baru, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 35000000,
    termDays: 14,
  },
  {
    id: "jiangnan",
    name: "Jiang Nan",
    channel: "horeca",
    payment: { timing: "terms", method: "transfer" },
    contact: "0812-4545-1212",
    address: "Jl. Gunawarman No. 12, Kebayoran Baru, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Disty",
    creditLimit: 50000000,
    termDays: 30,
  },
  {
    id: "mayapasta",
    name: "Maya Pasta House",
    channel: "horeca",
    payment: { timing: "cod", method: "cash" },
    contact: "0813-9898-3434",
    address: "Jl. Kemang Selatan VIII, Bangka, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "kmart",
    name: "K Mart Grocer",
    channel: "retail",
    payment: { timing: "terms", method: "transfer" },
    contact: "0811-6767-2323",
    address: "Jl. Melawai Raya No. 5, Blok M, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Disty",
    creditLimit: 60000000,
    termDays: 30,
  },
  {
    id: "happyhome",
    name: "Happy Home Bistro",
    channel: "horeca",
    payment: { timing: "upfront", method: "transfer" },
    contact: "0812-8080-5656",
    address: "Jl. Cipete Raya No. 27, Cilandak, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "eattells",
    name: "Eat Tells Cafe",
    channel: "horeca",
    payment: { timing: "cod", method: "cash" },
    contact: "0813-1313-8989",
    address: "Jl. Radio Dalam Raya No. 3, Gandaria, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Disty",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "abdul",
    name: "Warung Abdul",
    channel: "retail",
    payment: { timing: "cod", method: "cash" },
    contact: "0811-4141-7676",
    address: "Jl. Tebet Barat Dalam No. 14, Tebet, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
  {
    id: "rudy",
    name: "Rudy Catering",
    channel: "horeca",
    payment: { timing: "terms", method: "transfer" },
    contact: "0812-6262-1919",
    address: "Jl. Fatmawati Raya No. 40, Cilandak, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Disty",
    creditLimit: 20000000,
    termDays: 14,
  },
  {
    id: "disty",
    name: "Disty Kitchen",
    channel: "horeca",
    payment: { timing: "upfront", method: "transfer" },
    contact: "0813-7070-2828",
    address: "Jl. Cikajang No. 9, Kebayoran Baru, Jakarta Selatan",
    area: "Jakarta Selatan",
    sales: "Estetra",
    creditLimit: 0,
    termDays: 0,
  },
];
// Merged roster used everywhere customers are needed (seed lookups + app state).
const customers = [...baseCustomers, ...EXTRA_CUSTOMERS];

function find(kw) {
  const p = products.find((x) =>
    x.accurateName.toLowerCase().includes(kw.toLowerCase()),
  );
  return p || products[0];
}
let LID = 0;
const line = (kw, qty, unit, instruction = "", price = null) => {
  const p = find(kw);
  const cutTexts = Array.isArray(instruction)
    ? instruction
    : instruction
      ? [instruction]
      : [];
  const cuts = cutTexts.map((t) => ({ id: "c" + ++LID, text: t, done: false }));
  return {
    id: "l" + ++LID,
    productId: p.id,
    name: p.name,
    qty,
    unit,
    weight: null,
    status: "recognized",
    price,
    cuts,
  };
};
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 14, 0, 0);
  return d.toISOString();
};

// ============================================================================
//  COMPREHENSIVE SEED — one order for (nearly) every stage / state / condition
//  the prototype can represent. Each order has a NOTE above it describing what
//  it demonstrates and how to reach the interesting UI. Payment terms come from
//  the customer (COD / terms / upfront), so payment states are real.
//
//  mk(i, custId, stage, dropDays, deliverDays, lines, payOverride)
//  line(keyword, qty, unit, instruction?, price?)   daysFromNow(n)
// ============================================================================
function seed() {
  const mk = (i, custId, stage, dropDays, deliverDays, lines, payOverride) => {
    const c = customers.find((x) => x.id === custId);
    const created = daysFromNow(dropDays);
    return {
      id: "o" + i,
      no: orderNo(created, i),
      customerId: c.id,
      customerName: c.name,
      channel: c.channel || "horeca",
      createdAt: created,
      deliver: daysFromNow(deliverDays),
      sales: c.sales,
      payment: {
        ...c.payment,
        confirmed: ["production", "finalise", "dispatch", "delivered"].includes(
          stage,
        ),
        ...(payOverride || {}),
      },
      contact: c.contact,
      address: c.address,
      stage,
      lines,
      history: [
        { at: created, who: c.sales || "System", what: "Order created" },
      ],
    };
  };
  return [
    // ────────────────────────────────────────────────────────────────────────
    //  PART A — THE SIX FORWARD PIPELINE STAGES (one clean order each)
    // ────────────────────────────────────────────────────────────────────────

    // [1] INTAKE — brand-new order, Admin's desk. No weights yet, payment not
    //     confirmed. Item list is read-only (no weighing UI at intake).
    mk(1, "saffron", "intake", 0, 2, [
      line("WAGYU STRIPLOIN 8-9+ CARARA", 1, "loaf", "steak cut 2 cm", 2100000),
      line("HOKKAIDO SCALLOP 2L", 2, "box", "", 850000),
      line("SHORT RIB DICE 500 GRAM", 3, "pack", "", 95000),
    ]),

    // [2] COLD STORAGE — Warehouse weighing desk. Weight inputs + camera appear
    //     here (and only here). One line pre-weighed, one not, so the
    //     "unweighed item" hint is visible. Payment still open (runs parallel).
    mk(2, "entea", "cold", -1, 1, [
      {
        ...line("LAMB LEG BONELESS", 3, "kg"),
        weight: 3.12,
        weighings: [{ id: "w1", w: 3.12, photo: null }],
      },
      line("WAGYU CUBE ROLL 4-5+ RUBY", 1, "loaf", "cut 1.5 cm"),
    ]),

    // [3] FINANCE REVIEW — Finance's payment gate. Nishi is a TERMS customer, so
    //     Finance clears credit before it proceeds. Shows the finance-gate panel
    //     + credit exposure (for roles with seeCustomerCredit).
    mk(3, "nishi", "finance", -1, 1, [
      line("KERANG HOKKAIDO SCALLOP 2L", 1, "pack"),
    ]),

    // [4] PRODUCTION — Processing desk. Has a cutting job ("lapor gram" = report
    //     grams back). Payment already confirmed (auto-set at production+).
    mk(4, "jiangnan", "production", -1, 0, [
      line(
        "WAGYU RIBEYE 8-9+ CARARA",
        1,
        "loaf",
        "steak cut 3 cm · lapor gram",
      ),
    ]),

    // [5] PACKING — Warehouse pack desk, just before finalise. Weighed & priced,
    //     ready to have documents printed.
    mk(5, "wolfgang", "packing", -1, 0, [
      {
        ...line("US CHOICE RIBEYE IBP", 1, "loaf", "steak cut 2.5 cm", 1275000),
        weight: 4.05,
        weighings: [{ id: "w2", w: 4.05, photo: null }],
      },
    ]),

    // [6] FINALISE (Print DO/SI) — Admin prints the delivery order + invoice.
    //     This is the release point into dispatch.
    mk(6, "firepot", "finalise", -1, 0, [
      line("HOKKAIDO SCALLOP 2L", 2, "box", "", 850000),
    ]),

    // ────────────────────────────────────────────────────────────────────────
    //  PART B — DISPATCH, ALL THREE HAND-OFF MODES + SUB-STATES
    // ────────────────────────────────────────────────────────────────────────

    // [7] DISPATCH · AWAITING DRIVER — printed & ready, no courier assigned (no
    //     takenBy/pickup/thirdParty). StatusPill sub-label = "Awaiting driver".
    mk(7, "mayapasta", "dispatch", -1, 0, [
      line("TASMANIA SALMON PORTION", 3, "pack", "", 220000),
    ]),

    // [8] DISPATCH · OUT FOR DELIVERY (own courier) — taken by Anton. Sub-label
    //     = "Out for delivery". COD customer → "Collect COD" chip on the address,
    //     live courier map trackable (Admin/Finance/Owner), DriverLive publishes.
    {
      ...mk(
        8,
        "rifai",
        "dispatch",
        -1,
        0,
        [
          line(
            "A5 STRIPLOIN",
            2,
            "loaf",
            [
              "kantong 1: cut 1.5 cm",
              "kantong 2: cut 2 cm belah tengah, vacuum per pcs",
            ],
            3200000,
          ),
        ],
        { codAmount: 6400000, confirmed: true },
      ),
      takenBy: "Anton",
      takenAt: daysFromNow(0),
      address: "Jl. Senopati No. 42, Kebayoran Baru, Jakarta Selatan",
      contact: "0812-1122-3344",
    },

    // [9] DISPATCH · CUSTOMER PICKUP — pickup=true. Proof panel relabels to
    //     "Proof of pickup", address hidden, no live map (nothing to track).
    {
      ...mk(
        9,
        "happyhome",
        "dispatch",
        -1,
        0,
        [line("SHORT RIB DICE 500 GRAM", 4, "pack", "", 95000)],
        { confirmed: true },
      ),
      pickup: true,
    },

    // [10] DISPATCH · 3RD-PARTY COURIER — thirdParty=true via Gojek. Proof is
    //      light (handover photo only), COD toggle hidden. Shows courierService.
    {
      ...mk(
        10,
        "tatemukai",
        "dispatch",
        -1,
        0,
        [line("LAMB LEG BONELESS", 5, "kg", "", 90000)],
        { codAmount: 450000, confirmed: true },
      ),
      thirdParty: true,
      courierService: { name: "Gojek", ref: "GK-8842119" },
    },

    // [11] DISPATCH · FAILED ATTEMPT (redelivery) — one failed attempt logged,
    //      brought back and out again. Amber "attempt N failed" banner; proofLog
    //      holds the archived first-run evidence.
    {
      ...mk(
        11,
        "nishi",
        "dispatch",
        -3,
        -1,
        [line("WAGYU STRIPLOIN 8-9+ CARARA", 1, "loaf", "cut 2 cm", 2100000)],
        { confirmed: true },
      ),
      takenBy: "Budi",
      takenAt: daysFromNow(0),
      address: "Jl. Senopati No. 88, Kebayoran Baru, Jakarta Selatan",
      contact: "0811-2323-6767",
      failedAttempts: [
        {
          at: daysFromNow(-1),
          by: "Budi",
          reason: "Customer closed — nobody to receive",
        },
      ],
      proofLog: [
        {
          at: daysFromNow(-1),
          label: "Failed delivery attempt",
          cond: null,
          recv: null,
          signed: null,
          cod: false,
          name: "",
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────────
    //  PART C — DELIVERED, WITH ITS POST-DELIVERY VARIATIONS
    // ────────────────────────────────────────────────────────────────────────

    // [12] DELIVERED · CLEAN (terms customer) — fully delivered, closed. Proof +
    //      GPS stamped. Terms order → NO COD reconcile row; "DO/SI returned?"
    //      follow-up shows until docs marked back. Delivered TODAY.
    {
      ...mk(
        12,
        "rudy",
        "delivered",
        -2,
        0,
        [
          {
            ...line(
              "FOIE GRAS / HATI ANGSA SLICE 1 KG",
              2,
              "pack",
              "",
              1050000,
            ),
            delivered: 2,
          },
        ],
        { confirmed: true },
      ),
      deliveredAt: daysFromNow(0),
      takenBy: "Anton",
      proof: {
        cond: null,
        recv: null,
        signed: null,
        cod: false,
        name: "Chef Rudy",
      },
      pickupGeo: { lat: -6.2088, lng: 106.8456, at: daysFromNow(0) },
      deliverGeo: { lat: -6.2091, lng: 106.8461, at: daysFromNow(0) },
    },

    // [13] DELIVERED · COD AWAITING RECONCILE — COD customer, cash collected at
    //      door (proof.cod=true) but NOT yet reconciled (codReconciled=false).
    //      Shows the "COD cash awaiting office reconcile" follow-up + Cash-up row.
    {
      ...mk(
        13,
        "rifai",
        "delivered",
        -1,
        -1,
        [
          {
            ...line(
              "WAGYU CUBE ROLL 4-5+ RUBY",
              1,
              "loaf",
              "cut 2 cm",
              2100000,
            ),
            delivered: 1,
          },
        ],
        { codAmount: 2100000, confirmed: true, codReconciled: false },
      ),
      deliveredAt: daysFromNow(-1),
      takenBy: "Anton",
      proof: { cond: null, recv: null, signed: null, cod: true, name: "Rifai" },
      deliverGeo: { lat: -6.2445, lng: 106.7998, at: daysFromNow(-1) },
    },

    // [14] DELIVERED · COD RECONCILED + DOCS RETURNED — the fully-closed end
    //      state: cash reconciled AND signed DO/SI filed → NO follow-up rows at
    //      all (the "Follow-ups pending" card disappears). Delivered last week.
    {
      ...mk(
        14,
        "eattells",
        "delivered",
        -6,
        -5,
        [
          {
            ...line("SHORT RIB DICE 500 GRAM", 4, "pack", "", 95000),
            delivered: 4,
          },
        ],
        { codAmount: 380000, confirmed: true, codReconciled: true },
      ),
      deliveredAt: daysFromNow(-5),
      takenBy: "Budi",
      docsReturned: true,
      documents: [
        { type: "DO", no: "DO-260807-14" },
        { type: "SI", no: "IPP-35611" },
      ],
      proof: {
        cond: null,
        recv: null,
        signed: null,
        cod: true,
        name: "Eat Tells staff",
      },
    },

    // ────────────────────────────────────────────────────────────────────────
    //  PART D — OFF-PIPELINE STATES
    // ────────────────────────────────────────────────────────────────────────

    // [15] OUTSTANDING — partial delivery. Ordered 5 box, delivered 3, 2 owed
    //      (sent set, remainder outstanding). Admin's desk; entry to backorder.
    {
      ...mk(
        15,
        "kmart",
        "outstanding",
        -2,
        -1,
        [
          {
            ...line("HOKKAIDO SCALLOP 2L", 5, "box", "", 850000),
            delivered: 3,
            sent: 3,
          },
        ],
        { confirmed: true },
      ),
      deliveredAt: daysFromNow(-1),
      takenBy: "Anton",
      proof: {
        cond: null,
        recv: null,
        signed: null,
        cod: false,
        name: "K Mart receiving",
      },
    },

    // [16] AWAITING STOCK (backorder) — the "-B" child spawned when an
    //      outstanding order is closed with a backorder. Holds ONLY the owed
    //      lines, payment re-gated (confirmed:false), reminder set. Grey.
    //      "Activate — stock arrived" sends it back to cold.
    {
      ...mk(
        16,
        "kmart",
        "awaiting",
        -1,
        2,
        [line("HOKKAIDO SCALLOP 2L", 2, "box", "", 850000)],
        { confirmed: false },
      ),
      backorderOf: "260810-15",
      remindOn: daysFromNow(1),
    },

    // [17] AWAITING STOCK · REMINDER DUE — same state but the reminder date has
    //      PASSED → surfaces on the dashboard "Needs attention" as "stock
    //      reminder due" with an amber bell.
    {
      ...mk(
        17,
        "jiangnan",
        "awaiting",
        -5,
        -1,
        [line("WAGYU RIBEYE 8-9+ CARARA", 1, "loaf", "", 1900000)],
        { confirmed: false },
      ),
      backorderOf: "260806-99",
      remindOn: daysFromNow(-2),
    },

    // [18] ON HOLD — an order paused mid-pipeline (hold=true) at cold. Excluded
    //      from the finance queue and pick list. "Resume" returns it to flow.
    {
      ...mk(18, "yensig", "cold", -1, 1, [
        line("WAGYU STRIPLOIN 8-9+ CARARA", 1, "loaf", "cut 2 cm", 2100000),
      ]),
      hold: true,
    },

    // [19] CANCELLED (from intake) — order voided. Grey, terminal. "Restore"
    //      returns it to where it was cancelled from (cancelledFrom).
    {
      ...mk(19, "abdul", "cancelled", -3, -1, [
        line("SHORT RIB DICE 500 GRAM", 2, "pack", "", 95000),
      ]),
      cancelledFrom: "intake",
    },

    // ────────────────────────────────────────────────────────────────────────
    //  PART E — THE RETURN FLOW (all four return buckets)
    // ────────────────────────────────────────────────────────────────────────

    // [20] RETURNED · RECEIVE bucket — customer refused 1 of 2 packs (quality).
    //      Kept 1, returned 1. Sits in 'receive': Warehouse must confirm & weigh
    //      the goods back before Admin can settle. Bucket #1.
    {
      ...mk(
        20,
        "munro",
        "returned",
        -2,
        -2,
        [
          {
            ...line("SHORT RIB DICE 500 GRAM", 2, "pack", "", 95000),
            delivered: 1,
            returned: 1,
          },
        ],
        { confirmed: true },
      ),
      returnReceived: false,
      partialReturn: true,
      returnedReason: "Quality — 1 pack short-dated on arrival",
    },

    // [21] RETURNED · SETTLE bucket — goods already received & weighed back
    //      (returnReceived=true), now waiting for Admin to settle the document
    //      and decide replacement vs close. Bucket #2.
    {
      ...mk(
        21,
        "ivy",
        "returned",
        -3,
        -3,
        [
          {
            ...line("TASMANIA SALMON PORTION", 4, "pack", "", 220000),
            delivered: 2,
            returned: 2,
          },
        ],
        { confirmed: true },
      ),
      returnReceived: true,
      returnReceivedAt: daysFromNow(-2),
      partialReturn: true,
      returnedReason: "Wrong item sent — 2 packs",
    },

    // [22] RETURNED · SIGN + REPLACEMENT — Admin issued a revised DO/SI, out with
    //      the courier for signing (returnSettle='sign'), AND isReplacement=true.
    //      Shows in BOTH the 'sign' (#3) and 'replacement' (#4) buckets. Because
    //      isReplacement + stage not delivered/cancelled, its pill colour should
    //      track its CURRENT stage, not a fixed "replacement" colour.
    {
      ...mk(
        22,
        "wolfgang",
        "returned",
        -4,
        -4,
        [
          {
            ...line("US CHOICE RIBEYE IBP", 1, "loaf", "", 1275000),
            delivered: 0,
            returned: 1,
          },
        ],
        { confirmed: true },
      ),
      returnReceived: true,
      returnReceivedAt: daysFromNow(-3),
      returnSettle: "sign",
      returnDoc: "DO-RET-260805-22",
      isReplacement: true,
      returnedReason: "Damaged in transit — full replacement issued",
    },

    // [23] REPLACEMENT + INBOUND — replacement running through the pipeline while
    //      the ORIGINAL goods are still coming back (returnInbound=true → also in
    //      'receive'). The rare double state (replacement AND receive at once).
    {
      ...mk(
        23,
        "entea",
        "cold",
        -2,
        1,
        [
          {
            ...line("LAMB LEG BONELESS", 4, "kg", "", 90000),
            inboundReturn: 4,
          },
        ],
        { confirmed: true },
      ),
      isReplacement: true,
      returnInbound: true,
      returnReceived: false,
      returnDoc: "DO-RET-260808-23",
    },

    // ────────────────────────────────────────────────────────────────────────
    //  PART F — HISTORY SPREAD (feeds Reports + period tiles)
    // ────────────────────────────────────────────────────────────────────────

    // [24] DELIVERED · earlier this month — so the "delivered this month/year"
    //      tiles and Reports charts have spread beyond today/this week.
    {
      ...mk(
        24,
        "ririxian",
        "delivered",
        -20,
        -18,
        [
          {
            ...line("WAGYU STRIPLOIN 8-9+ CARARA", 2, "loaf", "", 2100000),
            delivered: 2,
          },
        ],
        { codAmount: 4200000, confirmed: true, codReconciled: true },
      ),
      deliveredAt: daysFromNow(-18),
      takenBy: "Anton",
      docsReturned: true,
      proof: {
        cond: null,
        recv: null,
        signed: null,
        cod: true,
        name: "Ri Ri Xian staff",
      },
    },

    // [25] CANCELLED · from a later stage — cancelled out of dispatch (not
    //      intake), so "Restore" would put it back at dispatch. Cancel can
    //      happen anywhere; restore is stage-aware.
    {
      ...mk(
        25,
        "mayapasta",
        "cancelled",
        -4,
        -2,
        [line("SHORT RIB DICE 500 GRAM", 3, "pack", "", 95000)],
        { codAmount: 285000, confirmed: true },
      ),
      cancelledFrom: "dispatch",
    },
  ];
}

// requirePhoto: warehouse must attach ≥1 proof photo per item before releasing.
// tolBelowPct/tolAbovePct: how far a weighed total may fall below / rise above the ordered
// kg before a (non-blocking) "short?/over?" hint shows. All editable in Settings.
// permissions = sparse per-role capability overrides (see domain.can / DEFAULT_PERMISSIONS); {} = all defaults.
const DEFAULT_SETTINGS = {
  requirePhoto: false,
  tolBelowPct: 10,
  tolAbovePct: 10,
  dispatchProofRequired: true,
  permissions: {},
};
// Real named team members (multiple per role) so history.who is a real person, not the role.
const seedUsers = () =>
  DEMO_USERS.map((u, i) => ({
    id: "u" + i,
    name: u.name,
    role: u.role,
    active: true,
  }));

const initial = () => {
  try {
    const saved = migrate(JSON.parse(localStorage.getItem(KEY)));
    if (saved && saved.orders)
      return {
        user: saved.user || null,
        orders: saved.orders,
        customers: saved.customers || customers,
        products: saved.products || products,
        lang: saved.lang || "en",
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        users: saved.users || seedUsers(),
      };
  } catch {
    /* ignore */
  }
  return {
    user: null,
    orders: seed(),
    customers,
    products,
    lang: "en",
    settings: { ...DEFAULT_SETTINGS },
    users: seedUsers(),
  };
};

function reducer(state, a) {
  switch (a.type) {
    case "login":
      return { ...state, user: a.user };
    case "logout":
      return { ...state, user: null };
    case "create":
      return { ...state, orders: [a.order, ...state.orders] };
    case "save":
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === a.order.id ? a.order : o)),
      };
    case "delete":
      return { ...state, orders: state.orders.filter((o) => o.id !== a.id) };
    case "addCustomer":
      return { ...state, customers: [...state.customers, a.customer] };
    case "updateCustomer":
      return {
        ...state,
        customers: state.customers.map((c) =>
          c.id === a.customer.id ? { ...c, ...a.customer } : c,
        ),
      };
    case "addProduct":
      return { ...state, products: [a.product, ...state.products] };
    case "updateProduct":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === a.product.id ? { ...p, ...a.product } : p,
        ),
      };
    case "removeProduct":
      return {
        ...state,
        products: state.products.filter((p) => p.id !== a.id),
      };
    case "importCustomers":
      return { ...state, customers: a.customers };
    case "importProducts":
      return { ...state, products: a.products };
    case "setLang":
      return { ...state, lang: a.lang };
    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case "reset": {
      const s = {
        user: state.user,
        orders: seed(),
        customers,
        products,
        lang: state.lang,
        settings: state.settings,
        users: state.users,
      };
      return s;
    }
    case "hydrate":
      return { ...state, ...a.state, user: state.user }; // pull in another tab's changes, keep this tab's user (non-destructive)
    case "addUser":
      return { ...state, users: [...state.users, a.user] };
    case "updateUser":
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === a.user.id ? { ...u, ...a.user } : u,
        ),
      };
    case "removeUser":
      return { ...state, users: state.users.filter((u) => u.id !== a.id) };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  // Signature of the SHARED data (everything except this tab's logged-in user). Used to tell a real
  // cross-tab change apart from an echo of our own write — see the storage listener below.
  // useMemo — this serializes the ENTIRE order book; without it every keystroke-triggered render
  // re-stringified everything (typing got slower as the book grew) for a value only storage events read.
  const sharedSig = useMemo(
    () =>
      JSON.stringify({
        orders: state.orders,
        customers: state.customers,
        products: state.products,
        lang: state.lang,
        settings: state.settings,
        users: state.users,
      }),
    [
      state.orders,
      state.customers,
      state.products,
      state.lang,
      state.settings,
      state.users,
    ],
  );
  const sharedSigRef = useRef(sharedSig);
  sharedSigRef.current = sharedSig;
  const lastSavedRef = useRef("");
  const quotaWarnedRef = useRef(false);

  useEffect(() => {
    try {
      const payload = JSON.stringify({
        __v: DATA_VERSION,
        user: state.user,
        orders: state.orders,
        customers: state.customers,
        products: state.products,
        lang: state.lang,
        settings: state.settings,
        users: state.users,
      });
      if (payload === lastSavedRef.current) return; // nothing actually changed — don't rewrite (avoids needless storage events)
      lastSavedRef.current = payload;
      localStorage.setItem(KEY, payload);
      quotaWarnedRef.current = false;
    } catch (e) {
      // Storage full or unavailable (private mode / quota). Don't crash the app — but the user MUST
      // know their work is no longer being saved (a console line alone hid this completely).
      console.error(
        "IPP OrderFlow: could not save to local storage (full or unavailable).",
        e,
      );
      if (!quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        window.alert(
          t(
            "Storage is full — changes are NOT being saved! Back up now (Settings → Backup) and delete old orders, or contact support.",
          ),
        );
      }
    }
  }, [
    state.user,
    state.orders,
    state.customers,
    state.products,
    state.lang,
    state.settings,
    state.users,
  ]);

  // Cross-tab/device-on-same-browser sync: when another tab saves, reflect its data here so the
  // two tabs don't silently clobber each other (the warehouse's weighing won't get reverted by
  // Finance saving from another tab). Keeps THIS tab's logged-in user.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const saved = migrate(JSON.parse(e.newValue));
        if (!saved || !saved.orders) return;
        const incoming = {
          orders: saved.orders,
          customers: saved.customers || customers,
          products: saved.products || products,
          lang: saved.lang || "en",
          settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
          users: saved.users || seedUsers(),
        };
        // Only hydrate if the shared data ACTUALLY differs from ours. Without this, two open tabs
        // ping-pong forever: each hydrate makes fresh object refs → re-fires our save effect → the
        // other tab's storage event → hydrate → … which the user sees as the UI flickering.
        if (JSON.stringify(incoming) === sharedSigRef.current) return;
        dispatch({ type: "hydrate", state: incoming });
      } catch (err) {
        /* ignore a bad cross-tab payload */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const api = {
    ...state, // products now live in state (editable + persisted), seeded from data/products.js
    login: (user) => dispatch({ type: "login", user }),
    logout: () => dispatch({ type: "logout" }),
    createOrder: (order) => dispatch({ type: "create", order }),
    saveOrder: (order) => dispatch({ type: "save", order }),
    deleteOrder: (id) => dispatch({ type: "delete", id }),
    addUser: (u) => dispatch({ type: "addUser", user: u }),
    updateUser: (u) => dispatch({ type: "updateUser", user: u }),
    removeUser: (id) => dispatch({ type: "removeUser", id }),
    addCustomer: (customer) => dispatch({ type: "addCustomer", customer }),
    updateCustomer: (customer) =>
      dispatch({ type: "updateCustomer", customer }),
    addProduct: (product) => dispatch({ type: "addProduct", product }),
    updateProduct: (product) => dispatch({ type: "updateProduct", product }),
    removeProduct: (id) => dispatch({ type: "removeProduct", id }),
    importCustomers: (list) =>
      dispatch({ type: "importCustomers", customers: list }),
    importProducts: (list) =>
      dispatch({ type: "importProducts", products: list }),
    setLang: (lang) => dispatch({ type: "setLang", lang }),
    updateSettings: (patch) => dispatch({ type: "updateSettings", patch }),
    t: (key) => t(key, state.lang),
    resetData: () => dispatch({ type: "reset" }),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
