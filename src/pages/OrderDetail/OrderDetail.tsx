import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { PhotoUploadButton } from "../../components/PhotoUploadButton/PhotoUploadButton";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Avatar } from "../../components/Avatar/Avatar";
import { CourierLiveLocation } from "../../components/CourierLiveLocation/CourierLiveLocation";
import { useDriverLive } from "../../components/CourierLiveLocation/useDriverLive";
import { useAuth, useCurrentUserId } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useDialog } from "../../hooks/useDialog";
import { useSettings } from "../../hooks/useSettings";
import { getInitials } from "../../lib/initials";
import {
  readOrder,
  readOrders,
  readOrderLines,
  readOrderHistory,
  readAttachments,
  readCustomers,
  updateCustomer,
  appendOrderHistory,
  updateOrder,
  createAttachment,
  deleteAttachment,
  uploadFile,
  readAllUsers,
  readLineCuts,
  getAssetUrl,
  readLineWeighings,
  createLineWeighing,
  updateLineWeighing,
  deleteLineWeighing,
  readLinePhotos,
  createLinePhoto,
  deleteLinePhoto,
  readLineWeighingPhotos,
  createLineWeighingPhoto,
  deleteLineWeighingPhoto,
  updateOrderLine,
  createLineReturnPhoto,
  readLineReturnPhotos,
  deleteLineReturnPhoto,
  readReturnDocuments,
  createReturnDocument,
  createDeliveryProof,
  readDeliveryProofs,
  updateDeliveryProof,
  getNextOrderNo,
  createOrder,
  createOrderLines,
  createLineCut,
  updateLineCut,
  type CreateOrderLineInput,
} from "../../lib/directus";
import type {
  OrdersCollection,
  OrderLinesCollection,
  OrderHistoryCollection,
  AttachmentsCollection,
  CustomersCollection,
  UserBrief,
  LineCutsCollection,
  ReturnDocumentsCollection,
  DeliveryProofsCollection,
  GeoStamp,
  UndoSnapshot,
} from "../../types/directus";
import {
  ACTOR,
  returnBucketsForOrder,
  STAGE_LABELS,
  PIPELINE_STAGES,
  dispatchSubStatus,
  isOrderLocked,
  type ReturnStage,
} from "../../lib/pipeline";
import { redactHistoryPrices } from "../../lib/redactHistory";
import { formatClock } from "../../lib/format";
import { ReturnLineBox } from "../../components/ReturnLineBox/ReturnLineBox";
import { dateCode } from "../../lib/orderNo";
import { ImageDetailsModal } from "../../components/ImageDetailsModal/ImageDetailsModal";
import styles from "./OrderDetail.module.css";

/**
 * Loaf/kg/gram lines need a scale weight at Cold Storage. Case-insensitive
 * on purpose: `OrderNew.tsx`'s unit dropdown writes lowercase ("loaf"),
 * `OrderEdit.tsx`'s writes capitalized ("Loaf") — a line created via New
 * Order and never touched in Edit would otherwise silently skip weighing
 * forever (a real bug: it flipped into "needs weighing" only once someone
 * happened to re-save its unit through Edit's differently-cased dropdown,
 * which read as the requirement changing on its own).
 */
function isWeighedUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").toLowerCase();
  return u === "loaf" || u === "kg" || u === "gram";
}

/**
 * Narrower than `isWeighedUnit` — kg/gram only, no Loaf. Matches the
 * prototype's own split (`Dev-domain.js:32,35`: `isWeightUnit` vs
 * `isWeighed = isWeightUnit || loaf`): the over/under-order tolerance hint
 * only ever applied to true weight units there, since a Loaf's "ordered
 * qty" is a piece count, not a weight — comparing a kg total against a
 * loaf count as if they were the same measure never made sense.
 */
function isWeightOnlyUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").toLowerCase();
  return u === "kg" || u === "gram";
}

/** A line's price as a number, `0` for anything unparseable. Only for
 *  *computing* totals — presence checks must go through `lineHasPrice`
 *  below, not compare this against `null`/`""`. */
function linePriceValue(p: unknown): number {
  return typeof p === "string"
    ? parseFloat(p) || 0
    : typeof p === "number"
      ? p
      : 0;
}

/** Whether a line has a REAL price — a positive number. Ported from the
 *  prototype's truthy `l.price` check (`Dev-OrderDetail.jsx`): `null`,
 *  `undefined`, `""`, AND `0` all count as "no price, invoiced in Accurate."
 *  The port previously tested `price != null && price !== ""`, which reads
 *  a `0` price as "priced" — rendering a "Rp 0" chip the prototype never
 *  shows. */
function lineHasPrice(l: { price?: unknown }): boolean {
  return linePriceValue(l.price) > 0;
}

/**
 * How a customer return is settled in Accurate. The choice drives whether a
 * replacement re-enters the pipeline (→ Cold Storage) or the return simply
 * closes. Ported from the prototype's RETURN_DOC_OPTIONS (OrderDetail.jsx).
 */
const RETURN_DOC_OPTIONS = [
  {
    key: "return-note",
    label: "Sales Return Note (no replacement)",
    replacement: false,
  },
  {
    key: "revise-return",
    label: "Revise DO/SI — return only",
    replacement: false,
  },
  {
    key: "single-replace",
    label: "Revised DO/SI — return + replacement",
    replacement: true,
  },
  {
    key: "separate-replace",
    label: "Sales Return Note + replacement with new DO/SI",
    replacement: true,
  },
] as const;

/** Labels for `return_documents.kind` — see `target-db-schema.md`'s
 *  `return_documents` entry. `signed_draft` is unused by this port today (no
 *  intermediate courier-carries-it-for-signing capture step exists here),
 *  kept only so an unexpected row still renders something sensible. */
const RETURN_DOC_KIND_LABELS: Record<string, string> = {
  signed_doc: "Signed DO/SI",
  signed_draft: "Signed DO/SI (draft)",
  note: "Return note",
};

/* ─────────────────────────────────────── pipeline definition ── */

const STAGE_FLOW: Record<
  string,
  {
    next: string | null;
    prev: string | null;
    capability:
      | "advanceStage"
      | "approveFinance"
      | "weighColdStorage"
      | "cutProduction"
      | "packWarehouse"
      | "dispatch";
    advanceLabel: string;
  }
> = {
  intake: {
    next: "cold",
    prev: null,
    capability: "advanceStage",
    advanceLabel: "Send to Cold Storage",
  },
  cold: {
    next: "production",
    prev: "intake",
    capability: "weighColdStorage",
    advanceLabel: "Weighed — release",
  },
  finance: {
    next: null,
    prev: "cold",
    capability: "approveFinance",
    advanceLabel: "Approve Payment",
  },
  production: {
    next: "packing",
    prev: "cold",
    capability: "cutProduction",
    advanceLabel: "Done — Send to Packing",
  },
  packing: {
    next: "finalise",
    prev: "production",
    capability: "packWarehouse",
    advanceLabel: "Packed & Ready",
  },
  finalise: {
    next: "dispatch",
    prev: "packing",
    capability: "advanceStage",
    advanceLabel: "Ready — Send to Dispatch",
  },
  dispatch: {
    next: "delivered",
    prev: "finalise",
    capability: "dispatch",
    advanceLabel: "Mark as Delivered",
  },
  delivered: {
    next: null,
    prev: "dispatch",
    capability: "advanceStage",
    advanceLabel: "",
  },
};

const DOC_TYPES = ["DO", "SI", "Return Note", "PO", "Other"] as const;

/** 3rd-party hand-off service options — brand names, not translated. */
const THIRD_PARTY_SERVICES = [
  "Gojek",
  "Grab",
  "Paxel",
  "Lalamove",
  "Other",
] as const;

/** One-tap reasons required when a COD delivery leaves a shortfall. */
const OUTSTANDING_REASONS = [
  { key: "will_transfer", label: "Will transfer" },
  { key: "paid_part", label: "Paid part" },
  { key: "no_cash", label: "No cash on site" },
] as const;

/* ─────────────────────────────────────── helpers ── */

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (withTime) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "Tuesday 11 August 2026  13:52" — the delivery-proof "taken by" timestamp format. */
function formatTakenAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}  ${time}`;
}

/** Best-effort GPS fix — resolves `null` on denial/timeout/unsupported
 *  browser rather than rejecting, so callers never need a try/catch just to
 *  keep going without a location. Never blocks the caller's own action. */
function captureGeoStamp(): Promise<{
  lat: number;
  lng: number;
  at: string;
} | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: new Date().toISOString(),
        }),
      () => resolve(null),
      { timeout: 8000 },
    );
  });
}

/** Great-circle distance in meters between two lat/lng points. */
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface WeighingLine {
  id: string;
  weight: string;
  photos: { id: string; fileId: string; url: string }[];
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  /** Where "Back" should return to — set by whoever linked here (Orders,
   *  Dashboard, a customer's order history, a notification). Falls back to
   *  the orders list rather than `navigate(-1)`, which can land on an
   *  intermediate page like the just-submitted "New Order" form. */
  const backTo =
    (location.state as { from?: string } | null)?.from ?? "/orders";
  const auth = useAuth();
  const userId = useCurrentUserId();
  const { t } = useLanguage();
  const { alert, confirm, prompt } = useDialog();
  const { settings: opsSettings } = useSettings();
  const proofRequired = opsSettings?.dispatch_proof_required === true;
  const requirePhoto = opsSettings?.require_photo === true;

  /* ── data state ── */
  const [order, setOrder] = useState<OrdersCollection | null>(null);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);
  const [history, setHistory] = useState<OrderHistoryCollection[]>([]);
  const [attachments, setAttachments] = useState<AttachmentsCollection[]>([]);
  const [customers, setCustomers] = useState<CustomersCollection[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineCutsByLine, setLineCutsByLine] = useState<
    Record<string, LineCutsCollection[]>
  >({});

  /* ── ui state ── */
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [activeImageModal, setActiveImageModal] = useState<{
    url: string;
    title: string;
    attachmentId?: number | string;
    lineId?: string;
    photoId?: string;
    weighingLineId?: string;
    weighingId?: string;
    weighingPhotoId?: string;
    receiveLineId?: string;
    receivePhotoId?: string;
    /** A staged (not-yet-confirmed) delivery-proof photo — see handleRemoveStagedProofPhoto. */
    stagedProofSlot?: "cond" | "recv" | "signed";
    stagedProofIndex?: number;
  } | null>(null);

  /* ── action state ── */
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  /* ── returns sub-flow state ── */
  const [returnDocs, setReturnDocs] = useState<ReturnDocumentsCollection[]>([]);
  const [showRefuseForm, setShowRefuseForm] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [refuseQtyMap, setRefuseQtyMap] = useState<Record<string, string>>({});
  const [refusePhotosMap, setRefusePhotosMap] = useState<
    Record<string, { id: string; fileId: string; url: string }[]>
  >({});
  const [submittingRefusal, setSubmittingRefusal] = useState(false);
  const [receiveQtyMap, setReceiveQtyMap] = useState<Record<string, string>>(
    {},
  );
  // Multi-photo scale/condition evidence for a returned line, shared by the
  // "Awaiting Return" bucket and the Incoming Return card (whichever entry
  // point receives the goods back) — same shape and `line_return_photos`
  // backing as `refusePhotosMap`, just persistent/reloaded rather than reset
  // per form-open, since receiving can happen in a later session.
  const [receivePhotosMap, setReceivePhotosMap] = useState<
    Record<string, { id: string; fileId: string; url: string }[]>
  >({});
  const [confirmingReceive, setConfirmingReceive] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  // Required gate on the return-note path only — matches the prototype's
  // `retPrinted` checkbox (Dev-OrderDetail.jsx:1246), confirming the note
  // was actually entered in Accurate before the order can close.
  const [retPrinted, setRetPrinted] = useState(false);
  const [confirmingSettle, setConfirmingSettle] = useState(false);
  const [signedDocFileId, setSignedDocFileId] = useState<string | null>(null);
  const [closingSigned, setClosingSigned] = useState(false);
  const [noteFileIds, setNoteFileIds] = useState<string[]>([]);
  const [confirmingInbound, setConfirmingInbound] = useState(false);
  const [undoingInbound, setUndoingInbound] = useState(false);

  /* ── hand-off mode chooser (dispatch stage) ── */
  const [choosingMode, setChoosingMode] = useState(false);
  const [showThirdPartyForm, setShowThirdPartyForm] = useState(false);
  const [thirdPartyService, setThirdPartyService] = useState<string>(
    THIRD_PARTY_SERVICES[0],
  );
  const [thirdPartyRef, setThirdPartyRef] = useState("");

  /* ── delivery proof (Mark as Delivered / picked up / handed over) state ──
   * Multiple photos per slot, staged locally (uploaded to Directus Files but
   * not yet attached to any order/proof record) until the attempt either
   * confirms or is abandoned — see handleConfirmDelivery/archiveDraftAttempt. */
  const [condPhotos, setCondPhotos] = useState<
    { fileId: string; url: string }[]
  >([]);
  const [recvPhotos, setRecvPhotos] = useState<
    { fileId: string; url: string }[]
  >([]);
  const [signedPhotos, setSignedPhotos] = useState<
    { fileId: string; url: string }[]
  >([]);
  // A real <button> nested inside a <label> breaks the browser's native
  // label-click-to-input delegation (the button intercepts the click as its
  // own interactive element) — trigger the hidden file inputs via ref instead.
  const condFileInputRef = useRef<HTMLInputElement>(null);
  const recvFileInputRef = useRef<HTMLInputElement>(null);
  const signedFileInputRef = useRef<HTMLInputElement>(null);
  const [receiverName, setReceiverName] = useState("");
  /** COD payment outcome for this attempt — never gates delivery, only how
   *  it's recorded (see handleConfirmDelivery). Null until the courier
   *  records one; "none" is always a valid, honest choice. */
  const [codOutcome, setCodOutcome] = useState<
    "full" | "partial" | "none" | null
  >(null);
  const [partialAmountInput, setPartialAmountInput] = useState("");
  /** Required one-tap reason when the recorded outcome leaves a shortfall. */
  const [outstandingReason, setOutstandingReason] = useState<string | null>(
    null,
  );
  const [uploadingProofSlot, setUploadingProofSlot] = useState<
    "cond" | "recv" | "signed" | null
  >(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  /** Best-effort GPS fix at condition-photo capture (own-courier hand-off
   *  only) — staged locally like the photos, written to the order at
   *  confirm time alongside a fresh `deliverGeo` fix. Never blocks delivery. */
  const [pickupGeo, setPickupGeo] = useState<GeoStamp | null>(null);
  const [reconcilingCod, setReconcilingCod] = useState(false);
  const [approvingFinance, setApprovingFinance] = useState(false);
  /* Finance gate form state — mirrors the prototype's `fMethod`/`fTiming`/
   * `fPay`/`verified` (Dev-OrderDetail.jsx renderFinanceGate). "cod" timing
   * is deliberately not an option here — the port's delivery-time COD
   * outcome capture is COD's single source of truth. */
  const [financeMethod, setFinanceMethod] = useState<"transfer" | "cash">(
    "transfer",
  );
  const [financeTiming, setFinanceTiming] = useState<"upfront" | "terms">(
    "upfront",
  );
  /** Tracks which `${order.id}:${customer.id}` pairing `financeTiming` was
   *  last resynced from — see the render-time sync below (`customerTimingKey`). */
  const [syncedTimingKey, setSyncedTimingKey] = useState<string | undefined>();
  const [financeAmount, setFinanceAmount] = useState("");
  const [financeBankRef, setFinanceBankRef] = useState("");
  const [financeVerified, setFinanceVerified] = useState(false);
  /** Sum of this customer's other non-terminal orders' value, for the
   *  Terms-timing credit-limit check — fetched lazily (see the effect
   *  below), not part of the initial page-load batch. */
  const [customerExposure, setCustomerExposure] = useState(0);
  /** The current (non-archived) delivery_proofs row for this order, if any —
   *  drives the read-only post-confirm view. */
  const [activeProof, setActiveProof] =
    useState<DeliveryProofsCollection | null>(null);

  /* ── document form ── */
  const [docType, setDocType] = useState<string>("DO");
  const [docNumber, setDocNumber] = useState("");
  const [docNote, setDocNote] = useState("");
  const [docFileId, setDocFileId] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  /* ── Finalise stage's own "DO/SI printed" quick action — separate from
   *  the general Documents-card form above, matching the prototype's own
   *  `relDoc` (Dev-OrderDetail.jsx:101,784-798): a single optional number
   *  field, logging is a side-effect of the "printed" action, not a
   *  separate manual step. */
  const [finaliseDocNumber, setFinaliseDocNumber] = useState("");

  /* ── weighing lines & item photos local state ── */
  const [weighingsMap, setWeighingsMap] = useState<
    Record<string, WeighingLine[]>
  >({});
  const [itemPhotosMap, setItemPhotosMap] = useState<
    Record<string, { id: string; fileId: string; url: string }[]>
  >({});
  const [sendingQtyMap, setSendingQtyMap] = useState<Record<string, number>>(
    {},
  );
  // Local-only tick-off state for the Production "Cut · tick each cutting"
  // card — mirrors the prototype's own local `cut` state (Dev-OrderDetail.jsx:754):
  // ticking a box doesn't write anything until "Cutting done → to packing"
  // is actually clicked, same as this file's other stage-action cards.
  const [cutDoneMap, setCutDoneMap] = useState<Record<string, boolean>>({});

  /* ── user's name state ── */
  const [users, setUsers] = useState<UserBrief[]>([]);

  /* ────────────── load data ── */
  useEffect(() => {
    const orderId = id as string;
    if (!orderId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [
        orderRes,
        linesRes,
        historyRes,
        attachmentsRes,
        customersRes,
        usersRes,
        returnDocsRes,
        deliveryProofsRes,
      ] = await Promise.all([
        readOrder(orderId),
        readOrderLines({ filter: { order_id: { _eq: orderId } } }),
        readOrderHistory(orderId),
        readAttachments(orderId),
        readCustomers({ limit: -1 }),
        readAllUsers(),
        readReturnDocuments(orderId),
        readDeliveryProofs([orderId]),
      ]);

      if (cancelled) return;

      if (orderRes.error) {
        setError(`Failed to load order: ${orderRes.error}`);
        setLoading(false);
        return;
      }
      if (linesRes.error) {
        setError(`Failed to load order lines: ${linesRes.error}`);
        setLoading(false);
        return;
      }

      setOrder(orderRes.data);
      const loadedLines = linesRes.data ?? [];
      setLines(loadedLines);
      setHistory(historyRes.data ?? []);
      setAttachments(attachmentsRes.data ?? []);
      setCustomers(customersRes.data ?? []);
      setUsers(usersRes.data ?? []);
      setReturnDocs(returnDocsRes.data ?? []);
      setActiveProof(deliveryProofsRes.data?.[0] ?? null);
      setLines(loadedLines);

      // initialize sending qty state for lines
      const initialSending: Record<string, number> = {};

      // cut lines state for lines
      const cutsRes = await readLineCuts(loadedLines.map((l) => l.id));
      const grouped: Record<string, LineCutsCollection[]> = {};
      (cutsRes.data ?? []).forEach((c) => {
        (grouped[c.line_id] ??= []).push(c);
      });
      setLineCutsByLine(grouped);

      loadedLines.forEach((line) => {
        if (line.id) {
          const qtyNum =
            typeof line.qty === "string"
              ? parseFloat(line.qty)
              : (line.qty ?? 1);
          // Prefer the persisted `sent` value — falling back to the full
          // qty (nothing short yet) only when it's never been set. Without
          // this, every page load/every viewer reset "sending" back to the
          // full qty regardless of what Warehouse actually entered — the
          // real bug behind Finance seeing "3 of 3" after Warehouse saved
          // "2 of 3": `sent` was never read from (or written to) the
          // database at all, purely local per-tab React state.
          const sentNum =
            typeof line.sent === "string" ? parseFloat(line.sent) : line.sent;
          initialSending[line.id] =
            sentNum != null && !Number.isNaN(sentNum) ? sentNum : qtyNum;
        }
      });
      setSendingQtyMap(initialSending);

      const weighingsRes = await readLineWeighings(
        loadedLines.map((l) => l.id),
      );
      const allWeighings = weighingsRes.data ?? [];

      const weighingPhotosRes = await readLineWeighingPhotos(
        allWeighings.map((w) => w.id),
      );
      const photosByWeighing: Record<
        string,
        { id: string; fileId: string; url: string }[]
      > = {};
      (weighingPhotosRes.data ?? []).forEach((p) => {
        (photosByWeighing[p.weighing_id] ??= []).push({
          id: p.id,
          fileId: p.photo_id,
          url: getAssetUrl(p.photo_id),
        });
      });

      const groupedWeighings: Record<string, WeighingLine[]> = {};
      allWeighings.forEach((w) => {
        (groupedWeighings[w.line_id] ??= []).push({
          id: w.id,
          weight: w.weight != null ? String(w.weight) : "",
          photos: photosByWeighing[w.id] ?? [],
        });
      });
      setWeighingsMap(groupedWeighings);

      const photosRes = await readLinePhotos(loadedLines.map((l) => l.id));
      const groupedPhotos: Record<
        string,
        { id: string; fileId: string; url: string }[]
      > = {};
      (photosRes.data ?? []).forEach((p) => {
        (groupedPhotos[p.line_id] ??= []).push({
          id: p.id,
          fileId: p.photo_id,
          url: getAssetUrl(p.photo_id),
        });
      });
      setItemPhotosMap(groupedPhotos);

      const returnPhotosRes = await readLineReturnPhotos(
        loadedLines.map((l) => l.id),
      );
      const groupedReturnPhotos: Record<
        string,
        { id: string; fileId: string; url: string }[]
      > = {};
      (returnPhotosRes.data ?? []).forEach((p) => {
        (groupedReturnPhotos[p.line_id] ??= []).push({
          id: p.id,
          fileId: p.photo_id,
          url: getAssetUrl(p.photo_id),
        });
      });
      setReceivePhotosMap(groupedReturnPhotos);

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Silent GPS publisher — only active for the courier who owns this
  // dispatch-stage delivery. Called unconditionally (before the loading/error
  // guards below) per the Rules of Hooks; `order` may still be null here, so
  // every field access is optional-chained.
  useDriverLive(
    order?.stage === "dispatch" &&
      !!order?.taken_by &&
      order.taken_by === userId,
  );

  // Customer exposure for the Finance gate's Terms-timing credit-limit
  // check (Dev-OrderDetail.jsx's `customerExposure`) — fetched lazily, not
  // part of the initial load batch, only when someone who could actually
  // clear payment is looking at an order that still needs clearing.
  useEffect(() => {
    const customerId = order?.customer_id;
    if (
      !customerId ||
      order?.payment_confirmed ||
      !auth.can("approveFinance")
    ) {
      return;
    }
    let cancelled = false;
    async function loadExposure() {
      const ordersRes = await readOrders({
        filter: {
          _and: [
            { customer_id: { _eq: customerId } },
            { stage: { _nin: ["delivered", "cancelled", "returned"] } },
          ],
        },
        fields: ["id"],
        limit: -1,
      });
      if (cancelled || ordersRes.error || !ordersRes.data) return;
      const orderIds = ordersRes.data.map((o) => o.id);
      if (orderIds.length === 0) {
        setCustomerExposure(0);
        return;
      }
      const linesRes = await readOrderLines({
        filter: {
          _and: [{ order_id: { _in: orderIds } }, { removed: { _neq: true } }],
        },
        // id/name are required by OrderLinesCollectionSchema — omitting them
        // from `fields` makes Directus drop the keys entirely, which fails
        // zod validation for the whole array and silently leaves
        // customerExposure at its stale/initial value instead of erroring.
        fields: ["id", "name", "order_id", "qty", "price"],
        limit: -1,
      });
      if (cancelled || linesRes.error || !linesRes.data) return;
      const total = linesRes.data.reduce((sum, l) => {
        const qty =
          typeof l.qty === "string" ? parseFloat(l.qty) || 0 : (l.qty ?? 0);
        const price =
          typeof l.price === "string"
            ? parseFloat(l.price) || 0
            : (l.price ?? 0);
        return sum + qty * price;
      }, 0);
      setCustomerExposure(total);
    }
    loadExposure();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.customer_id, order?.payment_confirmed]);

  /* Pre-fill the Finance gate's Timing toggle from the customer's actual
   * terms, matching the prototype's own initializer
   * (`useState(order?.payment.timing || 'upfront')`, Dev-OrderDetail.jsx:71)
   * — this port's `financeTiming` type has no "cod" option (COD's own
   * delivery-time capture is its single source of truth, see the state's
   * doc comment above), so only the "terms" case needs syncing; everything
   * else defaults to "upfront" as before. Without this, a terms customer's
   * gate silently opened on "upfront" until the Finance user noticed and
   * switched it themselves — showing the verify button/gating the Clear
   * button on a step that terms orders don't have.
   *
   * This component instance persists across order navigations (no remount
   * per order id), so the toggle can't just rely on its `useState`
   * initializer — it needs an explicit resync. Adjusted here during render
   * (not via a `useEffect`) per React's own guidance for syncing state to
   * changed props: a `customerTimingKey` change is caught synchronously in
   * the same render that produces it, avoiding an extra commit-then-effect
   * cascade, and re-fires correctly even if `customers` finishes loading
   * after `order` does (the key only settles once both are present). */
  const timingCustomer = customers.find(
    (c) =>
      (order?.customer_id && c.id === order.customer_id) ||
      (order?.customer_name &&
        c.name?.toLowerCase() === order.customer_name.toLowerCase()),
  );
  const customerTimingKey = timingCustomer
    ? `${order?.id}:${timingCustomer.id}`
    : undefined;
  if (customerTimingKey && customerTimingKey !== syncedTimingKey) {
    setSyncedTimingKey(customerTimingKey);
    if (timingCustomer?.pay_timing === "terms") {
      setFinanceTiming("terms");
    }
  }

  /* ────────────── guards ── */
  if (loading)
    return <div className={styles.muted}>{t("Loading order details…")}</div>;
  if (error || !order)
    return (
      <div className={styles.muted} style={{ color: "var(--state-error)" }}>
        {error || t("Order not found.")}
      </div>
    );

  /* ────────────── derived ── */
  const stage = order.stage ?? "intake";
  const flow = STAGE_FLOW[stage];
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === stage);

  /* ────────────── stepper ── */
  const completedPct =
    currentStageIndex === -1
      ? "0%"
      : `${(currentStageIndex / (PIPELINE_STAGES.length - 1)) * 100}%`;

  const isCancelled = order.cancelled === true || stage === "cancelled";
  const isOutstanding = stage === "outstanding";
  const isDelivered = stage === "delivered";
  const isReturned = stage === "returned";
  const isHold = order.hold === true;

  // Locked once delivered, dispatched-and-taken, or in a terminal off-pipeline
  // stage (outstanding/cancelled/returned) — `editAfterLock` (Owner by
  // default, via the Owner short-circuit in `can()`) can override the lock.
  const canEdit =
    auth.can("editOrderLines") &&
    (!isOrderLocked(order) || auth.can("editAfterLock"));
  // Safety net for a weighed-unit line added (or unit-changed) AFTER Cold
  // Storage — ported from the prototype's `unweighedAdded`/`needsWeighing`
  // (`Dev-OrderDetail.jsx:137-146`). The port's edit lock doesn't engage
  // until dispatch (`isOrderLocked`), so an order at finance/production/
  // packing/finalise/dispatch is still editable — someone can add a kg/
  // gram/loaf line that then ships and gets invoiced with no weight at all.
  // A kg/gram line already flagged `short` is legitimately weightless (ran
  // out of stock) and is excluded, same as the Short-flag work.
  const pastCold = [
    "finance",
    "production",
    "packing",
    "finalise",
    "dispatch",
  ].includes(stage);
  const unweighedAdded = lines.filter((l) => {
    if (l.removed || !isWeighedUnit(l.unit)) return false;
    const total = (l.id ? (weighingsMap[l.id] ?? []) : []).reduce(
      (acc, w) => acc + (parseFloat(w.weight) || 0),
      0,
    );
    if (total > 0) return false;
    if (isWeightOnlyUnit(l.unit) && l.short) return false;
    return true;
  });
  // `isOrderLocked` is used here in place of the prototype's narrower
  // `hasLeftWarehouse` — within `pastCold`'s own stage set the two are
  // equivalent (`pastCold` already excludes outstanding/cancelled/returned/
  // delivered, the only stages where `isOrderLocked` is broader), so no
  // separate helper is needed.
  const needsWeighing =
    pastCold && !isOrderLocked(order) && unweighedAdded.length > 0;
  // Who can act on the "isn't weighed yet" banner — matches the
  // prototype's own hardcoded set (`Dev-OrderDetail.jsx:146`), not the
  // Owner-configurable `sendBackStage` grant alone: Admin/Owner/Warehouse
  // always can, on top of anyone else explicitly granted `sendBackStage`.
  const canWeighFix =
    auth.role === "Admin" ||
    auth.role === "Owner" ||
    auth.role === "Warehouse" ||
    auth.can("sendBackStage");
  // A role can advance a stage it owns (flow.capability) OR — if granted the
  // separate "floor helper" capability — cover cold/production/packing/
  // dispatch SPECIFICALLY, matching the prototype's own `canAct` exactly
  // (`Dev-OrderDetail.jsx:123`: `['cold','production','packing','dispatch'].includes(stage)`).
  // Every other stage (`finance`, `intake`, `finalise`) is deliberately
  // excluded from floor-helper coverage — those are each a single named
  // actor's job (Finance/Admin) with no "anyone covering" option in the
  // prototype, ever. Without this exclusion, Admin (the only role with
  // `helpOtherStages` by default) read `canAdvance` as true at `finance` —
  // not enough to see the Finance-gate form (separately gated on
  // `approveFinance`), but enough to wrongly suppress the "This order is
  // with Finance now" notice below. `intake`/`finalise` share this same
  // exclusion for the same reason: printing the DO/SI ("Ready — Send to
  // Dispatch") is Admin's (and Owner's) job alone — a Warehouse/Courier
  // session should never see this button, matching `ACTOR['finalise'] ===
  // 'Admin'` with no floor-helper carve-out.
  const HELP_OTHER_STAGES = ["cold", "production", "packing", "dispatch"];
  const canAdvance = flow
    ? auth.can(flow.capability) ||
      (HELP_OTHER_STAGES.includes(stage) && auth.can("helpOtherStages"))
    : false;
  // This used to extend send-back beyond the generic `sendBackStage`
  // capability (Admin-only by default, `Dev-domain.js:206` —
  // `sendBackStage: ['Admin']`) to also let whoever owns the current stage
  // (`flow.capability`) or is helping as floor cover (`helpOtherStages`)
  // send their own mistaken advance back a step, matching `canAdvance`'s own
  // pattern above. Re-verified directly against the prototype's actual
  // `sendBack` gate (`Dev-OrderDetail.jsx:151` — `can(role, 'sendBackStage',
  // settings) && !['intake','delivered','cancelled','returned','outstanding',
  // 'awaiting'].includes(order.stage)`) stage by stage as each one got
  // reported — `cold→intake` (2026-08-18), `finance→cold` and
  // `production→cold` (2026-08-28), `packing→production` (2026-08-28), and
  // now `dispatch→finalise` (2026-08-28, reported directly: "in the
  // prototype, courier doesn't have the 'send back to print do/si'
  // button") — every single one confirmed the same thing: the prototype's
  // gate has zero role-based branching beyond the flat `sendBackStage`
  // capability, for any stage. There is no prototype transition where a
  // stage's own owning role gets an automatic send-back exception. Every
  // forward-pipeline stage is now excluded, leaving the owning-role/
  // floor-helper carve-out below a no-op everywhere except `delivered` —
  // kept rather than deleted outright in case a *different*,
  // deliberately-scoped self-correction feature is wanted later.
  // `delivered`'s own send-back is the separately-documented "Reopen"
  // feature (its own design history, not this generic carve-out's original
  // target) and was left untouched — not reported, not re-verified here.
  const canSendBack = flow?.prev
    ? auth.can("sendBackStage") ||
      (flow.prev !== "intake" &&
        stage !== "finance" &&
        stage !== "production" &&
        stage !== "packing" &&
        stage !== "dispatch" &&
        (auth.can(flow.capability) || auth.can("helpOtherStages")))
    : false;
  const canCancel =
    auth.can("cancelOrders") && !isCancelled && !isDelivered && !isReturned;
  const canHold =
    auth.can("holdResume") &&
    !isOutstanding &&
    !isCancelled &&
    !isDelivered &&
    !isReturned;
  const canRestore = (isCancelled || isOutstanding) && auth.can("reopenOrders");
  // Sees the Documents section AND its add-form — one gate for both, per the
  // prototype's own hardcoded `['Admin','Finance','Owner'].includes(role)`
  // (`Dev-OrderDetail.jsx:1615`, add-form at 1626-1635 with no extra gate of
  // its own). Distinct from `printDocuments` (Finalise's "Print DO/SI"
  // stage-advance action, Admin/Owner only) — Finance sees/adds documents
  // here but doesn't get that action. Previously this whole section had no
  // gate at all (visible to every role) and the add-form was gated on
  // `printDocuments`, which excluded Finance. Reported directly.
  const canSeeDocuments = auth.can("seeDocuments");
  const canAddDocs = canSeeDocuments;
  // Split from the old single `canProcessReturns`, matching the prototype's
  // own 3 distinct role checks on the Customer Return panel
  // (`Dev-OrderDetail.jsx:1094-1096`): the warehouse physically receives &
  // weighs the goods (`canReceive`), the admin picks the Accurate document
  // type (`canDecide`), and whoever carries the revised DO/SI captures the
  // signed photo (`canSign` — admin or courier).
  const canReceiveReturn = auth.can("receiveReturns");
  const canDecideReturn = auth.can("decideReturns");
  const canSignReturn = auth.can("signReturns");
  const selectedDoc = RETURN_DOC_OPTIONS.find((d) => d.key === selectedDocType);
  const canSeePrices = auth.can("seePrices");
  // History card render — same treatment as the Notifications feed
  // (`useNotifications.ts`): price clauses removed outright (not masked),
  // and an entry dropped entirely if nothing else was in it. This panel
  // previously rendered `order_history.what` raw with no `seePrices` gate.
  const visibleHistory: typeof history = canSeePrices
    ? history
    : history.flatMap((h) => {
        const redacted = redactHistoryPrices(h.what);
        return redacted === null ? [] : [{ ...h, what: redacted }];
      });
  const canSeeCustomerContact = auth.can("seeCustomerContact");
  const canConfirmDocsReturned = auth.can("confirmDocsReturned");
  const canTrackCourier = auth.can("trackCourier");
  // Weighing controls (weight inputs, scale-photo camera) are cold-storage's
  // job only — ported from the prototype's `weighing = stage === 'cold' &&
  // canWeighHere` (Dev-OrderDetail.jsx:172), which also gates the item-photo
  // camera. At every other stage the item list is read-only (what was
  // ordered / what was prepared). `weighColdStorage` naturally excludes
  // Finance — at cold, Finance's only job is clearing the payment gate.
  // Also needs `helpOtherStages`, same as `canAdvance` below — the
  // prototype's own `canWeighHere`/`canAct` is uniformly helper-inclusive
  // across all 4 floor stages (Dev-OrderDetail.jsx:122); this port had
  // split weighing onto the bare `weighColdStorage` capability, which left
  // Admin (the floor helper) unable to weigh or attach item photos while
  // covering someone else's cold-storage queue. Finance is explicitly
  // excluded even if granted `helpOtherStages` — matches the prototype's own
  // `role !== 'Finance' && can(role, 'helpOtherStages')` guard
  // (Dev-OrderDetail.jsx:171): at cold, Finance's only job is ever the
  // finance-gate card below, never the weigh controls, so the two never
  // overlap for one role.
  const canWeighHere =
    stage === "cold" &&
    auth.role !== "Finance" &&
    (auth.can("weighColdStorage") || auth.can("helpOtherStages"));
  /** "Held back, nothing leaving today" — ported from the prototype's
   *  `held(l)` (`Dev-OrderDetail.jsx:671`), which has two mutually exclusive
   *  branches by unit: a kg/gram line is held via its `short` flag; every
   *  OTHER weighed unit (Loaf included) is held via its "sending" qty being
   *  0 — Loaf has no `short` flag of its own in the prototype, it's held
   *  back the same way a counted line is. Used both to exempt a held line
   *  from needing a recorded weight (`coldWeighingReady` below) and from
   *  the cold-storage photo requirement (`handleAdvance`). */
  function isLineHeld(l: OrderLinesCollection): boolean {
    if (isWeightOnlyUnit(l.unit)) return !!l.short;
    const qtyNum =
      typeof l.qty === "string" ? parseFloat(l.qty) || 0 : (l.qty ?? 0);
    const sendingQty = l.id ? (sendingQtyMap[l.id] ?? qtyNum) : qtyNum;
    return sendingQty === 0;
  }
  // Ported from the prototype's `ready` (Dev-OrderDetail.jsx:677) — the
  // "Release to Finance"/"Weighed — release" button stays disabled until
  // every catch-weight (Loaf/kg/gram) line actually has a recorded weight,
  // same rule for every role that can reach it (Warehouse, Owner, or Admin
  // covering as floor helper). Non-weighed lines (the "sending" qty box)
  // never block — matches the prototype's `catchLines` scope (weight-unit
  // lines only). A held line (`isLineHeld` above — short-flagged kg/gram,
  // or a Loaf line with Sending zeroed) is exempt from needing a weight,
  // mirroring the prototype's own `held(l)` exemption in `ready` exactly.
  const coldWeighingReady = lines
    .filter((l) => isWeighedUnit(l.unit))
    .every((l) => {
      if (isLineHeld(l)) return true;
      const total = (l.id ? (weighingsMap[l.id] ?? []) : []).reduce(
        (acc, w) => acc + (parseFloat(w.weight) || 0),
        0,
      );
      return total > 0;
    });
  // Ported from the prototype's Production card (`Dev-OrderDetail.jsx:744-766`)
  // — "Start cutting" (freezes/flags the run as committed) + a per-cut
  // tick-off that gates the actual advance to packing, replacing the plain
  // generic advance button for this one stage.
  const canCutHere =
    stage === "production" &&
    (auth.can("cutProduction") || auth.can("helpOtherStages"));
  const cutTasks = lines.flatMap((l) =>
    (l.id ? (lineCutsByLine[l.id] ?? []) : []).map((cut) => ({
      lineName: l.name,
      cut,
    })),
  );
  function isCutDone(cut: LineCutsCollection): boolean {
    return cutDoneMap[cut.id] ?? !!cut.done;
  }
  const allCutsDone = cutTasks.every((t) => isCutDone(t.cut));
  // Packing's own "Pack the order" card (Dev-OrderDetail.jsx:769-782) —
  // cut lines came back from Production separately and need collecting;
  // other lines never left the warehouse.
  const cutItems = lines.filter(
    (l) => l.id && (lineCutsByLine[l.id]?.length ?? 0) > 0 && !l.removed,
  );
  const otherItems = lines.filter(
    (l) => !(l.id && (lineCutsByLine[l.id]?.length ?? 0) > 0) && !l.removed,
  );
  const canReorder = auth.can("createOrders");

  // Hand-off mode at the dispatch stage — null until the courier/dispatcher
  // picks one of the 3 ways this order leaves the building. The "is
  // something assigned yet" half of this reuses the same shared predicate
  // as the Orders/Dashboard dispatch sub-status label (dispatchSubStatus) —
  // this just additionally distinguishes *which* of the 3 modes, which the
  // list-view sub-status doesn't need to.
  const handoffMode: "delivery" | "pickup" | "third" | null =
    dispatchSubStatus(order) === "out_for_delivery"
      ? order.taken_by
        ? "delivery"
        : order.pickup
          ? "pickup"
          : "third"
      : null;

  // Who currently "has the ball" for this stage (ported from the prototype's
  // ACTOR — see F-04-adjacent "Stage → actor" gap in prototype-audit.md).
  // Purely informational: doesn't gate any button (those already have their
  // own capability checks) — just tells a non-actor role why they don't see
  // an action here, instead of the screen silently having no buttons.
  const stageActor = ACTOR[stage];
  const isStageActor = auth.role === "Owner" || auth.role === stageActor;
  /** Generic one-step "Pressed wrongly?" self-undo — ported from the
   *  prototype's `canSelfUndo` (`Dev-OrderDetail.jsx:350-351`). Available
   *  after ANY stage-changing action (handleAdvance/handleSendBack/
   *  handleCuttingDoneAdvance/handlePackAdvance/handleConfirmDelivery all
   *  write a fresh `undo_snapshot`), to whoever just did it (or Owner),
   *  for as long as it's still the LAST thing that happened to the order —
   *  the timestamp match against the newest history entry is what makes a
   *  snapshot "go stale" the moment anyone (including the same actor) does
   *  anything else, without needing every handler to remember to clear it.
   *  Distinct from the Finance gate's own Undo (`showFinanceUndoRow`
   *  below), which is deliberately NOT time-limited this way — matches the
   *  prototype's own separate `canUndoClear`. */
  const lastHistoryEntry = history[history.length - 1];
  const canUndo =
    !!order.undo_snapshot &&
    (userId === order.undo_snapshot.who || auth.role === "Owner") &&
    !!lastHistoryEntry &&
    lastHistoryEntry.at === order.undo_snapshot.at &&
    stage !== "cancelled" &&
    !isHold;
  // Finance has a parallel job at cold/finance (the Finance gate card) even
  // though they can't advance the *stage* itself — ported from the
  // prototype's `canAct`, which explicitly includes Finance at
  // `['cold', 'finance']` (Dev-OrderDetail.jsx:126) precisely so this notice
  // doesn't show over their own action card. Without this carve-out, a
  // Finance user viewing a cold order saw "This order is currently with
  // Warehouse" sitting right above the Finance gate form they could actually
  // use — correct per the *stage*-advance gate, misleading in context.
  const hasParallelFinanceAction =
    (stage === "cold" || stage === "finance") && auth.can("approveFinance");
  const showActorNotice =
    !!stageActor &&
    !isStageActor &&
    !canAdvance &&
    !hasParallelFinanceAction &&
    !isCancelled &&
    !isDelivered &&
    !isReturned;

  /* ────────────── Returns sub-flow: which parallel bucket(s) is this order in? ── */
  const returnBuckets: ReturnStage[] = returnBucketsForOrder({
    stage: order.stage,
    return_received: order.return_received,
    return_settle: order.return_settle,
    return_doc: order.return_doc,
    return_inbound: order.return_inbound,
    is_replacement: order.is_replacement,
  });
  const inSettleBucket = returnBuckets.includes("admin_action");
  const inSignBucket = returnBuckets.includes("awaiting_signed_doc");
  const latestSignedDoc = returnDocs.find((d) => d.kind === "signed_doc");

  const directusFileUrl = getAssetUrl;

  function displayName(id: string | null | undefined): string {
    if (!id) return "—";
    const u = users.find((u) => u.id === id);
    if (!u) return id; // fallback: still show the UUID rather than nothing
    const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
    return full || u.email || id;
  }

  const matchedCustomer = customers.find(
    (c) =>
      (order.customer_id && c.id === order.customer_id) ||
      (order.customer_name &&
        c.name?.toLowerCase() === order.customer_name.toLowerCase()),
  );
  const customerId = order.customer_id || matchedCustomer?.id;

  /* Drop-location verification distance — only real once the customer has a
   * stored address pin (matchedCustomer.address_geo). No live geocoding: a
   * free-text Indonesian address geocodes to a street centroid, not the real
   * door, which would make "~40m" look authoritative against a guessed
   * anchor. Until a pin exists, the banner keeps the honest fallback text. */
  const dropDistanceM =
    order.deliver_geo && matchedCustomer?.address_geo
      ? Math.round(
          haversineMeters(order.deliver_geo, matchedCustomer.address_geo),
        )
      : null;

  /* Calculate order total value */
  const orderTotal = lines.reduce((acc, line) => {
    const qty =
      typeof line.qty === "string"
        ? parseFloat(line.qty) || 0
        : (line.qty ?? 0);
    const price =
      typeof line.price === "string"
        ? parseFloat(line.price) || 0
        : (line.price ?? 0);
    return acc + qty * price;
  }, 0);

  /* COD payment — the row never blocks delivery, it only records the
   * outcome. codAmount reuses the same order-total calc useCashUp.ts uses
   * (neither `orders` nor `delivery_proofs` has a dedicated COD-amount
   * column). The 3rd-party hand-off owns its own cash collection, so the
   * row (and this whole branch) doesn't apply there. */
  const isCodOrder =
    (matchedCustomer?.pay_timing ?? "").trim().toLowerCase() === "cod";
  const codApplies = isCodOrder && handoffMode !== "third";
  const codAmount = orderTotal;
  const cashCollected: number | null =
    codOutcome === "full"
      ? codAmount
      : codOutcome === "none"
        ? 0
        : codOutcome === "partial"
          ? parseFloat(partialAmountInput) || null
          : null;

  /* Follow-ups pending card — COD reconcile row. Reconciles against the
   * *collected* amount recorded on the delivery proof where present
   * (partial/short deliveries), falling back to the full order total —
   * same source of truth `useCashUp.ts` uses, same write it performs. */
  const codReconcileAmount =
    activeProof?.cash_collected != null
      ? typeof activeProof.cash_collected === "string"
        ? parseFloat(activeProof.cash_collected)
        : activeProof.cash_collected
      : codAmount;
  const showCodRow =
    isDelivered &&
    isCodOrder &&
    !order.cod_reconciled &&
    auth.can("reconcileCOD");
  const showDocsRow =
    isDelivered && !order.docs_returned && canConfirmDocsReturned;
  /* Terms invoice — clearing at the Finance gate approved the CREDIT; the
   * actual payment lands later. Mirrors the prototype's dedicated
   * "Terms invoice — payment not yet received" card (Dev-OrderDetail.jsx:
   * 1578-1589), folded into the same Follow-ups pending card as a third row
   * rather than a standalone card, matching this port's own established
   * grouping (`ui-registry.md`'s "grouped follow-ups" pattern). */
  const showTermsRow =
    isDelivered &&
    order.payment_timing === "terms" &&
    !order.payment_paid_at &&
    auth.can("approveFinance");
  const showTermsPaidNotice =
    isDelivered && order.payment_timing === "terms" && !!order.payment_paid_at;

  /* Finance gate — ported from the prototype's renderFinanceGate() plus its
   * cold/finance stage cases (Dev-OrderDetail.jsx:577-742). Cold Storage and
   * Finance run in parallel — right up until Cold finishes weighing first.
   * If Finance hasn't cleared by then, `handleAdvance`'s cold branch parks
   * the order at a real `finance` stage instead of `production` until
   * someone clears it here (see that handler). Undo is available any time
   * afterward regardless of stage — flipping `payment_confirmed` back is a
   * fully self-contained, safely-repeatable write with no other state to
   * reconcile, unlike the delivered-order Undo which restores a whole
   * pre-delivery snapshot. */
  const canApproveFinance = auth.can("approveFinance");
  const canOverrideCreditLimit = auth.can("overrideCreditLimit");
  const financeCleared = !!order.payment_confirmed;
  const showFinanceGateForm =
    (stage === "cold" || stage === "finance") &&
    !financeCleared &&
    canApproveFinance;
  // The person who cleared payment (or anyone else with `approveFinance`)
  // stays able to reverse it even after the order has moved past the gate —
  // matches the prototype's `canUndoClear` (`Dev-OrderDetail.jsx:165-166`).
  // "Hold" in this port IS the `outstanding` stage (see `handleHold`, no
  // separate boolean overlay like the prototype's `order.hold`), so the
  // stage whitelist below already excludes on-hold orders without a
  // separate check.
  const showFinanceUndoRow =
    financeCleared &&
    canApproveFinance &&
    !isHold &&
    ["cold", "finance", "production", "packing", "finalise"].includes(stage);
  // Ported from the prototype's `orderPriced` (`Dev-domain.js`): true the
  // moment ANY line has a real (positive) price — was previously `.every()`
  // with a `!= null` presence check, which (a) mis-classified a mixed order
  // as "not priced" the instant just one line lacked a price, even with
  // every other line correctly priced, and (b) read a `0` price as
  // "priced." Drives both this Finance-amount fallback below and the
  // order-level price summary after the item list.
  const orderIsPriced = lines.some(lineHasPrice);
  const creditLimitNum =
    typeof matchedCustomer?.credit_limit === "string"
      ? parseFloat(matchedCustomer.credit_limit) || 0
      : (matchedCustomer?.credit_limit ?? 0);
  const overCreditLimit =
    financeTiming === "terms" &&
    creditLimitNum > 0 &&
    customerExposure > creditLimitNum;
  const showCreditBlock =
    auth.can("seeCustomerCredit") &&
    (financeTiming === "terms" || creditLimitNum > 0);

  /* Split attachments: manual doc entries vs file uploads. Excludes
   * delivery-proof photos (doc_type 'cond'/'recv'/'signed', proof_id set) —
   * those render in their own "Delivery proof" card, not here. */
  const docEntries = attachments.filter(
    (a) =>
      !a.message_id &&
      (a.number || a.doc_type) &&
      a.doc_type !== "cond" &&
      a.doc_type !== "recv" &&
      a.doc_type !== "signed",
  );

  /** Persists the "sending" qty (`order_lines.sent`) on blur — mirrors the
   *  weighing inputs' own onBlur-save pattern. Previously this was pure
   *  local `useState`, never read from or written to the database, so a
   *  Warehouse edit only ever existed in that one browser tab: a second
   *  viewer (e.g. Finance) always saw the full ordered qty regardless of
   *  what was actually entered. */
  async function handleSendingBlur(lineId: string) {
    const val = sendingQtyMap[lineId];
    if (val === undefined) return;
    const res = await updateOrderLine(lineId, { sent: val });
    if (res.error) {
      alert(`Failed to save sending quantity: ${res.error}`, {
        title: t("Couldn't save sending quantity"),
      });
    }
  }

  /** "Short — ran out of stock" toggle for a weighed (kg/gram) cold-storage
   *  line — ported from the prototype's `shortFlag`/`held()`
   *  (`Dev-OrderDetail.jsx:670-671,1419-1422`). `order_lines.short` was
   *  already live in the schema and Warehouse's write ACL — dormant, never
   *  wired up. Marking a line short exempts it from needing a recorded
   *  weight (`coldWeighingReady`) and a proof photo (`handleAdvance`); the
   *  persistent "Short — ran out of stock" chip on the line (Item Summary
   *  row) is what carries "customer still owed this" through every later
   *  stage/role. Only writes `short` — kg/gram lines never touch `sent`
   *  (they have no Sending box at all, matching the prototype's own scope
   *  exactly: `sent`/Sending is a counted-unit-only concept there). */
  async function handleToggleShort(lineId: string, currentShort: boolean) {
    const next = !currentShort;
    const res = await updateOrderLine(lineId, { short: next });
    if (res.error || !res.data) {
      alert(`Failed to update short flag: ${res.error}`, {
        title: t("Couldn't update line"),
      });
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === lineId ? res.data! : l)));
  }

  /* ────────────── Weighing & Item Photo Handlers ── */
  function handleAddWeighing(lineId: string) {
    setWeighingsMap((prev) => ({
      ...prev,
      [lineId]: [
        ...(prev[lineId] ?? []),
        { id: "new_" + Date.now(), weight: "", photos: [] },
      ],
    }));
  }

  async function handleRemoveWeighing(lineId: string, wId: string) {
    if (!wId.startsWith("new_")) {
      const res = await deleteLineWeighing(wId);
      if (res.error) {
        alert(`Failed to delete weighing: ${res.error}`, {
          title: t("Couldn't delete weighing"),
        });
        return;
      }
    }
    setWeighingsMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).filter((w) => w.id !== wId),
    }));
  }

  function handleUpdateWeighingWeight(
    lineId: string,
    wId: string,
    val: string,
  ) {
    setWeighingsMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).map((w) =>
        w.id === wId ? { ...w, weight: val } : w,
      ),
    }));
  }

  async function handleWeighingBlur(lineId: string, wId: string) {
    const w = (weighingsMap[lineId] ?? []).find((x) => x.id === wId);
    if (!w) return;
    const parsedWeight = w.weight.trim() === "" ? null : parseFloat(w.weight);

    if (w.id.startsWith("new_")) {
      if (parsedWeight === null && w.photos.length === 0) return; // nothing to save yet
      const res = await createLineWeighing({
        line_id: lineId,
        weight: parsedWeight,
      });
      if (res.error || !res.data) {
        alert(`Failed to save weighing: ${res.error}`, {
          title: t("Couldn't save weighing"),
        });
        return;
      }
      setWeighingsMap((prev) => ({
        ...prev,
        [lineId]: (prev[lineId] ?? []).map((x) =>
          x.id === wId ? { ...x, id: res.data!.id } : x,
        ),
      }));
    } else {
      const res = await updateLineWeighing(w.id, { weight: parsedWeight });
      if (res.error)
        alert(`Failed to update weighing: ${res.error}`, {
          title: t("Couldn't update weighing"),
        });
    }
  }

  async function handleUploadWeighingPhoto(
    lineId: string,
    wId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`, {
        title: t("Photo upload failed"),
      });
      e.target.value = "";
      return;
    }
    const fileId = uploadRes.data.id;
    const photoUrl = getAssetUrl(fileId);

    const w = (weighingsMap[lineId] ?? []).find((x) => x.id === wId);
    if (!w) {
      e.target.value = "";
      return;
    }

    // A weighing row must exist before photos can attach to it — create it on first upload.
    let weighingId = w.id;
    if (weighingId.startsWith("new_")) {
      const parsedWeight = w.weight.trim() === "" ? null : parseFloat(w.weight);
      const res = await createLineWeighing({
        line_id: lineId,
        weight: parsedWeight,
      });
      if (res.error || !res.data) {
        alert(`Failed to save weighing: ${res.error}`, {
          title: t("Couldn't save weighing"),
        });
        e.target.value = "";
        return;
      }
      weighingId = res.data.id;
    }

    const photoRes = await createLineWeighingPhoto({
      weighing_id: weighingId,
      photo_id: fileId,
      sort_order: w.photos.length,
    });
    if (photoRes.error || !photoRes.data) {
      alert(`Failed to save photo: ${photoRes.error}`, {
        title: t("Couldn't save photo"),
      });
      e.target.value = "";
      return;
    }

    setWeighingsMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).map((x) =>
        x.id === wId
          ? {
              ...x,
              id: weighingId,
              photos: [
                ...x.photos,
                { id: photoRes.data!.id, fileId, url: photoUrl },
              ],
            }
          : x,
      ),
    }));
    e.target.value = "";
  }

  async function handleRemoveWeighingPhoto(
    lineId: string,
    wId: string,
    photoRowId: string,
  ) {
    const res = await deleteLineWeighingPhoto(photoRowId);
    if (res.error) {
      alert(`Failed to remove photo: ${res.error}`, {
        title: t("Couldn't remove photo"),
      });
      return;
    }
    setWeighingsMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).map((w) =>
        w.id === wId
          ? { ...w, photos: w.photos.filter((p) => p.id !== photoRowId) }
          : w,
      ),
    }));
    if (activeImageModal?.weighingPhotoId === photoRowId)
      setActiveImageModal(null);
  }

  async function handleUploadItemPhoto(
    lineId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`, {
        title: t("Photo upload failed"),
      });
      e.target.value = "";
      return;
    }
    const fileId = uploadRes.data.id;
    const current = itemPhotosMap[lineId] ?? [];
    const createRes = await createLinePhoto({
      line_id: lineId,
      photo_id: fileId,
      sort_order: current.length,
    });
    if (createRes.error || !createRes.data) {
      alert(`Failed to save photo: ${createRes.error}`, {
        title: t("Couldn't save photo"),
      });
      e.target.value = "";
      return;
    }
    setItemPhotosMap((prev) => ({
      ...prev,
      [lineId]: [
        ...(prev[lineId] ?? []),
        { id: createRes.data!.id, fileId, url: getAssetUrl(fileId) },
      ],
    }));
    e.target.value = "";
  }

  async function handleRemoveItemPhoto(lineId: string, photoRowId: string) {
    const res = await deleteLinePhoto(photoRowId);
    if (res.error) {
      alert(`Failed to remove photo: ${res.error}`, {
        title: t("Couldn't remove photo"),
      });
      return;
    }
    setItemPhotosMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).filter((p) => p.id !== photoRowId),
    }));
    if (activeImageModal?.photoId === photoRowId) setActiveImageModal(null);
  }

  /* ────────────── Document Actions ── */
  async function handleDocFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (!uploadRes.error && uploadRes.data) {
      setDocFileId(uploadRes.data.id);
      setDocFileName(file.name);
    } else {
      alert(`Upload failed: ${uploadRes.error}`, {
        title: t("Upload failed"),
      });
    }
    if (docFileInputRef.current) docFileInputRef.current.value = "";
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docNumber.trim() || savingDoc || !id) return;
    setSavingDoc(true);
    const res = await createAttachment({
      order_uuid: id,
      doc_type: docType,
      number: docNumber.trim(),
      note: docNote.trim() || undefined,
      label: `${docType} ${docNumber.trim()}`,
      document_file: docFileId ?? undefined,
      created_by: userId ?? undefined,
    });
    if (!res.error && res.data) {
      setAttachments((prev) => [res.data!, ...prev]);
      setDocNumber("");
      setDocNote("");
      setDocFileId(null);
      setDocFileName(null);
      await appendOrderHistory({
        order_id: id,
        what: `Document logged: ${docType} ${docNumber.trim()}`,
        who: userId,
        stage,
      });
    } else {
      alert(`Failed to log document: ${res.error}`, {
        title: t("Couldn't log document"),
      });
    }
    setSavingDoc(false);
  }

  async function handleDeleteDocument(docId: number | string) {
    if (
      !(await confirm(t("Delete this document?"), {
        title: t("Delete document"),
        danger: true,
      }))
    )
      return;
    const res = await deleteAttachment(docId);
    if (!res.error) {
      setAttachments((prev) => prev.filter((a) => a.id !== docId));
    } else {
      alert(`Failed to delete document: ${res.error}`, {
        title: t("Couldn't delete document"),
      });
    }
  }

  /* ────────────── Stage Flow Actions ── */
  /** Builds a generic one-step "Pressed wrongly?" undo snapshot — ported
   *  from the prototype's `advance()` (`Dev-OrderDetail.jsx:194-216`),
   *  which stamps every stage-changing action with the exact pre-write
   *  values of whatever fields it's about to touch. Any stage-changing
   *  handler can call this with the same patch object it's sending to
   *  `updateOrder`, and get back the values needed to reverse it.
   *
   *  `at` is passed in rather than generated here — it MUST be the exact
   *  same string the paired `appendOrderHistory` call writes as that
   *  history row's own `at`. `canUndo` (below) gates visibility on
   *  `lastHistoryEntry.at === order.undo_snapshot.at`; two independently
   *  generated `new Date().toISOString()` calls (one here, one wherever
   *  Directus would otherwise default the history row's timestamp) are
   *  never equal, so the undo button silently never appeared for ANY
   *  role at ANY stage until this was fixed — reported directly. */
  function snapshotFor(
    patch: Record<string, unknown>,
    at: string,
  ): UndoSnapshot {
    const changedFields: Record<string, unknown> = {};
    const orderRecord = order as unknown as Record<string, unknown>;
    for (const key of Object.keys(patch)) {
      if (key === "undo_snapshot") continue;
      changedFields[key] = key === "stage" ? stage : (orderRecord[key] ?? null);
    }
    return {
      prevStage: stage,
      changedFields,
      who: userId,
      at,
    };
  }

  async function handleAdvance() {
    if (!id || !order || !flow?.next || advancing) return;
    // Photos already SAVED on a line (a previous visit / reopen) count —
    // only genuinely photo-less, non-held lines block the release. If
    // EVERY line is held (nothing physically left to photograph), the
    // requirement is skipped entirely — ported from the prototype's
    // `photosOk` (`Dev-OrderDetail.jsx:672-674`).
    if (
      stage === "cold" &&
      requirePhoto &&
      !lines.every((l) => l.removed || isLineHeld(l))
    ) {
      const hasAnyItemPhoto = lines.some(
        (line) => line.id && (itemPhotosMap[line.id]?.length ?? 0) > 0,
      );
      if (!hasAnyItemPhoto) {
        alert(
          t(
            "Attach at least one item photo before releasing from Cold Storage.",
          ),
          { title: t("Photo required") },
        );
        return;
      }
    }
    // Cold Storage and Finance run in parallel — but if weighing finishes
    // before Finance clears, the order parks at a real `finance` stage
    // (the Finance gate card above) instead of skipping straight to
    // Production, mirroring the prototype's `normalTarget = cleared ?
    // 'production' : 'finance'` (Dev-OrderDetail.jsx:715). Every other
    // stage's target is unaffected.
    // A re-weigh detour (`order.reweigh_from` set — see the "isn't weighed
    // yet" banner below) returns straight to wherever the order came from,
    // skipping stages it already passed — UNLESS something still needs
    // cutting and the origin was past Production, in which case it routes
    // through Production first so the new item's cut isn't skipped.
    // Ported from the prototype's own release-target logic
    // (`Dev-OrderDetail.jsx:712-719`).
    const needsCut = lines.some(
      (l) =>
        !l.removed &&
        (l.id ? (lineCutsByLine[l.id] ?? []) : []).some((c) => !isCutDone(c)),
    );
    const originPastProd = order.reweigh_from
      ? ["packing", "finalise", "dispatch"].includes(order.reweigh_from)
      : false;
    const target =
      stage === "cold"
        ? order.reweigh_from
          ? needsCut && originPastProd
            ? "production"
            : order.reweigh_from
          : !financeCleared
            ? "finance"
            : flow.next
        : flow.next;
    const reachedReweighOrigin =
      !!order.reweigh_from && target === order.reweigh_from;
    setAdvancing(true);
    const actionAt = new Date().toISOString();
    const patch: Record<string, unknown> = { stage: target };
    if (reachedReweighOrigin) patch.reweigh_from = null;
    const res = await updateOrder(id, {
      ...patch,
      undo_snapshot: snapshotFor(patch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      const historyWhat = reachedReweighOrigin
        ? `Re-weighed — back to ${t(STAGE_LABELS[target as keyof typeof STAGE_LABELS] ?? target)}`
        : order.reweigh_from
          ? "Weighed — to Production for the new cut"
          : `Stage advanced: ${stage} → ${target}`;
      await appendOrderHistory({
        order_id: id,
        what: historyWhat,
        who: userId,
        stage: target,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to advance stage: ${res.error}`, {
        title: t("Couldn't advance stage"),
      });
    }
    setAdvancing(false);
  }

  /** Production marks the moment cutting begins — ported from the
   *  prototype's `startCutting()` (`Dev-OrderDetail.jsx:303`). Purely a
   *  flag + timestamp + who; doesn't touch stage or any line. */
  async function handleStartCutting() {
    if (!id) return;
    const res = await updateOrder(id, {
      cutting_started: true,
      cutting_started_at: new Date().toISOString(),
      cutting_started_by: userId,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Started cutting",
        who: userId,
        stage: "production",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to start cutting: ${res.error}`, {
        title: t("Couldn't start cutting"),
      });
    }
  }

  /** Local-only toggle — ticking a cut doesn't write anything until the
   *  final "Cutting done" click, same as the prototype's own local `cut`
   *  state. */
  function handleToggleCut(cut: LineCutsCollection) {
    setCutDoneMap((prev) => ({ ...prev, [cut.id]: !isCutDone(cut) }));
  }

  /** The production stage's own advance action — replaces the generic
   *  "Done — Send to Packing" button for this stage only. Persists every
   *  ticked cut's `done` flag, then advances (ported from the prototype's
   *  final "Cutting done → to packing" handler, `Dev-OrderDetail.jsx:758-764`
   *  — minus the reweigh-detour branch, which this port doesn't have). */
  async function handleCuttingDoneAdvance() {
    if (!id || !order || !flow?.next || advancing || !allCutsDone) return;
    setAdvancing(true);
    const newlyDone = cutTasks.filter((t) => !t.cut.done);
    if (newlyDone.length > 0) {
      await Promise.allSettled(
        newlyDone.map((t) => updateLineCut(t.cut.id, { done: true })),
      );
      const cutsRes = await readLineCuts(lines.map((l) => l.id));
      const grouped: Record<string, LineCutsCollection[]> = {};
      (cutsRes.data ?? []).forEach((c) => {
        (grouped[c.line_id] ??= []).push(c);
      });
      setLineCutsByLine(grouped);
    }
    setCutDoneMap({});
    const actionAt = new Date().toISOString();
    // A re-weigh detour that routed through Production for the new item's
    // cut (see `handleAdvance`'s `needsCut && originPastProd` branch)
    // returns straight to where it came from here, skipping Packing —
    // ported from the prototype's own `back = order.reweighFrom`
    // (`Dev-OrderDetail.jsx:760-764`).
    const target = order.reweigh_from || flow.next;
    const cuttingPatch: Record<string, unknown> = { stage: target };
    if (order.reweigh_from) cuttingPatch.reweigh_from = null;
    const res = await updateOrder(id, {
      ...cuttingPatch,
      undo_snapshot: snapshotFor(cuttingPatch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: order.reweigh_from
          ? `Cut done — back to ${t(STAGE_LABELS[target as keyof typeof STAGE_LABELS] ?? target)}`
          : "Cutting done — back to warehouse to pack",
        who: userId,
        stage: target,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to advance stage: ${res.error}`, {
        title: t("Couldn't advance stage"),
      });
    }
    setAdvancing(false);
  }

  /** Packing's own advance action — replaces the generic advance button
   *  for this stage, same pattern as Production's card. Ported from the
   *  prototype's "Packed & ready" button (Dev-OrderDetail.jsx:779). */
  async function handlePackAdvance() {
    if (!id || !flow?.next || advancing) return;
    setAdvancing(true);
    const actionAt = new Date().toISOString();
    const patch = { stage: flow.next };
    const res = await updateOrder(id, {
      ...patch,
      undo_snapshot: snapshotFor(patch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Packed — whole order ready",
        who: userId,
        stage: flow.next,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to advance stage: ${res.error}`, {
        title: t("Couldn't advance stage"),
      });
    }
    setAdvancing(false);
  }

  /** Finalise → dispatch — ported from the prototype's own `finalise` card
   *  (`Dev-OrderDetail.jsx:784-798`): printing the DO/SI both confirms and
   *  releases in one action. A typed number logs a document entry
   *  (reusing the same `createAttachment` write the general Documents card
   *  uses); leaving it blank just advances with no document logged —
   *  matches the prototype's own optional-`relDoc` behavior exactly. */
  async function handleFinaliseAdvance() {
    if (!id || !flow?.next || advancing) return;
    setAdvancing(true);
    const number = finaliseDocNumber.trim();
    if (number) {
      const docRes = await createAttachment({
        order_uuid: id,
        doc_type: "DO/SI",
        number,
        note: order?.is_replacement
          ? "replacement delivery"
          : "original delivery",
        label: `DO/SI ${number}`,
        created_by: userId ?? undefined,
      });
      if (!docRes.error && docRes.data) {
        setAttachments((prev) => [docRes.data!, ...prev]);
      }
    }
    const actionAt = new Date().toISOString();
    const patch = { stage: flow.next };
    const res = await updateOrder(id, {
      ...patch,
      undo_snapshot: snapshotFor(patch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: number
          ? `DO/SI printed (${number}) — released to dispatch`
          : "Document printed — released to dispatch",
        who: userId,
        stage: flow.next,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
      setFinaliseDocNumber("");
    } else {
      alert(`Failed to advance stage: ${res.error}`, {
        title: t("Couldn't advance stage"),
      });
    }
    setAdvancing(false);
  }

  /** "Send to Cold Storage to weigh" — the fix action on the "isn't weighed
   *  yet" banner above. Ported from the prototype's `sendToColdToWeigh()`
   *  (`Dev-OrderDetail.jsx:314`, using its `CUT_RESET`): sends the order
   *  back to `cold`, remembering where to return to once the new item is
   *  weighed (`reweigh_from` — preserves an existing value if already
   *  mid-loop, e.g. bounced back again before making it home) and resetting
   *  "Start cutting" so a re-entry to Production later isn't stuck showing
   *  stale "in progress" state. */
  async function handleSendToColdToWeigh() {
    if (!id || !order || advancing) return;
    setAdvancing(true);
    const actionAt = new Date().toISOString();
    const patch = {
      stage: "cold",
      reweigh_from: order.reweigh_from || stage,
      cutting_started: false,
      cutting_started_at: null,
      cutting_started_by: null,
    };
    const res = await updateOrder(id, {
      ...patch,
      undo_snapshot: snapshotFor(patch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Unweighed item — sent back to Cold Storage to weigh",
        who: userId,
        stage: "cold",
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to send back to Cold Storage: ${res.error}`, {
        title: t("Couldn't send back"),
      });
    }
    setAdvancing(false);
  }

  async function handleSendBack() {
    if (!id || !flow?.prev || advancing) return;
    // Ported from the prototype's sendBackStage() (Dev-OrderDetail.jsx:360)
    // — asks why before sending back, same modal-based prompt for every
    // role that can reach this (Admin via `sendBackStage`, Owner always,
    // or whoever owns the current stage — see canSendBack above).
    const targetLabel = t(
      STAGE_LABELS[flow.prev as keyof typeof STAGE_LABELS] ?? flow.prev,
    );
    const reason = await prompt(
      `${t("Send back to")} ${targetLabel} — ${t("why?")}`,
      { title: t("Send back") },
    );
    if (reason === null) return;
    setAdvancing(true);
    // Sending back from dispatch (e.g. to reprint DO/SI), or reopening from
    // delivered, must also clear the hand-off fields — ported from the
    // prototype's HANDOVER_RESET — or the order returns still marked as
    // taken by a courier, and the 3-way hand-off chooser never shows again
    // when it comes back around. Reopening from delivered additionally
    // archives the now-superseded confirmed proof — a redelivery is a new
    // attempt, and without this the next confirm just piles up a second
    // non-archived delivery_proofs row instead of superseding the first.
    const isDispatchReset = stage === "dispatch" || stage === "delivered";
    if (stage === "delivered" && activeProof) {
      await updateDeliveryProof(activeProof.id, { archived: true });
    }
    // Ported from the prototype's CUT_RESET (Dev-OrderDetail.jsx:306) — the
    // prototype applies it unconditionally on every send-back (a single
    // denormalized document with no per-field ACL to worry about), but this
    // port's roles have field-restricted Directus grants (e.g. Courier's
    // orders.update doesn't include cutting_started* at all), so sending
    // these fields on an unrelated transition (dispatch → finalise) would
    // 403 the whole write. Scoped to the two transitions where it's
    // actually meaningful: leaving `production`, or arriving back at it
    // from a later stage (e.g. packing → production) — either way "Start
    // cutting" should be fresh, not stuck on stale state.
    // Deliberately diverges from the prototype's own CUT_RESET here, per
    // explicit product decision: the prototype leaves already-ticked
    // line_cuts.done alone ("the meat doesn't become un-cut"), but this
    // port also un-ticks every cut on the same transitions — a send-back
    // means something needs re-doing, so Production should re-verify each
    // cut rather than trust a stale tick from before the order left.
    const needsCutReset = stage === "production" || flow.prev === "production";
    const patch: Record<string, unknown> = {
      stage: flow.prev,
      ...(needsCutReset
        ? {
            cutting_started: false,
            cutting_started_at: null,
            cutting_started_by: null,
          }
        : {}),
      ...(isDispatchReset
        ? {
            taken_by: null,
            pickup: false,
            third_party: false,
            courier_service: null,
          }
        : {}),
    };
    // A fresh snapshot for THIS move — supersedes whatever snapshot (if
    // any) was left over from a prior action, including the delivered
    // order's own pending Undo when reopening.
    const actionAt = new Date().toISOString();
    const res = await updateOrder(id, {
      ...patch,
      undo_snapshot: snapshotFor(patch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      if (stage === "delivered") {
        setActiveProof(null);
        resetProofState();
      }
      if (needsCutReset) {
        // Un-tick every cut to match — both the local override map (a tick
        // made before "Cutting done" was ever clicked was never persisted
        // in the first place) and any cuts already persisted as done from
        // a completed run before this send-back, per the product decision
        // above.
        setCutDoneMap({});
        const doneCuts = cutTasks.filter((t) => t.cut.done);
        if (doneCuts.length > 0) {
          await Promise.allSettled(
            doneCuts.map((t) => updateLineCut(t.cut.id, { done: false })),
          );
          const cutsRes = await readLineCuts(lines.map((l) => l.id));
          const grouped: Record<string, LineCutsCollection[]> = {};
          (cutsRes.data ?? []).forEach((c) => {
            (grouped[c.line_id] ??= []).push(c);
          });
          setLineCutsByLine(grouped);
        }
      }
      await appendOrderHistory({
        order_id: id,
        what: `Stage returned: ${stage} → ${flow.prev}${reason.trim() ? ` — ${reason.trim()}` : ""}`,
        who: userId,
        stage: flow.prev,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to send back: ${res.error}`, {
        title: t("Couldn't send back"),
      });
    }
    setAdvancing(false);
  }

  /**
   * Send-back button text, derived from the shared pipeline stage-label map
   * (never hardcoded per-stage) so it can't drift from the Dashboard's
   * pipeline-tile names. "Re-open" is used specifically for the delivered →
   * dispatch case (the "Reopen closed orders" action), "Send back" for every
   * mid-pipeline override.
   */
  function sendBackLabel(): string {
    if (!flow?.prev) return t("Send Back");
    const target = t(
      STAGE_LABELS[flow.prev as keyof typeof STAGE_LABELS] ?? flow.prev,
    );
    return stage === "delivered"
      ? `${t("Re-open to")} ${target}`
      : `${t("Send back to")} ${target}`;
  }

  /** Opens the delivery-proof capture form, defaulting COD from the customer's pay_timing. */
  function resetProofState() {
    setCondPhotos([]);
    setRecvPhotos([]);
    setSignedPhotos([]);
    setReceiverName("");
    setCodOutcome(null);
    setPartialAmountInput("");
    setOutstandingReason(null);
    setPickupGeo(null);
  }

  /**
   * Archives whatever was staged in an abandoned attempt (Change method /
   * Delivery failed, before ever confirming) instead of silently discarding
   * it — creates a delivery_proofs row for the partial attempt, immediately
   * marks it `archived: true`, and links every staged photo to it via
   * `proof_id`. No-op when nothing was captured yet. Best-effort: a failure
   * here shouldn't block the hand-off reset itself.
   */
  async function archiveDraftAttempt() {
    const hasDraft =
      condPhotos.length > 0 ||
      recvPhotos.length > 0 ||
      signedPhotos.length > 0 ||
      receiverName.trim() !== "";
    if (!hasDraft || !id) return;
    const proofRes = await createDeliveryProof({
      order_id: id,
      cond_photo: condPhotos[0]?.fileId ?? null,
      recv_photo: recvPhotos[0]?.fileId ?? null,
      signed_photo: signedPhotos[0]?.fileId ?? null,
      cod: cashCollected != null && cashCollected > 0,
      cash_collected: cashCollected,
      name: receiverName.trim() || null,
    });
    if (proofRes.error || !proofRes.data) return;
    const proofId = proofRes.data.id;
    await updateDeliveryProof(proofId, { archived: true });
    const allStaged = [
      ...condPhotos.map((p) => ({ ...p, slot: "cond" as const })),
      ...recvPhotos.map((p) => ({ ...p, slot: "recv" as const })),
      ...signedPhotos.map((p) => ({ ...p, slot: "signed" as const })),
    ];
    await Promise.all(
      allStaged.map((p) =>
        createAttachment({
          order_uuid: id,
          doc_type: p.slot,
          document_file: p.fileId,
          proof_id: proofId,
          created_by: userId ?? undefined,
        }),
      ),
    );
  }

  /** Writes a hand-off field patch + history entry, then resets the proof form for the new mode. */
  async function commitHandoff(
    patch: Record<string, unknown>,
    historyWhat: string,
  ) {
    if (!id || choosingMode) return;
    setChoosingMode(true);
    const res = await updateOrder(id, patch);
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: historyWhat,
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
      resetProofState();
      setShowThirdPartyForm(false);
    } else {
      alert(`Failed to record hand-off: ${res.error}`, {
        title: t("Couldn't record hand-off"),
      });
    }
    setChoosingMode(false);
  }

  function handleChooseOwnCourier() {
    commitHandoff({ taken_by: userId }, "Handover: own courier");
  }

  function handleChoosePickup() {
    commitHandoff({ pickup: true }, "Handover: customer pickup");
  }

  function handleConfirmThirdParty() {
    const service = `${thirdPartyService}${thirdPartyRef.trim() ? ` · ${thirdPartyRef.trim()}` : ""}`;
    commitHandoff(
      { third_party: true, courier_service: service },
      `Handover: 3rd-party — ${service}`,
    );
  }

  /** Resets the hand-off choice back to the 3-way chooser — whatever was staged is archived, not lost (see archiveDraftAttempt). */
  async function handleChangeMethod() {
    await archiveDraftAttempt();
    await commitHandoff(
      {
        taken_by: null,
        pickup: false,
        third_party: false,
        courier_service: null,
      },
      "Handover method reset",
    );
  }

  /** The attempt failed before ever confirming (e.g. no one home) — archive whatever was staged and return to the hand-off chooser for a retry. */
  async function handleDeliveryFailed() {
    await archiveDraftAttempt();
    await commitHandoff(
      {
        taken_by: null,
        pickup: false,
        third_party: false,
        courier_service: null,
      },
      "Delivery attempt failed — retrying",
    );
  }

  async function handleConfirmDocsReturned() {
    if (!id) return;
    // Any further action on the order after delivery, including this one,
    // supersedes the delivery confirm as "the last action" — clears the
    // quiet Undo link's eligibility.
    const res = await updateOrder(id, {
      docs_returned: true,
      undo_snapshot: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "DO/SI returned & filed",
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to confirm documents returned: ${res.error}`, {
        title: t("Couldn't confirm documents returned"),
      });
    }
  }

  /** Records that a Terms-timing invoice's payment came in — the actual
   *  cash, distinct from clearing the credit at the Finance gate. Mirrors
   *  the prototype's terms-invoice "Payment received" button
   *  (`Dev-OrderDetail.jsx:1581`). */
  async function handleTermsPaymentReceived() {
    if (!id) return;
    const res = await updateOrder(id, {
      payment_paid_at: new Date().toISOString(),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Terms payment received",
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to record terms payment: ${res.error}`, {
        title: t("Couldn't record terms payment"),
      });
    }
  }

  /** Undoes a mistaken "Payment received" tap — just flips `payment_paid_at`
   *  back to null, mirroring the prototype's terms-payment Undo
   *  (`Dev-OrderDetail.jsx:1587`). */
  async function handleUndoTermsPayment() {
    if (!id) return;
    const res = await updateOrder(id, { payment_paid_at: null });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Undo — terms payment not received yet",
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to undo terms payment: ${res.error}`, {
        title: t("Couldn't undo terms payment"),
      });
    }
  }

  /**
   * Same write `useCashUp.ts`'s own "Confirm" button performs
   * (`cod_reconciled: true`) — this is a second entry point for the exact
   * same action, not a parallel COD-reconcile mechanism, so Cash-up and this
   * row never disagree about whether an order's cash is settled.
   */
  async function handleReconcileCOD() {
    if (!id) return;
    setReconcilingCod(true);
    const res = await updateOrder(id, {
      cod_reconciled: true,
      cod_received_at: new Date().toISOString(),
      undo_snapshot: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: `COD cash reconciled — ${currency.format(codReconcileAmount)}`,
        who: userId,
        stage: null,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to reconcile COD: ${res.error}`, {
        title: t("Couldn't reconcile COD"),
      });
    }
    setReconcilingCod(false);
  }

  /** Clears the Finance gate — the previously-missing write behind the
   *  `approveFinance` capability and the "Orders awaiting finance approval"
   *  Needs Attention bucket, which existed with nothing to actually press.
   *  Writes the full payment record (method/timing/amount/bank
   *  reference/terms due-date), mirroring the prototype's "Clear — OK to
   *  proceed" (`Dev-OrderDetail.jsx:613-630`) — Clear-only, no reject; a
   *  Finance user who won't clear simply leaves the order parked here.
   *  Clearing while parked at the literal `finance` stage (Cold finished
   *  weighing before Finance did — see `handleAdvance`'s cold branch) also
   *  advances the order to `production`; clearing at `cold` itself doesn't
   *  move the stage — weighing's own advance button decides that once it's
   *  ready, exactly like the prototype's `case 'cold'`/`case 'finance'`
   *  split. */
  async function handleApproveFinance() {
    if (!id || !order) return;
    if (!isCodOrder && financeTiming === "upfront" && !financeVerified) return;
    if (overCreditLimit && !canOverrideCreditLimit) return;
    setApprovingFinance(true);
    const amountNum =
      parseFloat(financeAmount.replace(/[^\d.]/g, "")) ||
      (orderIsPriced ? orderTotal : null);
    const dueDate =
      financeTiming === "terms" &&
      matchedCustomer?.term_days &&
      Number(matchedCustomer.term_days) > 0 &&
      order.deliver_at
        ? new Date(
            new Date(order.deliver_at).getTime() +
              Number(matchedCustomer.term_days) * 86400000,
          )
            .toISOString()
            .slice(0, 10)
        : null;
    const patch: Record<string, unknown> = {
      payment_confirmed: true,
      payment_confirmed_at: new Date().toISOString(),
      payment_method: financeMethod,
      payment_timing: isCodOrder ? "cod" : financeTiming,
      payment_amount: amountNum,
      payment_bank_ref:
        financeMethod === "transfer" ? financeBankRef.trim() || null : null,
      payment_due_date: dueDate,
      payment_paid_at: null,
    };
    if (stage === "finance") patch.stage = "production";
    const res = await updateOrder(id, patch);
    if (!res.error && res.data) {
      setOrder(res.data);
      const note =
        financeTiming === "terms"
          ? `Terms${overCreditLimit ? " (over limit, owner-approved)" : ""} — cleared${dueDate ? `, due ${dueDate}` : ""}`
          : `Paid${amountNum ? " " + currency.format(amountNum) : ""}${financeBankRef.trim() ? " · " + financeBankRef.trim() : ""} — cleared`;
      await appendOrderHistory({
        order_id: id,
        what: note,
        who: userId,
        stage: typeof patch.stage === "string" ? patch.stage : null,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to clear payment: ${res.error}`, {
        title: t("Couldn't clear payment"),
      });
    }
    setApprovingFinance(false);
  }

  /** Undoes an accidental Finance clearance — resets the payment fields and,
   *  if the order already moved past Cold Storage (it was cleared at the
   *  `finance` stage, which auto-advanced it), drops it back to `finance`
   *  to be re-checked. Un-clearing while still at `cold` doesn't move the
   *  stage — the Finance card just reappears in place. Mirrors the
   *  prototype's `undoClearance()` (`Dev-OrderDetail.jsx:325-330`) exactly,
   *  including reaching back across production/packing/finalise if needed. */
  async function handleUndoFinanceClear() {
    if (
      !id ||
      !(await confirm(
        t(
          "Undo the payment clearance? The order goes back to the Finance gate to be re-checked.",
        ),
        { title: t("Undo payment clearance") },
      ))
    )
      return;
    setApprovingFinance(true);
    const patch: Record<string, unknown> = {
      payment_confirmed: false,
      payment_confirmed_at: null,
      payment_paid_at: null,
    };
    if (stage !== "cold") patch.stage = "finance";
    const res = await updateOrder(id, patch);
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what:
          stage === "cold"
            ? "Payment clearance undone (still at Cold Storage)"
            : "Payment clearance undone — back to the Finance gate",
        who: userId,
        stage: typeof patch.stage === "string" ? patch.stage : null,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to undo payment clearance: ${res.error}`, {
        title: t("Couldn't undo payment clearance"),
      });
    }
    setApprovingFinance(false);
  }

  async function handleUploadProofPhoto(
    slot: "cond" | "recv" | "signed",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProofSlot(slot);
    const uploadRes = await uploadFile(file);
    setUploadingProofSlot(null);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`, {
        title: t("Photo upload failed"),
      });
      e.target.value = "";
      return;
    }
    const photo = {
      fileId: uploadRes.data.id,
      url: getAssetUrl(uploadRes.data.id),
    };
    if (slot === "cond") setCondPhotos((prev) => [...prev, photo]);
    else if (slot === "recv") setRecvPhotos((prev) => [...prev, photo]);
    else setSignedPhotos((prev) => [...prev, photo]);
    e.target.value = "";

    // Best-effort pickup location, own-courier hand-off only, captured once
    // per attempt (first condition photo) — never blocks the upload itself.
    if (slot === "cond" && handoffMode === "delivery" && !pickupGeo) {
      captureGeoStamp().then((geo) => {
        if (geo) setPickupGeo(geo);
      });
    }
  }

  /** Removes a staged (not-yet-confirmed) proof photo — pure local-state edit, nothing to delete server-side since it was never attached to a record. */
  function handleRemoveStagedProofPhoto(
    slot: "cond" | "recv" | "signed",
    index: number,
  ) {
    const setter =
      slot === "cond"
        ? setCondPhotos
        : slot === "recv"
          ? setRecvPhotos
          : setSignedPhotos;
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Records the courier/dispatcher's proof set, then advances the order to
   * Delivered. Requirements vary by hand-off mode: a 3rd-party courier only
   * ever needs the handover/condition photo (the service — not this app —
   * owns the rest of that hand-off); own-courier and customer-pickup both
   * need the full set whenever `proofRequired` is on.
   */
  async function handleConfirmDelivery() {
    if (!id || !order || submittingProof) return;
    // Condition photo is always required (it's what unlocks the rest of the
    // form in the first place); receiver + signed-doc photos only become
    // mandatory when dispatch_proof_required is on, and never for 3rd-party
    // (the courier service — not this app — owns the rest of that hand-off).
    const photosOk =
      handoffMode === "third"
        ? condPhotos.length > 0
        : condPhotos.length > 0 &&
          (!proofRequired ||
            (recvPhotos.length > 0 && signedPhotos.length > 0));
    if (!photosOk) {
      alert(
        handoffMode === "third"
          ? t("A handover photo is required before marking handed over.")
          : t(
              "Condition, receiver, and signed-invoice photos are all required before marking delivered.",
            ),
        { title: t("Photo required") },
      );
      return;
    }
    if (!receiverName.trim()) {
      alert(t("Enter the receiver's name."), {
        title: t("Receiver name required"),
      });
      return;
    }
    // Cash never blocks "goods changed hands" — but a COD order does need
    // *some* recorded outcome (a soft prompt, not a hard gate: "none" is
    // always an honest, available answer), and a shortfall needs a reason
    // so Finance knows why before chasing it.
    if (codApplies && codOutcome === null) {
      alert(
        t(
          "Record whether the COD payment was collected before marking delivered.",
        ),
        { title: t("COD outcome required") },
      );
      return;
    }
    if (codApplies && codOutcome !== "full" && !outstandingReason) {
      alert(
        t(
          "Pick a reason for the outstanding balance before marking delivered.",
        ),
        { title: t("Reason required") },
      );
      return;
    }
    setSubmittingProof(true);
    // Defensive: an existing non-archived proof at this point means some
    // earlier path (e.g. a reopen) left it un-superseded — archive it before
    // creating a new one so there's never more than one active attempt.
    if (activeProof) {
      await updateDeliveryProof(activeProof.id, { archived: true });
    }
    const proofRes = await createDeliveryProof({
      order_id: id,
      cond_photo: condPhotos[0]?.fileId ?? null,
      recv_photo: recvPhotos[0]?.fileId ?? null,
      signed_photo: signedPhotos[0]?.fileId ?? null,
      cod: codApplies && cashCollected != null && cashCollected > 0,
      cash_collected: codApplies ? cashCollected : null,
      name: receiverName.trim(),
    });
    if (proofRes.error || !proofRes.data) {
      alert(`Failed to save delivery proof: ${proofRes.error}`, {
        title: t("Couldn't save delivery proof"),
      });
      setSubmittingProof(false);
      return;
    }
    const proofId = proofRes.data.id;
    const allStaged = [
      ...condPhotos.map((p) => ({ ...p, slot: "cond" as const })),
      ...recvPhotos.map((p) => ({ ...p, slot: "recv" as const })),
      ...signedPhotos.map((p) => ({ ...p, slot: "signed" as const })),
    ];
    const attachRes = await Promise.all(
      allStaged.map((p) =>
        createAttachment({
          order_uuid: id,
          doc_type: p.slot,
          document_file: p.fileId,
          proof_id: proofId,
          created_by: userId ?? undefined,
        }),
      ),
    );
    const failedAttach = attachRes.filter((r) => r.error).length;
    if (failedAttach > 0) {
      alert(
        `Delivery confirmed, but ${failedAttach} proof photo(s) failed to save. The primary photo per field is still recorded.`,
        { title: t("Some proof photos didn't save") },
      );
    }
    setAttachments((prev) => [
      ...prev,
      ...attachRes.flatMap((r) => (r.data ? [r.data] : [])),
    ]);
    setActiveProof(proofRes.data);

    // Goods changed hands regardless of cash — the branch below only
    // decides where the order lands and what the record says. A COD
    // shortfall (partial or none) routes to `outstanding` so Finance
    // chases the balance, same state `handleHold` already uses.
    const codShort = codApplies && codOutcome !== "full";
    let nextStage: string;
    let historyWhat: string;
    if (!codApplies) {
      nextStage = "delivered";
      historyWhat = `Stage advanced: ${stage} → delivered`;
    } else if (!codShort) {
      nextStage = "delivered";
      historyWhat = `Delivered — COD ${currency.format(cashCollected ?? 0)} collected`;
    } else {
      nextStage = "outstanding";
      const reasonLabel =
        OUTSTANDING_REASONS.find((r) => r.key === outstandingReason)?.label ??
        "unspecified";
      historyWhat = `Delivered, payment outstanding — collected ${currency.format(cashCollected ?? 0)} of ${currency.format(codAmount)} (${reasonLabel})`;
    }

    // Best-effort drop-location fix, own-courier hand-off only — a fresh
    // fix at the moment of confirming, distinct from pickupGeo (taken at
    // condition-photo capture, earlier in the same attempt).
    const deliverGeo =
      handoffMode === "delivery" ? await captureGeoStamp() : null;

    // Pre-delivery snapshot for the quiet "Undo" link — the exact values
    // this action is about to overwrite, plus the proof row it creates (so
    // Undo can archive it, not just reset the order fields). `at` MUST
    // match the paired `appendOrderHistory` call's own `at` below — this
    // handler builds its snapshot by hand rather than through the shared
    // `snapshotFor()` helper (it has extra fields — `proofId` — that
    // helper doesn't produce), so it needs the same one-shared-timestamp
    // treatment applied there, not `snapshotFor`'s fix itself.
    const actionAt = new Date().toISOString();
    const undoSnapshot: UndoSnapshot = {
      prevStage: stage,
      changedFields: {
        stage,
        delivered_at: order.delivered_at ?? null,
        pickup_geo: order.pickup_geo ?? null,
        deliver_geo: order.deliver_geo ?? null,
      },
      proofId,
      who: userId,
      at: actionAt,
    };

    const res = await updateOrder(id, {
      stage: nextStage,
      delivered_at: new Date().toISOString(),
      pickup_geo: handoffMode === "delivery" ? pickupGeo : null,
      deliver_geo: deliverGeo,
      undo_snapshot: undoSnapshot,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: historyWhat,
        who: userId,
        stage: nextStage,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);

      // Bootstrap the customer's address pin from real delivery data instead
      // of geocoding their free-text address — "where we actually delivered"
      // is a better anchor than a guessed street centroid, and it's free.
      // Only offered once (skipped once a pin already exists) and only for
      // an own-courier hand-off with a real fix — pickup/3rd-party/failed-fix
      // deliveries have no location worth saving as the customer's address.
      if (
        handoffMode === "delivery" &&
        deliverGeo &&
        matchedCustomer &&
        !matchedCustomer.address_geo &&
        (await confirm(
          t("Set this as {customer}'s delivery location?").replace(
            "{customer}",
            matchedCustomer.name,
          ),
          { title: t("Save delivery location?") },
        ))
      ) {
        const custRes = await updateCustomer(matchedCustomer.id, {
          address_geo: { lat: deliverGeo.lat, lng: deliverGeo.lng },
        });
        if (!custRes.error && custRes.data) {
          setCustomers((prev) =>
            prev.map((c) => (c.id === custRes.data!.id ? custRes.data! : c)),
          );
        }
      }
    } else {
      alert(`Failed to advance stage: ${res.error}`, {
        title: t("Couldn't confirm delivery"),
      });
    }
    setSubmittingProof(false);
  }

  /**
   * Generic one-step "Pressed wrongly?" self-undo — ported from the
   * prototype's `undoMyStep()` (`Dev-OrderDetail.jsx:352-356`). Restores
   * every field the last stage-changing action touched back to its
   * pre-move value (captured in `undo_snapshot.changedFields`) and, when
   * that move was a delivery confirmation, archives the `delivery_proofs`
   * row it created. Distinct from Reopen (a deliberate re-delivery that
   * resets hand-off state and stays available indefinitely) and from the
   * Finance gate's own Undo (below), which also isn't time-limited.
   */
  async function handleUndo() {
    if (!id || !order || !order.undo_snapshot || !canUndo) return;
    const targetLabel = t(
      STAGE_LABELS[
        order.undo_snapshot.prevStage as keyof typeof STAGE_LABELS
      ] ?? order.undo_snapshot.prevStage,
    );
    if (
      !(await confirm(
        t("Undo your last step? The order goes back to where it was."),
        { title: t("Undo"), danger: true },
      ))
    )
      return;
    const snapshot = order.undo_snapshot;
    if (snapshot.proofId) {
      await updateDeliveryProof(snapshot.proofId, { archived: true });
    }
    const res = await updateOrder(id, {
      ...snapshot.changedFields,
      undo_snapshot: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      setActiveProof(null);
      resetProofState();
      await appendOrderHistory({
        order_id: id,
        what: `Undid — back to ${targetLabel}`,
        who: userId,
        stage: snapshot.prevStage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to undo: ${res.error}`, {
        title: t("Couldn't undo"),
      });
    }
  }

  async function handleCancel() {
    if (
      !id ||
      !(await confirm(t("Cancel this order? This can be undone via Restore."), {
        title: t("Cancel order"),
        danger: true,
      }))
    )
      return;
    setCancelling(true);
    const res = await updateOrder(id, {
      cancelled: true,
      stage: "cancelled",
      cancelled_from: stage,
      undo_snapshot: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Order cancelled",
        who: userId,
        stage: "cancelled",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to cancel order: ${res.error}`, {
        title: t("Couldn't cancel order"),
      });
    }
    setCancelling(false);
  }

  async function handleToggleHold() {
    if (!id || !order) return;
    const nextHold = !isHold;
    const holdPatch = { hold: nextHold };
    const actionAt = new Date().toISOString();
    const res = await updateOrder(id, holdPatch);
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: nextHold ? "Put on hold" : "Resumed (off hold)",
        who: userId,
        stage: stage,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to update hold status: ${res.error}`, {
        title: t("Couldn't update order"),
      });
    }
  }

  async function handleRestore() {
    if (!id || !order) return;
    // Outstanding or cancelled orders return to their recorded cancelled_from stage,
    // falling back to dispatch for outstanding or intake for cancelled.
    const restoreStage =
      order.cancelled_from ?? (isOutstanding ? "dispatch" : "intake");
    // Landing back at dispatch needs the same hand-off reset
    // `handleSendBack`'s reopen path already applies (delivered → dispatch)
    // — otherwise taken_by/pickup/third_party survive and the hand-off
    // chooser never reappears for the redelivery attempt.
    const isDispatchReset = restoreStage === "dispatch";
    if (isDispatchReset && activeProof) {
      await updateDeliveryProof(activeProof.id, { archived: true });
    }
    // Ported from the prototype's own `restoreOrder()`/`reopenOrder()`,
    // both of which go through `advance()` unconditionally — Restore gets
    // the same self-undo as any other stage move.
    const restorePatch: Record<string, unknown> = {
      stage: restoreStage,
      cancelled: false,
      cancelled_from: null,
      ...(isDispatchReset
        ? {
            taken_by: null,
            pickup: false,
            third_party: false,
            courier_service: null,
          }
        : {}),
    };
    const actionAt = new Date().toISOString();
    const res = await updateOrder(id, {
      ...restorePatch,
      undo_snapshot: snapshotFor(restorePatch, actionAt),
    });
    if (!res.error && res.data) {
      if (isDispatchReset) {
        setActiveProof(null);
        resetProofState();
      }
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: `Order restored to ${restoreStage}`,
        who: userId,
        stage: restoreStage,
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to restore order: ${res.error}`, {
        title: t("Couldn't restore order"),
      });
    }
  }

  /**
   * Clone this order into a new intake-stage order for the same customer —
   * the weekly Horeca-repeat use case (Dev-OrderDetail.jsx:501). Reuses the
   * exact same Directus-backed order/line/cut creation path as OrderNew.tsx
   * (getNextOrderNo, createOrder, createOrderLines, createLineCut) rather
   * than the prototype's client-side order-number scan, since order lines
   * are separate rows here, not a nested array to deep-copy.
   */
  async function handleReorder() {
    if (!id || !order || reordering) return;
    if (!order.customer_id) {
      alert(t("This order has no customer on file — can't reorder."), {
        title: t("Can't reorder"),
      });
      return;
    }
    if (
      !(await confirm(
        t("Create a new order with the same items for this customer?"),
        { title: t("Reorder") },
      ))
    )
      return;

    setReordering(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deliverAt = tomorrow.toISOString().slice(0, 10);
    const orderDate = new Date().toISOString().slice(0, 10);

    const noRes = await getNextOrderNo(dateCode(deliverAt));
    if (noRes.error || !noRes.data) {
      alert(`Failed to generate order number: ${noRes.error}`, {
        title: t("Couldn't create reorder"),
      });
      setReordering(false);
      return;
    }

    const orderRes = await createOrder({
      no: noRes.data,
      customer_id: order.customer_id,
      customer_name: order.customer_name ?? null,
      customer_contact: order.customer_contact ?? null,
      customer_address: order.customer_address ?? null,
      customer_legal_name: order.customer_legal_name ?? null,
      channel: order.channel ?? "horeca",
      stage: "intake",
      status: "Open",
      sales: order.sales ?? null,
      deliver_at: deliverAt,
      order_date: orderDate,
    });
    if (orderRes.error || !orderRes.data) {
      alert(`Failed to create order: ${orderRes.error}`, {
        title: t("Couldn't create reorder"),
      });
      setReordering(false);
      return;
    }
    const newOrderId = orderRes.data.id;

    const activeLines = lines.filter((l) => !l.removed);
    const lineInputs: CreateOrderLineInput[] = activeLines.map((l, i) => {
      const qty =
        typeof l.qty === "string" ? parseFloat(l.qty) || 0 : (l.qty ?? 0);
      return {
        order_id: newOrderId,
        product_id: l.product_id ?? null,
        name: l.name,
        qty,
        unit: l.unit ?? "",
        status: l.product_id ? "recognized" : "manual",
        sort_order: i,
      };
    });
    const linesRes = await createOrderLines(lineInputs);
    if (linesRes.error) {
      alert(
        `Order created but lines failed: ${linesRes.error}. Order id ${newOrderId}.`,
        { title: t("Reorder partially failed") },
      );
      setReordering(false);
      navigate(`/orders/${newOrderId}`, { state: { from: backTo } });
      return;
    }

    const cutInputs: { line_id: string; text: string; sort_order: number }[] =
      [];
    activeLines.forEach((l, i) => {
      const savedLine = linesRes.data?.[i];
      if (!savedLine) return;
      (lineCutsByLine[l.id] ?? []).forEach((c, ci) => {
        if (c.text.trim())
          cutInputs.push({
            line_id: savedLine.id,
            text: c.text.trim(),
            sort_order: ci,
          });
      });
    });
    if (cutInputs.length > 0) {
      await Promise.allSettled(cutInputs.map((c) => createLineCut(c)));
    }

    await appendOrderHistory({
      order_id: newOrderId,
      what: `Reorder of #${order.no ?? id}`,
      who: userId,
      stage: "intake",
    });

    setReordering(false);
    navigate(`/orders/${newOrderId}`, { state: { from: backTo } });
  }

  /* ────────────── Returns Sub-Flow ── */

  /** Opens the refusal form, defaulting each line's refused qty to its full qty. */
  function openRefuseForm() {
    const defaults: Record<string, string> = {};
    lines.forEach((l) => {
      defaults[l.id] = String(
        typeof l.qty === "string" ? parseFloat(l.qty) || 0 : (l.qty ?? 0),
      );
    });
    setRefuseQtyMap(defaults);
    setRefuseReason("");
    setRefusePhotosMap({});
    setShowRefuseForm(true);
  }

  async function handleUploadRefusePhoto(
    lineId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`, {
        title: t("Photo upload failed"),
      });
      e.target.value = "";
      return;
    }
    const fileId = uploadRes.data.id;
    const current = refusePhotosMap[lineId] ?? [];
    const createRes = await createLineReturnPhoto({
      line_id: lineId,
      photo_id: fileId,
      sort_order: current.length,
    });
    if (createRes.error || !createRes.data) {
      alert(`Failed to save photo: ${createRes.error}`, {
        title: t("Couldn't save photo"),
      });
      e.target.value = "";
      return;
    }
    setRefusePhotosMap((prev) => ({
      ...prev,
      [lineId]: [
        ...(prev[lineId] ?? []),
        { id: createRes.data!.id, fileId, url: getAssetUrl(fileId) },
      ],
    }));
    e.target.value = "";
  }

  /** STEP 0 — courier records what the customer refused/returned at delivery. */
  async function handleConfirmRefusal() {
    if (!id || submittingRefusal) return;
    const refusedLines = lines.filter(
      (l) => (parseFloat(refuseQtyMap[l.id] ?? "0") || 0) > 0,
    );
    if (refusedLines.length === 0) {
      alert(t("Enter a returned quantity for at least one item."), {
        title: t("Quantity required"),
      });
      return;
    }
    setSubmittingRefusal(true);
    for (const l of refusedLines) {
      const qty = parseFloat(refuseQtyMap[l.id] ?? "0") || 0;
      const res = await updateOrderLine(l.id, {
        returned: qty,
        return_verified: false,
        return_verified_at: null,
      });
      if (res.error) {
        alert(`Failed to record return on "${l.name}": ${res.error}`, {
          title: t("Couldn't record return"),
        });
        setSubmittingRefusal(false);
        return;
      }
    }
    const summary = refusedLines
      .map((l) => `"${l.name}" (${refuseQtyMap[l.id]} ${l.unit ?? ""})`)
      .join(", ");
    const refusalPatch = {
      stage: "returned",
      returned_reason: refuseReason.trim() || null,
    };
    const actionAt = new Date().toISOString();
    const res = await updateOrder(id, {
      ...refusalPatch,
      undo_snapshot: snapshotFor(refusalPatch, actionAt),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      const linesRes = await readOrderLines({
        filter: { order_id: { _eq: id } },
      });
      if (!linesRes.error) setLines(linesRes.data ?? []);
      await appendOrderHistory({
        order_id: id,
        what: `Return — ${summary} coming back to warehouse${refuseReason.trim() ? ` (${refuseReason.trim()})` : ""}`,
        who: userId,
        stage: "returned",
        at: actionAt,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
      setShowRefuseForm(false);
    } else {
      alert(`Failed to record the return: ${res.error}`, {
        title: t("Couldn't record return"),
      });
    }
    setSubmittingRefusal(false);
  }

  /** RECEIVE bucket — warehouse weighs the goods back in, per line, with one
   *  or more scale/condition photos. Backed by `line_return_photos` (the
   *  same multi-photo table the courier's refusal step already uses via
   *  `refusePhotosMap`/`handleUploadRefusePhoto`) rather than the single
   *  `order_lines.returned_weigh_photo` field this used to write — a line
   *  can need more than one angle on the scale. */
  async function handleUploadReceiveWeighPhoto(
    lineId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`, {
        title: t("Photo upload failed"),
      });
      e.target.value = "";
      return;
    }
    const fileId = uploadRes.data.id;
    const current = receivePhotosMap[lineId] ?? [];
    const createRes = await createLineReturnPhoto({
      line_id: lineId,
      photo_id: fileId,
      sort_order: current.length,
    });
    if (createRes.error || !createRes.data) {
      alert(`Failed to save weigh-back photo: ${createRes.error}`, {
        title: t("Couldn't save photo"),
      });
      e.target.value = "";
      return;
    }
    setReceivePhotosMap((prev) => ({
      ...prev,
      [lineId]: [
        ...(prev[lineId] ?? []),
        { id: createRes.data!.id, fileId, url: getAssetUrl(fileId) },
      ],
    }));
    e.target.value = "";
  }

  async function handleRemoveReceiveWeighPhoto(
    lineId: string,
    photoRowId: string,
  ) {
    const res = await deleteLineReturnPhoto(photoRowId);
    if (res.error) {
      alert(`Failed to remove photo: ${res.error}`, {
        title: t("Couldn't remove photo"),
      });
      return;
    }
    setReceivePhotosMap((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? []).filter((p) => p.id !== photoRowId),
    }));
    if (activeImageModal?.receivePhotoId === photoRowId)
      setActiveImageModal(null);
  }

  /** Direct receive (order still at `returned` stage) — per-LINE confirm,
   *  matching the design's independent per-line state (one line can show
   *  "confirmed" while a sibling line is still pending). Order-level
   *  `return_received` only flips once every returned line is verified. */
  async function handleConfirmReturnLine(lineId: string) {
    if (!id || confirmingReceive) return;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    setConfirmingReceive(true);
    const verifiedRaw = receiveQtyMap[lineId];
    const verified =
      verifiedRaw != null
        ? parseFloat(verifiedRaw) || 0
        : Number(line.returned);
    const res = await updateOrderLine(lineId, {
      returned: verified,
      return_verified: true,
      return_verified_at: new Date().toISOString(),
    });
    if (res.error || !res.data) {
      alert(`Failed to update "${line.name}": ${res.error}`, {
        title: t("Couldn't update line"),
      });
      setConfirmingReceive(false);
      return;
    }
    const updatedLines = lines.map((l) => (l.id === lineId ? res.data! : l));
    setLines(updatedLines);
    const stillPending = updatedLines.some(
      (l) => Number(l.returned) > 0 && !l.return_verified,
    );
    if (stillPending) {
      setConfirmingReceive(false);
      return;
    }
    const orderRes = await updateOrder(id, {
      return_received: true,
      return_received_at: new Date().toISOString(),
    });
    if (!orderRes.error && orderRes.data) {
      setOrder(orderRes.data);
      await appendOrderHistory({
        order_id: id,
        what: "Returned goods received & weighed at the warehouse",
        who: userId,
        stage: "returned",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to confirm receipt: ${orderRes.error}`, {
        title: t("Couldn't confirm receipt"),
      });
    }
    setConfirmingReceive(false);
  }

  /** Re-opens ONE returned line for re-weighing — per-line, matching the
   *  per-line confirm this port added on top of the prototype's own
   *  order-wide `reopenReceive` (`Dev-OrderDetail.jsx:551-562`; same
   *  `['Warehouse','Owner']` gate, same confirm-dialog copy). `returned`/
   *  photos are kept as a pre-fill (going back never deletes data) — only
   *  `return_verified` resets so this one box's weighing controls reappear;
   *  the order's `return_received`/`return_settle`/`return_doc` also reset
   *  since whatever Admin already decided may have been based on a
   *  since-corrected weight. */
  async function handleReopenReturnLine(line: OrderLinesCollection) {
    if (!id || !order || undoingInbound) return;
    if (
      !(await confirm(
        t(
          "Re-open the return for re-weighing? The warehouse will confirm it again.",
        ),
        { title: t("Re-open & re-weigh") },
      ))
    )
      return;
    setUndoingInbound(true);
    const res = await updateOrderLine(line.id, {
      return_verified: false,
      return_verified_at: null,
    });
    if (res.error || !res.data) {
      alert(`Failed to update "${line.name}": ${res.error}`, {
        title: t("Couldn't update line"),
      });
      setUndoingInbound(false);
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === line.id ? res.data! : l)));
    const orderRes = await updateOrder(id, {
      return_received: false,
      return_received_at: null,
      return_settle: null,
      return_doc: null,
    });
    if (!orderRes.error && orderRes.data) {
      setOrder(orderRes.data);
      await appendOrderHistory({
        order_id: id,
        what: `Return receive re-opened for re-weighing — ${line.name}`,
        who: userId,
        stage: "returned",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to reopen the return: ${orderRes.error}`, {
        title: t("Couldn't reopen return"),
      });
    }
    setUndoingInbound(false);
  }

  /** Re-opens ONE inbound-return line for re-weighing — same idea as
   *  `handleReopenReturnLine`, for the parallel (Incoming Return) path.
   *  Moves the verified value back from `returned` into `inbound_return`
   *  (the inverse of `handleConfirmInboundLine`) and brings the order back
   *  into the inbound-pending state so the Incoming Return card reappears
   *  if it had already fully collapsed. */
  async function handleReopenInboundLine(line: OrderLinesCollection) {
    if (!id || undoingInbound) return;
    if (
      !(await confirm(
        t(
          "Re-open the return for re-weighing? The warehouse will confirm it again.",
        ),
        { title: t("Re-open & re-weigh") },
      ))
    )
      return;
    setUndoingInbound(true);
    const res = await updateOrderLine(line.id, {
      inbound_return: Number(line.returned),
      returned: 0,
      return_verified: false,
      return_verified_at: null,
    });
    if (res.error || !res.data) {
      alert(`Failed to update "${line.name}": ${res.error}`, {
        title: t("Couldn't update line"),
      });
      setUndoingInbound(false);
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === line.id ? res.data! : l)));
    const orderRes = await updateOrder(id, {
      return_inbound: true,
      return_received: false,
      return_received_at: null,
    });
    if (!orderRes.error && orderRes.data) {
      setOrder(orderRes.data);
      await appendOrderHistory({
        order_id: id,
        what: `Return receive re-opened for re-weighing — ${line.name}`,
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to reopen the return: ${orderRes.error}`, {
        title: t("Couldn't reopen return"),
      });
    }
    setUndoingInbound(false);
  }

  /** INBOUND RETURN — the replacement was ordered before the goods came back;
   *  the warehouse receives + weighs them here, in parallel, whatever stage
   *  the replacement is now at. Per-LINE confirm, same as
   *  `handleConfirmReturnLine`. Verified weight moves from `inbound_return`
   *  (the snapshot taken at settle time) into `returned` — the same field
   *  the read-only Return Settlement card and the normal receive flow both
   *  read — so the record looks identical regardless of which path produced
   *  it. Ported from the prototype's `receiveInbound` (Dev-OrderDetail.jsx:465-475). */
  async function handleConfirmInboundLine(lineId: string) {
    if (!id || confirmingInbound) return;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    setConfirmingInbound(true);
    const verifiedRaw = receiveQtyMap[lineId];
    const verified =
      verifiedRaw != null
        ? parseFloat(verifiedRaw) || 0
        : Number(line.inbound_return);
    const res = await updateOrderLine(lineId, {
      returned: verified,
      inbound_return: null,
      return_verified: true,
      return_verified_at: new Date().toISOString(),
    });
    if (res.error || !res.data) {
      alert(`Failed to update "${line.name}": ${res.error}`, {
        title: t("Couldn't update line"),
      });
      setConfirmingInbound(false);
      return;
    }
    const updatedLines = lines.map((l) => (l.id === lineId ? res.data! : l));
    setLines(updatedLines);
    const stillPending = updatedLines.some((l) => Number(l.inbound_return) > 0);
    if (stillPending) {
      setConfirmingInbound(false);
      return;
    }
    const orderRes = await updateOrder(id, {
      return_received: true,
      return_received_at: new Date().toISOString(),
      return_inbound: false,
    });
    if (!orderRes.error && orderRes.data) {
      setOrder(orderRes.data);
      await appendOrderHistory({
        order_id: id,
        what: "Returned goods received & weighed at the warehouse (replacement already in progress)",
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to confirm receipt: ${orderRes.error}`, {
        title: t("Couldn't confirm receipt"),
      });
    }
    setConfirmingInbound(false);
  }

  /** Re-opens the inbound return for re-weighing — mirrors the quiet ghost
   *  "Undo" links elsewhere on this page (docs-returned, COD reconcile). */
  async function handleUndoInbound() {
    if (!id || undoingInbound) return;
    const receivedLines = lines.filter((l) => Number(l.returned) > 0);
    if (receivedLines.length === 0) return;
    setUndoingInbound(true);
    for (const l of receivedLines) {
      const res = await updateOrderLine(l.id, {
        inbound_return: Number(l.returned),
        returned: 0,
        return_verified: false,
        return_verified_at: null,
      });
      if (res.error) {
        alert(`Failed to update "${l.name}": ${res.error}`, {
          title: t("Couldn't update line"),
        });
        setUndoingInbound(false);
        return;
      }
    }
    const res = await updateOrder(id, {
      return_inbound: true,
      return_received: false,
      return_received_at: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      const linesRes = await readOrderLines({
        filter: { order_id: { _eq: id } },
      });
      if (!linesRes.error) setLines(linesRes.data ?? []);
      await appendOrderHistory({
        order_id: id,
        what: "Return receive re-opened for re-weighing",
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to reopen the return: ${res.error}`, {
        title: t("Couldn't reopen return"),
      });
    }
    setUndoingInbound(false);
  }

  /** SETTLE bucket — admin picks the Accurate document type, branching to close or replacement. */
  /** SETTLE bucket, return-note path — optional photo of the printed Sales
   *  Return Note, staged here and attached as a `return_documents` row (kind
   *  `note`) once Confirm is pressed. Ported from the prototype's
   *  `retNotePhoto` (`Dev-OrderDetail.jsx:94,1249`). */
  async function handleUploadReturnNotePhoto(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Upload failed: ${uploadRes.error}`, { title: t("Upload failed") });
      e.target.value = "";
      return;
    }
    setNoteFileIds((prev) => [...prev, uploadRes.data!.id]);
    e.target.value = "";
  }

  function handleRemoveReturnNotePhoto(fileId: string) {
    setNoteFileIds((prev) => prev.filter((id) => id !== fileId));
  }

  async function handleConfirmSettle() {
    if (!id || !order || confirmingSettle) return;
    const doc = RETURN_DOC_OPTIONS.find((d) => d.key === selectedDocType);
    if (!doc) return;
    setConfirmingSettle(true);

    if (doc.replacement) {
      // The admin may settle on a replacement BEFORE the goods are physically
      // back (the courier already counted them) — then the inbound return is
      // tracked in parallel: each line snapshots what's coming back
      // (inbound_return) and the order carries return_inbound until the
      // warehouse receives it via the Incoming Return card. Ported from the
      // prototype's `pending`/`inboundReturn` (Dev-OrderDetail.jsx:410-413).
      const pending = !order.return_received;
      const returnedLines = lines.filter((l) => Number(l.returned) > 0);
      for (const l of returnedLines) {
        const res = await updateOrderLine(l.id, {
          returned: 0,
          delivered: 0,
          return_verified: false,
          return_verified_at: null,
          ...(pending ? { inbound_return: Number(l.returned) } : {}),
        });
        if (res.error) {
          alert(`Failed to reset "${l.name}": ${res.error}`, {
            title: t("Couldn't reset line"),
          });
          setConfirmingSettle(false);
          return;
        }
      }
      const replacementPatch = {
        stage: "cold",
        is_replacement: true,
        return_doc: doc.label,
        return_settle: null,
        return_received: false,
        return_received_at: null,
        return_inbound: pending,
      };
      const actionAt = new Date().toISOString();
      const res = await updateOrder(id, {
        ...replacementPatch,
        undo_snapshot: snapshotFor(replacementPatch, actionAt),
      });
      if (!res.error && res.data) {
        setOrder(res.data);
        const linesRes = await readOrderLines({
          filter: { order_id: { _eq: id } },
        });
        if (!linesRes.error) setLines(linesRes.data ?? []);
        await appendOrderHistory({
          order_id: id,
          what: `Return + replacement (${doc.label}) — back to Cold Storage${pending ? " (return still coming back)" : ""}`,
          who: userId,
          stage: "cold",
          at: actionAt,
        });
        const hRes = await readOrderHistory(id);
        if (!hRes.error) setHistory(hRes.data ?? []);
      } else {
        alert(`Failed to process the replacement: ${res.error}`, {
          title: t("Couldn't process replacement"),
        });
      }
    } else if (doc.key === "revise-return") {
      const res = await updateOrder(id, {
        return_doc: doc.label,
        return_settle: "sign",
      });
      if (!res.error && res.data) {
        setOrder(res.data);
        await appendOrderHistory({
          order_id: id,
          what: "Revised DO/SI issued — awaiting the signed copy back",
          who: userId,
          stage: "returned",
        });
        const hRes = await readOrderHistory(id);
        if (!hRes.error) setHistory(hRes.data ?? []);
      } else {
        alert(`Failed to issue the revised DO/SI: ${res.error}`, {
          title: t("Couldn't issue DO/SI"),
        });
      }
    } else {
      // return-note: nothing physical goes out — closes immediately. The
      // return-note photo is optional (matches the prototype's own "·
      // optional" label) — saved first, same order as the signed-doc path,
      // so a failed attach doesn't leave the order closed with a silently
      // lost photo.
      for (const fileId of noteFileIds) {
        const docRes = await createReturnDocument({
          order_id: id,
          kind: "note",
          photo_id: fileId,
        });
        if (docRes.error) {
          alert(`Failed to save the return note photo: ${docRes.error}`, {
            title: t("Couldn't save document"),
          });
          setConfirmingSettle(false);
          return;
        }
        setReturnDocs((prev) => [docRes.data!, ...prev]);
      }
      const res = await updateOrder(id, {
        return_doc: doc.label,
        return_settle: "done",
      });
      if (!res.error && res.data) {
        setOrder(res.data);
        await appendOrderHistory({
          order_id: id,
          what: `Return closed — ${doc.label}`,
          who: userId,
          stage: "returned",
        });
        const hRes = await readOrderHistory(id);
        if (!hRes.error) setHistory(hRes.data ?? []);
        setNoteFileIds([]);
      } else {
        alert(`Failed to close the return: ${res.error}`, {
          title: t("Couldn't close return"),
        });
      }
    }
    setConfirmingSettle(false);
  }

  /** SIGN bucket — upload the customer-signed revised DO/SI, then close. */
  async function handleUploadSignedDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Upload failed: ${uploadRes.error}`, { title: t("Upload failed") });
      e.target.value = "";
      return;
    }
    setSignedDocFileId(uploadRes.data.id);
    e.target.value = "";
  }

  async function handleMarkSignedAndClose() {
    if (!id || !signedDocFileId || closingSigned) return;
    setClosingSigned(true);
    const docRes = await createReturnDocument({
      order_id: id,
      kind: "signed_doc",
      photo_id: signedDocFileId,
    });
    if (docRes.error) {
      alert(`Failed to save the signed document: ${docRes.error}`, {
        title: t("Couldn't save document"),
      });
      setClosingSigned(false);
      return;
    }
    setReturnDocs((prev) => [docRes.data!, ...prev]);
    const res = await updateOrder(id, { return_settle: "done" });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Revised DO/SI signed & returned — order closed",
        who: userId,
        stage: "returned",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
      setSignedDocFileId(null);
    } else {
      alert(`Failed to close the return: ${res.error}`, {
        title: t("Couldn't close return"),
      });
    }
    setClosingSigned(false);
  }

  async function submitNote() {
    if (!noteText.trim() || savingNote || !id) return;
    setSavingNote(true);
    const res = await appendOrderHistory({
      order_id: id,
      what: `Note: ${noteText.trim()}`,
      who: userId,
      stage,
    });
    if (!res.error && res.data) {
      setHistory((prev) => [...prev, res.data!]);
      setNoteText("");
    } else {
      alert(`Failed to add note: ${res.error}`, {
        title: t("Couldn't add note"),
      });
    }
    setSavingNote(false);
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    await submitNote();
  }
  async function copyWA() {
    if (!order) return;
    const itemsText = lines
      .map((l) => `• ${l.qty} ${l.unit} ${l.name}`)
      .join("\n");
    const d = order.deliver_at ? new Date(order.deliver_at) : new Date();
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const txt = [
      `*Konfirmasi Pesanan #${order.no}*`,
      order.customer_name ?? "",
      `Kirim: ${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
      "",
      itemsText,
      order.notes ? `\nCatatan: ${order.notes}` : null,
      "",
      "Terima kasih 🙏",
      "PT Inti Pangan Perkasa",
    ]
      .filter((x) => x !== null)
      .join("\n");
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    alert(t("WhatsApp order confirmation copied to clipboard."), {
      title: t("Copied"),
    });
  }

  /* ────────────── render ── */

  return (
    <div className={styles.container}>
      {/* ── Main Content & Side Panel Grid ── */}
      <div
        className={[
          styles.layoutGrid,
          isPanelOpen ? styles.layoutGridWithPanel : styles.layoutGridFull,
        ].join(" ")}
      >
        {/* ── Main Column ── */}
        <div className={styles.mainColumn}>
          {/* ── Top Header ── */}
          <header className={styles.header}>
            <div className={styles.topActionsRow}>
              <Button
                type="button"
                variant="tertiary"
                icon="chevronLeft"
                onClick={() => navigate(backTo)}
              >
                {t("Back")}
              </Button>
              <div className={styles.actions}>
                {/* Ported from the prototype's `can(role, 'createOrders')`
                  (`Dev-OrderDetail.jsx:1278`) — was unconditionally visible
                  to every role. `createOrders` defaults to Admin only (+
                  Owner always), so in practice this is Admin/Owner, but
                  driven by the capability rather than a hardcoded role
                  check so an Owner Settings grant to another role also
                  enables it. */}
                {auth.can("createOrders") && (
                  <Button
                    type="button"
                    variant="secondary"
                    icon="whatsapp"
                    onClick={copyWA}
                  >
                    {t("Copy WA")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  icon="printer"
                  onClick={() => window.print()}
                >
                  {t("Print")}
                </Button>
                {canEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    icon="edit"
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                  >
                    {t("Edit")}
                  </Button>
                )}
              </div>
            </div>

            <div className={styles.titleRow}>
              <h3 className={styles.title}>
                {t("Order")} {order.no}
              </h3>
              <div className={styles.pillsContainer}>
                {isCancelled && (
                  <div className={styles.pill}>
                    <Icon name="cancelled" />
                    Cancelled
                  </div>
                )}
                {isReturned && (
                  <div className={`${styles.pill} ${styles.pillError}`}>
                    <Icon name="returned" />
                    Returned
                  </div>
                )}
                {order.is_replacement && (
                  <div className={`${styles.pill} ${styles.pillWarning}`}>
                    <Icon name="reload" size={16} />
                    Replacement
                  </div>
                )}
                {isHold && (
                  <div className={`${styles.pill} ${styles.pillWarning}`}>
                    <Icon name="pause" size={16} />
                    On Hold
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Stepper — once delivered, replace the 8-step track with one
              prominent "done" banner instead of a stepper with nothing left
              to step through. */}
          {stage === "delivered" ? (
            <Card
              style={{
                backgroundColor: "var(--bg-surface-hover-dark)",
                borderColor: "var(--accent-primary)",
              }}
            >
              <div className={styles.cardContent}>
                <div className={styles.successCard}>
                  <div
                    className={styles.left}
                    style={{ color: "var(--accent-primary)" }}
                  >
                    <Icon name="check" size={24} />
                    <div className={styles.deliveredBannerTitleColumn}>
                      <div className={styles.deliveredBannerTitle}>
                        {t("Delivered & Closed")}
                      </div>
                      {order.taken_by && (
                        <span className={styles.muted}>
                          {t("by")} {displayName(order.taken_by)}
                        </span>
                      )}
                    </div>
                  </div>
                  {activeProof && (
                    <div className={styles.thumbnailsContainer}>
                      {(
                        [
                          { key: "cond", label: t("Condition photo") },
                          {
                            key: "recv",
                            label:
                              handoffMode === "pickup"
                                ? t("Photo of who collected")
                                : t("Receiver photo"),
                          },
                          { key: "signed", label: t("Signed doc") },
                        ] as const
                      ).flatMap(({ key, label }) =>
                        attachments
                          .filter(
                            (a) =>
                              a.proof_id === activeProof.id &&
                              a.doc_type === key,
                          )
                          .map((a) => (
                            <div
                              key={a.id}
                              className={styles.thumbnailItem}
                              onClick={() =>
                                setActiveImageModal({
                                  url: getAssetUrl(a.document_file ?? ""),
                                  title: label,
                                  attachmentId: undefined,
                                })
                              }
                            >
                              <img
                                src={getAssetUrl(a.document_file ?? "")}
                                alt=""
                                className={styles.thumbnailImg}
                              />
                            </div>
                          )),
                      )}
                    </div>
                  )}
                </div>
                {order.deliver_geo && (
                  <div className={styles.dropLocationRow}>
                    <span className={styles.dropLocationText}>
                      <Icon name="location" size={14} />
                      {dropDistanceM !== null
                        ? `${t("Dropped at delivery address")} · ~${dropDistanceM}m`
                        : t("Delivery location captured")}{" "}
                      · {formatClock(order.deliver_geo.at)}
                    </span>
                    <Button
                      type="button"
                      variant="tertiary"
                      className={styles.inlineButton}
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${order.deliver_geo!.lat},${order.deliver_geo!.lng}`,
                          "_blank",
                          "noopener",
                        )
                      }
                    >
                      {t("Map")}
                    </Button>
                  </div>
                )}
                {activeProof?.name && (
                  <div className={styles.receivedByRow}>
                    {t("Received by")} <strong>{activeProof.name}</strong>
                  </div>
                )}
              </div>
            </Card>
          ) : isHold ? (
            <Card className={styles.warningCard}>
              <div className={styles.cardContent}>
                <div className={styles.warningHeader}>
                  <Icon name="pause" size={20} />
                  <span className={styles.warningTitle}>{t("On hold")}</span>
                </div>

                {canHold ? (
                  <div className={styles.cardListColumn}>
                    <p>
                      {t(
                        "This order is paused — the process cannot continue until it is resumed.",
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      buttonStyle="fullWidth"
                      size="lg"
                      icon="play"
                      tone="warning"
                      onClick={handleToggleHold}
                    >
                      {t("Resume order")}
                    </Button>
                  </div>
                ) : (
                  <p>
                    This order is paused — the process cannot continue until{" "}
                    <strong>Admin</strong> or <strong>Owner</strong> resumes it.
                  </p>
                )}
              </div>
            </Card>
          ) : isReturned && !isCancelled ? (
            <Card className={styles.errorCard}>
              <div className={styles.heading}>Customer return</div>
              <div className={styles.cardContent}>
                {canReceiveReturn && !order.return_received && (
                  <div className={styles.cardListColumn}>
                    <span className={styles.row}>
                      <p className={styles.fieldLabel}>{t("Warehouse ")}</p>
                      <p className={styles.muted}>— receive & verify</p>
                      <div className={styles.separator}></div>
                    </span>
                    <p className={styles.secondary}>
                      {t(
                        "Weigh or count what actually came back, then confirm.",
                      )}
                    </p>
                  </div>
                )}
                {lines
                  .filter((l) => Number(l.returned) > 0)
                  .map((l) => (
                    <ReturnLineBox
                      key={l.id}
                      line={l}
                      pendingAmount={Number(l.returned)}
                      returnedReason={order.returned_reason}
                      orderReturnReceived={order.return_received}
                      canReceiveReturn={canReceiveReturn}
                      confirming={confirmingReceive}
                      reopening={undoingInbound}
                      onConfirm={handleConfirmReturnLine}
                      onReopen={handleReopenReturnLine}
                      receiveQtyValue={receiveQtyMap[l.id]}
                      onReceiveQtyChange={(lineId, value) =>
                        setReceiveQtyMap((prev) => ({
                          ...prev,
                          [lineId]: value,
                        }))
                      }
                      photos={receivePhotosMap[l.id] ?? []}
                      onUploadPhoto={handleUploadReceiveWeighPhoto}
                      onRemovePhoto={handleRemoveReceiveWeighPhoto}
                      onOpenImage={setActiveImageModal}
                      t={t}
                    />
                  ))}

                {inSettleBucket && (
                  <div className={styles.cardListColumn}>
                    {canDecideReturn && (
                      <span className={styles.row}>
                        <p className={styles.fieldLabel}>{t("Admin ")}</p>
                        <p className={styles.muted}>
                          — update Accurate, then process
                        </p>
                        <div className={styles.separator}></div>
                      </span>
                    )}
                    {canDecideReturn ? (
                      <>
                        {!order.return_received && (
                          <p>
                            {lines.some(
                              (l) =>
                                Number(l.returned) > 0 && isWeighedUnit(l.unit),
                            )
                              ? t(
                                  "Goods not back yet — counted quantities are exact; the kg/loaf credit is provisional until the warehouse weighs the return.",
                                )
                              : t(
                                  "Goods not back yet — quantities are exact (counted). You can prepare everything now.",
                                )}
                          </p>
                        )}
                        <select
                          className={styles.editInput}
                          style={{ width: "100%" }}
                          value={selectedDocType}
                          onChange={(e) => setSelectedDocType(e.target.value)}
                        >
                          <option value="">
                            {t("— how is this settled in Accurate? —")}
                          </option>
                          {RETURN_DOC_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {t(opt.label)}
                            </option>
                          ))}
                        </select>
                        {selectedDocType === "return-note" && (
                          <>
                            <label className={styles.row}>
                              <Checkbox
                                size="sm"
                                checked={retPrinted}
                                onChange={setRetPrinted}
                                label={t("Input in Accurate & printed")}
                              />
                              {t("Input in Accurate & printed")}
                            </label>
                            <PhotoUploadButton
                              variant="secondary"
                              icon={noteFileIds.length > 0 ? "check" : "camera"}
                              label={
                                noteFileIds.length > 0
                                  ? t("Photo attached")
                                  : t("Photo of the return note (optional)")
                              }
                              photos={noteFileIds.map((fileId) => ({
                                id: fileId,
                                fileId,
                                url: getAssetUrl(fileId),
                              }))}
                              onUpload={handleUploadReturnNotePhoto}
                              onRemove={handleRemoveReturnNotePhoto}
                              onOpenImage={(p) =>
                                setActiveImageModal({
                                  url: p.url,
                                  title: t("Photo of the return note"),
                                })
                              }
                            />
                          </>
                        )}

                        <div className={styles.cardActions}>
                          <Button
                            type="button"
                            variant="primary"
                            buttonStyle="fullWidth"
                            icon="check"
                            size="lg"
                            onClick={handleConfirmSettle}
                            disabled={
                              !selectedDocType ||
                              confirmingSettle ||
                              (selectedDocType === "return-note" &&
                                !retPrinted) ||
                              (!!selectedDoc &&
                                !selectedDoc.replacement &&
                                selectedDoc.key !== "revise-return" &&
                                !order.return_received)
                            }
                          >
                            {confirmingSettle
                              ? t("Saving…")
                              : !selectedDoc
                                ? t("Confirm & close")
                                : selectedDoc.replacement
                                  ? t("Send replacement — back to Cold Storage")
                                  : selectedDoc.key === "revise-return"
                                    ? t("Send revised DO/SI for signing")
                                    : t("Confirm & close")}
                          </Button>
                        </div>
                        <div className={styles.hints}>
                          {selectedDoc &&
                            !selectedDoc.replacement &&
                            selectedDoc.key !== "revise-return" &&
                            !order.return_received && (
                              <div className={styles.infoHint}>
                                <p className={styles.secondary}>
                                  {t(
                                    "The order closes only after the warehouse receives the goods.",
                                  )}
                                </p>
                              </div>
                            )}
                          {selectedDoc && (
                            <div className={styles.infoHint}>
                              <div className={styles.iconWrapper}>
                                <Icon
                                  name="infoCircle"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </div>
                              <p className={styles.muted}>
                                {selectedDoc.key === "single-replace"
                                  ? t(
                                      "ONE document: the original DO/SI is revised to show what the customer finally keeps incl. the replacement. Best for a like-for-like swap.",
                                    )
                                  : selectedDoc.key === "separate-replace"
                                    ? t(
                                        "TWO documents: a Sales Return Note credits what came back + a NEW DO/SI for the replacement shipment. Best when the replacement differs (item / kg / price) or ships another day.",
                                      )
                                    : selectedDoc.key === "revise-return"
                                      ? t(
                                          "The revised DO/SI goes to the customer to sign before the order closes.",
                                        )
                                      : t(
                                          "Returned goods credited — the order closes.",
                                        )}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className={styles.secondary}>
                        {order.return_received
                          ? t(
                              "Received — waiting for an admin to update the Accurate documents and decide.",
                            )
                          : t(
                              "Waiting for an admin to update Accurate & decide — this can run before the goods arrive.",
                            )}
                      </p>
                    )}
                  </div>
                )}

                {inSignBucket && (
                  <div className={styles.followUpRow}>
                    <Icon
                      style={{
                        flexShrink: 0,
                        color: "var(--state-error)",
                      }}
                      name="documentWait"
                    />
                    <div className={styles.followUpMain}>
                      <p className={styles.fieldLabel}>
                        {t("Awaiting Signed DO/SI")}
                      </p>

                      {latestSignedDoc ? (
                        <p className="tiny muted">
                          {t(
                            "Signed document on file — order closes once received.",
                          )}
                        </p>
                      ) : canSignReturn ? (
                        <label
                          style={{ cursor: "pointer", display: "inline-block" }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleUploadSignedDoc}
                          />
                          {signedDocFileId
                            ? t("Photo attached ✓")
                            : t("Attach signed document")}
                        </label>
                      ) : (
                        <p className="tiny muted">
                          {t("Revised DO/SI is out with the customer to sign.")}
                        </p>
                      )}
                    </div>

                    {!latestSignedDoc && canSignReturn && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleMarkSignedAndClose}
                        disabled={!signedDocFileId || closingSigned}
                      >
                        {closingSigned
                          ? t("Saving…")
                          : t("Mark signed & close")}
                      </Button>
                    )}
                  </div>
                )}

                {order.is_replacement && !isDelivered && (
                  <p className="tiny muted">
                    {t(
                      "Replacement re-entered the pipeline and is currently at",
                    )}{" "}
                    <strong>
                      {t(
                        PIPELINE_STAGES.find((s) => s.key === stage)?.label ??
                          stage,
                      )}
                    </strong>
                    .
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <div
              className={styles.stepperContainer}
              style={{ "--completed-pct": completedPct } as React.CSSProperties}
            >
              <div className={styles.stepperTrack}>
                {PIPELINE_STAGES.map((s, idx) => {
                  const isActive = stage === s.key;
                  const isCompleted = currentStageIndex > idx;

                  return (
                    <div key={s.key} className={styles.stepColumn}>
                      <div className={styles.stepHeaderRow}>
                        <div
                          className={[
                            styles.stepLine,
                            idx === 0 ? styles.stepLineInvisible : "",
                            currentStageIndex >= idx
                              ? styles.stepLineCompleted
                              : "",
                          ].join(" ")}
                        />
                        <div
                          className={[
                            styles.stepDot,
                            isActive ? styles.stepDotActive : "",
                            isCompleted ? styles.stepDotCompleted : "",
                          ].join(" ")}
                        />
                        <div
                          className={[
                            styles.stepLine,
                            idx === PIPELINE_STAGES.length - 1
                              ? styles.stepLineInvisible
                              : "",
                            currentStageIndex > idx
                              ? styles.stepLineCompleted
                              : "",
                          ].join(" ")}
                        />
                      </div>
                      <span
                        className={[
                          styles.stepLabel,
                          isActive ? styles.stepLabelActive : "",
                          isCompleted ? styles.stepLabelCompleted : "",
                        ].join(" ")}
                      >
                        {t(s.label)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showActorNotice && (
            <div className={styles.actorNotice}>
              <span>
                This order is currently with <strong>{stageActor}</strong>. You
                can view it, but the action is theirs.
              </span>
            </div>
          )}

          {/* Deliver-to address + Navigate + Collect COD chip */}
          {stage === "dispatch" &&
            canAdvance &&
            handoffMode !== "pickup" &&
            (canSeeCustomerContact || isStageActor) &&
            order.customer_address && (
              <Card className={styles.warningCard}>
                <div
                  className={styles.proofHeaderRow}
                  style={{ paddingBottom: "var(--space-md)" }}
                >
                  <div className={styles.row}>
                    <Icon
                      name="delivered"
                      size={20}
                      style={{ color: "var(--state-warning)", flexShrink: 0 }}
                    />

                    <p className={styles.warningTitle}>{t("Deliver to")}</p>
                  </div>

                  {codApplies && codAmount > 0 && (
                    <span className={styles.codOwedChip}>
                      {t("Collect COD")} {currency.format(codAmount)}
                    </span>
                  )}
                </div>
                <div>
                  <div className={styles.fieldLabel}>
                    {order.customer_address}
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    icon="navigation"
                    tone="warning"
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer_address ?? "")}`,
                        "_blank",
                        "noopener",
                      )
                    }
                  >
                    {t("Navigate")}
                  </Button>
                </div>
              </Card>
            )}

          {/* "Isn't weighed yet" safety net — a kg/gram/loaf line added (or
              unit-changed) after Cold Storage, still in the warehouse.
              Ported from the prototype's own banner (`Dev-OrderDetail.jsx:1314-1321`). */}
          {needsWeighing && (
            <Card className={styles.warningCard}>
              <div className={styles.row}>
                <Icon
                  name="weight"
                  size={20}
                  style={{ color: "var(--state-warning)", flexShrink: 0 }}
                />
                <p className={styles.warningHeader}>
                  <strong>
                    {unweighedAdded.map((l) => l.name).join(", ")}
                  </strong>{" "}
                  — {t("isn't weighed yet (added after Cold Storage).")}
                </p>
              </div>
              {canWeighFix && (
                <div className={styles.cardActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    icon="arrowRight"
                    onClick={handleSendToColdToWeigh}
                    disabled={advancing}
                    tone="warning"
                  >
                    {t("Send to Cold Storage to weigh")}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {showFinanceUndoRow && (
            <Card className={styles.warningCard}>
              <div className={styles.warningHeader}>
                <Icon
                  name="paymentSuccess"
                  size={20}
                  style={{ color: "var(--state-warning)" }}
                />
                <div className={styles.warningTitle}>
                  {t("Payment cleared by Finance")}
                </div>
              </div>
              <p>
                {t("Payment cleared by Finance")} —{" "}
                {stage === "cold"
                  ? t("cleared while still at Cold Storage.")
                  : t("the order has moved on past the gate.")}{" "}
                {t("Cleared by mistake?")}
              </p>
              <div className={styles.cardActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUndoFinanceClear}
                  disabled={approvingFinance}
                  icon="undo"
                  tone="warning"
                >
                  {t("Undo payment clearance")}
                </Button>
              </div>
            </Card>
          )}

          {/* Customer Info Card */}
          <Card className={styles.customerCard}>
            <div
              className={[
                styles.profileRow,
                customerId ? styles.profileRowClickable : "",
              ].join(" ")}
              onClick={() => {
                if (customerId)
                  navigate(`/customers/${customerId}`, {
                    state: { from: location.pathname },
                  });
              }}
              title={customerId ? t("View customer details") : undefined}
            >
              <Avatar
                initials={getInitials(order.customer_name) || "??"}
                label={order.customer_name || ""}
                size="lg"
              ></Avatar>
              <div className={styles.customerInfo}>
                <h3>{order.customer_name || "—"}</h3>
                <p>
                  {matchedCustomer?.channel?.toUpperCase() || t("Horeca · B2B")}
                </p>
              </div>
            </div>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>{t("Delivery Date")}</span>
                <span className={styles.detailValue}>
                  {formatDate(order.deliver_at)}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>{t("Order Date")}</span>
                <span className={styles.detailValue}>
                  {order.order_date
                    ? new Date(order.order_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              {canSeeCustomerContact && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t("Sales Rep")}</span>
                  <span className={styles.detailValue}>
                    {order.sales ?? order.sales_rep ?? "—"}
                  </span>
                </div>
              )}
              {canSeeCustomerContact && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t("Contact")}</span>
                  <span className={styles.detailValue}>
                    {order.customer_contact || matchedCustomer?.contact || "—"}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Items Card */}
          <Card>
            <div className={styles.heading}>
              {t("Items")} <span className={styles.count}>{lines.length}</span>
            </div>

            {/* View Mode Items List */}
            <div className={styles.itemsList}>
              {lines.map((line) => {
                const qty =
                  typeof line.qty === "string"
                    ? parseFloat(line.qty) || 0
                    : (line.qty ?? 0);
                const price =
                  typeof line.price === "string"
                    ? parseFloat(line.price) || 0
                    : (line.price ?? 0);
                const hasPrice = lineHasPrice(line);
                const isWeighedItem = isWeighedUnit(line.unit);

                const weighingLines = line.id
                  ? (weighingsMap[line.id] ?? [])
                  : [];
                const totalMeasuredWeight = weighingLines.reduce(
                  (acc, w) => acc + (parseFloat(w.weight) || 0),
                  0,
                );
                // Gentle "does this look right?" hint, never a block — ported
                // from the prototype's belowHint/aboveHint (Dev-OrderDetail.jsx:1350-1351).
                // The Settings-configurable tol_below_pct/tol_above_pct (both
                // default 10%, matching the prototype's DEFAULT_SETTINGS) were
                // already wired up end-to-end on the Settings page and live
                // schema — only this consuming check was missing.
                const tolBelowPct = opsSettings?.tol_below_pct ?? 10;
                const tolAbovePct = opsSettings?.tol_above_pct ?? 10;
                const belowWeighHint =
                  isWeightOnlyUnit(line.unit) &&
                  totalMeasuredWeight > 0 &&
                  qty > 0 &&
                  totalMeasuredWeight < qty * (1 - tolBelowPct / 100);
                const aboveWeighHint =
                  isWeightOnlyUnit(line.unit) &&
                  totalMeasuredWeight > 0 &&
                  qty > 0 &&
                  totalMeasuredWeight > qty * (1 + tolAbovePct / 100);
                const itemPhotos = line.id
                  ? (itemPhotosMap[line.id] ?? [])
                  : [];
                const sendingQty = line.id
                  ? (sendingQtyMap[line.id] ?? qty)
                  : qty;
                // Ported from the prototype's line-detail gate
                // (`Dev-OrderDetail.jsx:1425`, `l.weight || (priceOk &&
                // l.price) || ...`) — only render the summary row when it
                // actually has something to show. Gated on the real
                // measured-weight VALUE (not just "is this a weighed-unit
                // line"), matching the prototype's own `l.weight` check —
                // previously any weighed-unit line (loaf/kg/gram) forced the
                // row to show even with nothing weighed yet and no price,
                // rendering a bare "Total:" with nothing after it (at intake
                // the number is always hidden; past intake, an un-weighed
                // line still had `totalMeasuredWeight === 0`).
                const showsWeightTotal =
                  isWeighedItem &&
                  stage !== "intake" &&
                  totalMeasuredWeight > 0;
                const showLineDetail =
                  showsWeightTotal ||
                  (isWeightOnlyUnit(line.unit) && !!line.short) ||
                  (canSeePrices && hasPrice);

                return (
                  <div key={line.id} className={styles.itemRow}>
                    <div className={styles.itemHeader}>
                      <div className={styles.itemInfo}>
                        <span className={styles.itemIndex}>{qty}</span>
                        <span className={styles.unitTag}>{line.unit}</span>
                        <span className={styles.itemName}>{line.name}</span>
                      </div>
                      {/* Cold Storage only, and never on kg/gram — matches
                          the prototype's exact gate (`Dev-OrderDetail.jsx
                          :1364`: `weighing && counted && remaining(l) >= 1`,
                          where `weighing = stage==='cold'` and `counted =
                          !isWeightUnit`). kg/gram lines are held back via
                          the Short flag instead; Loaf falls into the same
                          "counted" branch for hold purposes even though it
                          also gets weight inputs. Previously shown at every
                          stage past cold too (a deliberate port-specific
                          extension for "X to follow" visibility) — reverted
                          to the prototype's own scope per direct request. */}
                      {stage === "cold" &&
                        !isWeightOnlyUnit(line.unit) &&
                        qty >= 1 && (
                          <div className={styles.sendingBadge}>
                            {t("sending")}
                            {canWeighHere ? (
                              <input
                                type="number"
                                className={styles.sendingInput}
                                value={sendingQty}
                                min={0}
                                max={qty}
                                onChange={(e) => {
                                  // Capped at the ordered qty — sending can
                                  // never exceed what was actually ordered.
                                  const val = Math.min(
                                    qty,
                                    Math.max(0, parseInt(e.target.value) || 0),
                                  );
                                  if (line.id)
                                    setSendingQtyMap((prev) => ({
                                      ...prev,
                                      [line.id!]: val,
                                    }));
                                }}
                                onBlur={() =>
                                  line.id && handleSendingBlur(line.id)
                                }
                              />
                            ) : (
                              // Only the role that owns Cold Storage picking
                              // decides what's actually being sent — everyone
                              // else (Finance, etc.) sees the saved figure but
                              // can't edit it.
                              <span className={styles.sendingValue}>
                                {sendingQty}
                              </span>
                            )}
                            {t("of")} {qty}
                            {sendingQty < qty && (
                              <span className={styles.toFollowHint}>
                                · {qty - sendingQty} {t("to follow")}
                              </span>
                            )}
                          </div>
                        )}
                    </div>

                    {/* Weighing Lines for Loaf/kg items — cold storage's job only */}
                    {isWeighedItem && canWeighHere && (
                      <div className={styles.weighingSection}>
                        {weighingLines.map((w) => (
                          <div key={w.id} className={styles.weighingRow}>
                            <input
                              type="text"
                              className={styles.weighingInput}
                              placeholder="0.00"
                              value={w.weight}
                              onChange={(e) =>
                                handleUpdateWeighingWeight(
                                  line.id,
                                  w.id,
                                  e.target.value,
                                )
                              }
                              onBlur={() => handleWeighingBlur(line.id, w.id)}
                            />
                            <span className={styles.unitText}>kg</span>

                            <label
                              style={{
                                display: "inline-flex",
                                cursor: "pointer",
                              }}
                            >
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon="camera"
                                iconOnly
                                title={t("Add weighing photo")}
                                onClick={(e) => {
                                  const inputElem = (
                                    e.currentTarget as HTMLElement
                                  ).nextElementSibling as HTMLInputElement;
                                  inputElem?.click();
                                }}
                              />
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={(e) =>
                                  handleUploadWeighingPhoto(line.id, w.id, e)
                                }
                              />
                            </label>

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              icon="trash"
                              iconOnly
                              title={t("Remove weighing")}
                              onClick={() =>
                                handleRemoveWeighing(line.id, w.id)
                              }
                            />

                            {w.photos.length > 0 && (
                              <div
                                className={styles.thumbnailsContainer}
                                style={{ marginLeft: 28 }}
                              >
                                {w.photos.map((p) => (
                                  <div
                                    key={p.id}
                                    className={styles.thumbnailItem}
                                    onClick={() =>
                                      setActiveImageModal({
                                        url: p.url,
                                        title: `${t("Weighing photo —")} ${line.name}`,
                                        weighingLineId: line.id,
                                        weighingId: w.id,
                                        weighingPhotoId: p.id,
                                      })
                                    }
                                  >
                                    <img
                                      src={p.url}
                                      alt="scale"
                                      className={styles.thumbnailImg}
                                    />
                                    <div
                                      className={styles.thumbnailHoverTrash}
                                      title={t("Delete image")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveWeighingPhoto(
                                          line.id,
                                          w.id,
                                          p.id,
                                        );
                                      }}
                                    >
                                      <Icon name="trash" size={14} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          icon="add"
                          style={{ alignSelf: "flex-start" }}
                          onClick={() => handleAddWeighing(line.id)}
                        >
                          {t("Add weighing")}
                        </Button>

                        {/* Ported from the prototype's `shortFlag` toggle
                            (Dev-OrderDetail.jsx:1419-1422) — kg/gram only,
                            never Loaf (matches `held()`'s own scope). */}
                        {isWeightOnlyUnit(line.unit) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            icon="cancelled"
                            isActive={!!line.short}
                            style={{
                              alignSelf: "flex-start",
                            }}
                            onClick={() =>
                              line.id &&
                              handleToggleShort(line.id, !!line.short)
                            }
                          >
                            {t("Short — ran out of stock")}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Delivered is a closed record — final weights + photos
                        as plain text/images, no inputs/camera/add-weighing.
                        A weight correction after delivery goes through
                        Reopen, not an inline edit on the closed order. */}
                    {isWeighedItem &&
                      stage === "delivered" &&
                      weighingLines.length > 0 && (
                        <div className={styles.weighingSectionReadOnly}>
                          {weighingLines.map((w) => (
                            <div
                              key={w.id}
                              className={styles.weighingRowReadOnly}
                            >
                              <span className={styles.weighingValueReadOnly}>
                                {w.weight || "0.00"} kg
                              </span>
                              {w.photos.length > 0 && (
                                <div
                                  className={styles.thumbnailsContainer}
                                  style={{ marginLeft: "0.5rem" }}
                                >
                                  {w.photos.map((p) => (
                                    <div
                                      key={p.id}
                                      className={styles.thumbnailItem}
                                      onClick={() =>
                                        setActiveImageModal({
                                          url: p.url,
                                          title: `${t("Weighing photo —")} ${line.name}`,
                                        })
                                      }
                                    >
                                      <img
                                        src={p.url}
                                        alt="scale"
                                        className={styles.thumbnailImg}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Cutting instruction — shown for every line, weighed or not */}
                    {(lineCutsByLine[line.id] ?? []).length > 0 && (
                      <div className={styles.cuttingInstructions}>
                        {(lineCutsByLine[line.id] ?? []).map((c) => (
                          <div key={c.id} className={styles.cuttingInstruction}>
                            <Icon name="knife" size={14} />
                            <span>{c.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {canWeighHere && (
                      <div className={styles.linePhotos}>
                        <label
                          style={{
                            display: "inline-flex",
                            cursor: "pointer",
                            marginLeft: 28,
                          }}
                        >
                          <Button
                            type="button"
                            variant="tertiary"
                            size="md"
                            icon="camera"
                            title={t("Upload item photo")}
                            onClick={(e) => {
                              const inputElem = (e.currentTarget as HTMLElement)
                                .nextElementSibling as HTMLInputElement;
                              inputElem?.click();
                            }}
                          >
                            Add photo
                          </Button>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => handleUploadItemPhoto(line.id, e)}
                          />
                        </label>
                        {stage === "cold" &&
                          requirePhoto &&
                          itemPhotos.length === 0 && (
                            <span
                              className="tiny"
                              style={{
                                color: "var(--state-warning)",
                                marginLeft: "0.5rem",
                              }}
                            >
                              {t("Needs photo")}
                            </span>
                          )}
                        {itemPhotos.length > 0 && (
                          <div
                            className={styles.thumbnailsContainer}
                            style={{ marginLeft: 28 }}
                          >
                            {itemPhotos.map((img) => (
                              <div
                                key={img.id}
                                className={styles.thumbnailItem}
                                onClick={() =>
                                  setActiveImageModal(
                                    canWeighHere
                                      ? {
                                          url: img.url,
                                          title: `${t("Attachment for")} ${line.name}`,
                                          photoId: img.id,
                                          lineId: line.id,
                                        }
                                      : {
                                          url: img.url,
                                          title: `${t("Attachment for")} ${line.name}`,
                                        },
                                  )
                                }
                              >
                                <img
                                  src={img.url}
                                  alt="thumbnail"
                                  className={styles.thumbnailImg}
                                />
                                {/* Delete only available during the same
                                  window as the upload button itself
                                  (`canWeighHere` — Cold Storage, weighing
                                  role) — previously gated on `stage !==
                                  "delivered"` alone, which let a photo be
                                  deleted at every stage up to delivery
                                  (production, packing, finalise, dispatch,
                                  outstanding), not just at Cold Storage.
                                  Reported directly. */}
                                {canWeighHere && (
                                  <div
                                    className={styles.thumbnailHoverTrash}
                                    title={t("Delete image")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveItemPhoto(line.id, img.id);
                                    }}
                                  >
                                    <Icon name="trash" size={14} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Item Summary line — only when there's something to show */}
                    {showLineDetail && (
                      <div className={styles.itemTotalRow}>
                        {isWeighedItem ? (
                          <span
                            className={styles.totalWeight}
                            style={
                              belowWeighHint || aboveWeighHint
                                ? { color: "var(--state-warning)" }
                                : undefined
                            }
                          >
                            {t("Total:")}
                            {stage !== "intake" &&
                              ` ${totalMeasuredWeight.toFixed(2)} kg`}
                            {stage !== "intake" && belowWeighHint && (
                              <span className={styles.weighHint}>
                                {" "}
                                · {t("below order")} {qty} kg?
                              </span>
                            )}
                            {stage !== "intake" && aboveWeighHint && (
                              <span className={styles.weighHint}>
                                {" "}
                                · {t("over order")} {qty} kg?
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className={styles.totalWeight}>
                            {t("Total:")}
                          </span>
                        )}
                        {/* Persistent, every role/stage — matches the
                            prototype's own always-shown `l.short` chip
                            (Dev-OrderDetail.jsx:1435), not just at Cold Storage. */}
                        {isWeightOnlyUnit(line.unit) && line.short && (
                          <span className={styles.toFollowHint}>
                            {t("Short — ran out of stock")}
                          </span>
                        )}
                        {canSeePrices && hasPrice && (
                          <div className={styles.priceCalc}>
                            <span>{currency.format(price)}</span>
                            <span>x {qty}</span>
                            <span className={styles.lineTotalPrice}>
                              {currency.format(price * qty)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {order.notes && (
              <div
                className={styles.noteItem}
                style={{ gridColumn: "1 / -1", marginTop: "var(--space-md)" }}
              >
                <span className={styles.noteHeader}>{t("Order Note")}</span>
                <span>{order.notes}</span>
              </div>
            )}

            {canSeePrices &&
              (orderIsPriced ? (
                <div className={styles.totalRow}>
                  <span className={styles.muted}>
                    {t("Order value · from PO")}
                  </span>
                  <span className={styles.totalValue}>
                    {currency.format(orderTotal)}
                  </span>
                </div>
              ) : (
                <div className={styles.totalRow}>
                  <span className={styles.muted}>
                    {t("No price on the order — invoiced in Accurate.")}
                  </span>
                </div>
              ))}
          </Card>

          {/* Return Settlement — a persistent, ungated record of how a return
              was settled in Accurate (kept on the order for disputes), unlike
              the Documents section below which is Admin/Finance/Owner only.
              Ported from the prototype's own ungated `order.returnDoc` card
              (Dev-OrderDetail.jsx:1492-1508). */}
          {order.return_doc && (
            <Card>
              <div className={styles.heading}>{t("Return settlement")}</div>
              <div className={styles.cardContent}>
                <div className={styles.docList}>
                  <div className={styles.docRow}>
                    <p>
                      {t("Document")} · <strong>{order.return_doc}</strong>
                    </p>
                  </div>

                  {lines
                    .filter((l) => Number(l.returned) > 0)
                    .map((l) => (
                      <div key={l.id} className={styles.docRow}>
                        <div className={styles.docTop}>
                          <p>
                            {l.name} · {t("returned")}{" "}
                            <strong>
                              {l.returned} {l.unit}
                            </strong>
                          </p>
                          {(receivePhotosMap[l.id]?.length ?? 0) > 0 && (
                            <div className={styles.thumbnailsContainer}>
                              {receivePhotosMap[l.id]!.map((p) => (
                                <div
                                  key={p.id}
                                  className={styles.thumbnailItem}
                                  onClick={() =>
                                    setActiveImageModal({
                                      url: p.url,
                                      title: `${t("Scale photo")} · ${l.name}`,
                                      receiveLineId: l.id,
                                      receivePhotoId: p.id,
                                    })
                                  }
                                >
                                  <img
                                    src={p.url}
                                    alt=""
                                    className={styles.thumbnailImg}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                  {returnDocs.some((d) => d.photo_id) && (
                    <div className={styles.docRow}>
                      <div className={styles.docTop}>
                        <p className={styles.docType}>
                          {t("Return documents")}
                        </p>
                        <div className={styles.thumbnailsContainer}>
                          {returnDocs
                            .filter((d) => d.photo_id)
                            .map((d) => (
                              <div
                                key={d.id}
                                className={styles.thumbnailItem}
                                onClick={() =>
                                  setActiveImageModal({
                                    url: getAssetUrl(d.photo_id!),
                                    title:
                                      RETURN_DOC_KIND_LABELS[d.kind] ?? d.kind,
                                  })
                                }
                              >
                                <img
                                  src={getAssetUrl(d.photo_id!)}
                                  alt=""
                                  className={styles.thumbnailImg}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Incoming Return — the replacement was ordered before the goods
              came back; the warehouse receives + verifies them here, in
              parallel, whatever stage the replacement is now at. Same
              visual chrome as the Customer Return card above — this is the
              stage-independent counterpart for a replacement that already
              re-entered the pipeline. `!isReturned` is a defensive guard,
              not just a stylistic choice: `return_inbound` should only ever
              be true once `stage` has moved past `returned` (settling into
              a replacement flips both in the same write) — but a stale or
              hand-edited row can leave `return_inbound` true while `stage`
              never actually left `returned`, which would otherwise render
              this card *and* the isReturned card above simultaneously for
              the same order. Ported from the prototype's
              `order.returnInbound` card (Dev-OrderDetail.jsx:1535-1561). */}
          {!isReturned && order.return_inbound && (
            <Card className={styles.errorCard}>
              <div className={styles.heading}>Customer return</div>
              <p className={styles.fieldLabel}>
                {t("Warehouse — receive & verify")}
              </p>
              <p style={{ margin: "0.25rem 0 0.75rem" }}>
                {t(
                  "The replacement is already in the pipeline — weigh/verify the returned goods when they arrive.",
                )}
              </p>
              {lines
                .filter(
                  (l) => Number(l.inbound_return) > 0 || l.return_verified,
                )
                .map((l) => (
                  <ReturnLineBox
                    key={l.id}
                    line={l}
                    pendingAmount={Number(l.inbound_return)}
                    returnedReason={order.returned_reason}
                    orderReturnReceived={order.return_received}
                    canReceiveReturn={canReceiveReturn}
                    confirming={confirmingInbound}
                    reopening={undoingInbound}
                    onConfirm={handleConfirmInboundLine}
                    onReopen={handleReopenInboundLine}
                    receiveQtyValue={receiveQtyMap[l.id]}
                    onReceiveQtyChange={(lineId, value) =>
                      setReceiveQtyMap((prev) => ({
                        ...prev,
                        [lineId]: value,
                      }))
                    }
                    photos={receivePhotosMap[l.id] ?? []}
                    onUploadPhoto={handleUploadReceiveWeighPhoto}
                    onRemovePhoto={handleRemoveReceiveWeighPhoto}
                    onOpenImage={setActiveImageModal}
                    t={t}
                  />
                ))}
              <p className="tiny muted" style={{ marginTop: "0.75rem" }}>
                {t(
                  "Waiting for an admin to update Accurate & decide — this can run before the goods arrive.",
                )}
              </p>
            </Card>
          )}
          {!isReturned &&
            !order.return_inbound &&
            order.return_received &&
            lines.some((l) => Number(l.returned) > 0) &&
            !isDelivered &&
            !isCancelled && (
              <div className={styles.undoRow}>
                <div className={styles.left}>
                  <Icon name="infoCircle" />
                  {t("Incoming return received")}
                  {order.return_received_at
                    ? ` · ${formatClock(order.return_received_at)}`
                    : ""}
                </div>
                {canReceiveReturn && (
                  <Button
                    type="button"
                    variant="tertiary"
                    icon="undo"
                    size="sm"
                    className={styles.inlineButton}
                    onClick={handleUndoInbound}
                    disabled={undoingInbound}
                  >
                    {t("Undo")}
                  </Button>
                )}
              </div>
            )}

          {/* Stage Action Controls */}
          {/* Mirrors every top-level gate inside the block below — the div
           *  itself has no visible content of its own, so it must only
           *  render when at least one child actually would. Keep this in
           *  sync if a new top-level card/row is added or removed below. */}
          {(() => {
            const showAdvanceButton =
              !!flow?.next &&
              canAdvance &&
              stage !== "dispatch" &&
              stage !== "production" &&
              stage !== "packing" &&
              stage !== "cold" &&
              stage !== "finalise";
            const showStageActions =
              showAdvanceButton ||
              (stage === "cold" && canWeighHere) ||
              (stage === "production" && canCutHere) ||
              (stage === "packing" && canAdvance) ||
              (stage === "finalise" && canAdvance) ||
              (stage === "dispatch" && canAdvance) ||
              showCodRow ||
              showDocsRow ||
              showTermsRow ||
              (isDelivered && !!order.docs_returned) ||
              showTermsPaidNotice ||
              showFinanceGateForm ||
              (canUndo && !!order.undo_snapshot) ||
              (canTrackCourier &&
                handoffMode === "delivery" &&
                !!order.taken_by) ||
              showRefuseForm;
            return !isCancelled && !isHold && showStageActions;
          })() && (
            <div className={styles.stageActions}>
              {flow?.next &&
                canAdvance &&
                stage !== "dispatch" &&
                stage !== "production" &&
                stage !== "packing" &&
                stage !== "cold" &&
                stage !== "finalise" && (
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={handleAdvance}
                    disabled={advancing}
                  >
                    {advancing ? t("Saving…") : t(flow.advanceLabel)}
                  </Button>
                )}

              {/* Cold Storage — "Pull & weigh" card, replacing the generic
                  advance button for this stage. Ported from the prototype's
                  own cold-stage card (Dev-OrderDetail.jsx:685-723), including
                  its Finance-parallel-queue status line and explainer copy —
                  both were already sitting translated, unused, in
                  translations.ts. Gated on `canWeighHere` (not `canAdvance`)
                  to match the prototype's own gate exactly — a Finance user
                  granted `helpOtherStages` should never see this card, only
                  their own Finance-gate form. */}
              {stage === "cold" && canWeighHere && (
                <Card>
                  <div className={styles.heading}>{t("Pull & weigh")}</div>
                  <div className={styles.cardContent}>
                    <div
                      className={styles.financeClearRow}
                      style={
                        financeCleared
                          ? {
                              border: "1px solid var(--accent-primary)",
                              backgroundColor: "var(--bg-surface-hover-dark)",
                            }
                          : {
                              border: "1px solid var(--border-default)",
                              backgroundColor: "none",
                            }
                      }
                    >
                      <Icon
                        name={financeCleared ? "check" : "hourglass"}
                        style={
                          financeCleared
                            ? { color: "var(--accent-primary)" }
                            : { color: "var(--text-muted)" }
                        }
                      />
                      <p
                        style={
                          financeCleared
                            ? { color: "var(--accent-primary)" }
                            : { color: "var(--text-muted)" }
                        }
                      >
                        {financeCleared
                          ? t("Payment already cleared by Finance")
                          : t("Finance is clearing payment in parallel")}
                      </p>
                    </div>
                    <p className={styles.secondary}>
                      {t(
                        'Weigh each item above and snap the scale — tap "+ Add weighing" to log several scale loads that total up (e.g. 80 kg as 4 × 20 kg). Short on an item? In the "Sending" box set how many you\'re sending now — the rest is kept as a later delivery. A kg item that ran out gets a "short" flag.',
                      )}
                    </p>
                    {lines.filter((l) => isWeighedUnit(l.unit)).length === 0 &&
                      lines
                        .filter((l) => !isWeighedUnit(l.unit))
                        .every(
                          (l) =>
                            (typeof l.qty === "string"
                              ? parseFloat(l.qty) || 0
                              : (l.qty ?? 0)) <= 1,
                        ) && (
                        <p className={styles.secondary}>
                          {t("Nothing to weigh — fixed packs only.")}
                        </p>
                      )}
                    <div className={styles.cardActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        buttonStyle="fullWidth"
                        onClick={handleAdvance}
                        disabled={advancing || !coldWeighingReady}
                      >
                        {advancing
                          ? t("Saving…")
                          : financeCleared
                            ? t(flow?.advanceLabel ?? "")
                            : t("Release to Finance")}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Production — Start Cutting + per-cut tick-off, replacing
                  the generic advance button for this stage. Ported from
                  the prototype's Production card (Dev-OrderDetail.jsx:744-766). */}
              {stage === "production" && canCutHere && (
                <Card>
                  <div className={styles.heading}>{t("Production")}</div>
                  <div className={styles.cardContent}>
                    {cutTasks.length > 0 && (
                      <div className={styles.cuttingRow}>
                        {order.cutting_started ? (
                          <p className={styles.cuttingHint}>
                            <Icon name="progress" size={14} />{" "}
                            {t("Cutting in progress")}
                            {order.cutting_started_at
                              ? ` at ${new Date(order.cutting_started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                            {order.cutting_started_by
                              ? ` by ${displayName(order.cutting_started_by)}`
                              : ""}
                          </p>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="primary"
                              icon="knife"
                              size="lg"
                              onClick={handleStartCutting}
                            >
                              {t("Start cutting")}
                            </Button>
                            <p className={styles.muted}>
                              {t(
                                "Marks the order as being cut — locks these items from edits.",
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {(cutTasks.length === 0 || order.cutting_started) && (
                      <div className={styles.cuttingRow}>
                        {cutTasks.length > 0 && (
                          <div className={styles.sectionHeading}>
                            {t("Cut · tick each cutting")}
                          </div>
                        )}
                        {cutTasks.length === 0 ? (
                          <p className={styles.muted}>
                            {t("No cutting needed.")}
                          </p>
                        ) : (
                          cutTasks.map((t) => {
                            const done = isCutDone(t.cut);
                            const cutLabel = `${t.lineName} — ${t.cut.text}`;
                            return (
                              <div className={styles.cardListColumn}>
                                <label
                                  key={t.cut.id}
                                  className={`${styles.cutTaskRow} ${done ? styles.cutTaskRowDone : ""}`}
                                >
                                  <Icon name="loaf" />
                                  <span style={{ flex: 1 }}>{cutLabel}</span>
                                  <Checkbox
                                    size="md"
                                    checked={done}
                                    onChange={() => handleToggleCut(t.cut)}
                                    label={cutLabel}
                                  />
                                </label>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                    <div className={styles.cardActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        buttonStyle="fullWidth"
                        onClick={handleCuttingDoneAdvance}
                        disabled={advancing || !allCutsDone}
                      >
                        {advancing
                          ? t("Saving…")
                          : t("Cutting done → to packing")}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Packing — collect the cut pieces from Production and pack
                  them with the rest of the order, replacing the generic
                  advance button for this stage. Ported from the prototype's
                  "Pack the order" card (Dev-OrderDetail.jsx:769-782). */}
              {stage === "packing" && canAdvance && (
                <Card>
                  <div className={styles.heading}>{t("Pack the order")}</div>
                  <div className={styles.cardContent}>
                    <div className={styles.cardListColumn}>
                      <p className={styles.secondary}>
                        {t(
                          "Cutting is done. Collect the cut pieces from production and pack them together with the rest of the order, then mark it packed.",
                        )}
                      </p>
                      {cutItems.length > 0 && (
                        <div className={styles.packRow}>
                          <Icon
                            name="check"
                            style={{ color: "var(--accent-primary" }}
                          />
                          <p className={styles.body}>
                            <strong>{cutItems.length}</strong>{" "}
                            {t("cut item(s)")}:{" "}
                            {cutItems.map((l) => l.name).join(", ")}
                          </p>
                        </div>
                      )}
                      {otherItems.length > 0 && (
                        <div className={styles.packRow}>
                          <Icon
                            name="check"
                            style={{ color: "var(--accent-primary" }}
                          />
                          <p className={styles.body}>
                            <b>{otherItems.length}</b> {t("other item(s)")}:{" "}
                            {otherItems.map((l) => l.name).join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className={styles.cardActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        buttonStyle="fullWidth"
                        icon="check"
                        onClick={handlePackAdvance}
                        disabled={advancing}
                      >
                        {advancing ? t("Saving…") : t("Packed & ready")}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Finalise — "Print DO/SI", replacing the generic advance
                  button for this stage. Ported from the prototype's own
                  `finalise` card (Dev-OrderDetail.jsx:784-798): one optional
                  number field, one button that both logs the document (if a
                  number was typed) and releases to dispatch. Reported
                  directly with a screenshot of the prototype's Admin view —
                  content ported, not layout (this port's own Card style,
                  not the prototype's raw `<input>`/`<button>`). */}
              {stage === "finalise" && canAdvance && (
                <Card>
                  <div className={styles.cardContent}>
                    <input
                      type="text"
                      className={styles.editInput}
                      placeholder={t("DO / SI number (optional)")}
                      value={finaliseDocNumber}
                      onChange={(e) => setFinaliseDocNumber(e.target.value)}
                      disabled={advancing}
                    />
                    <div className={styles.cardActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        buttonStyle="fullWidth"
                        icon="tick"
                        onClick={handleFinaliseAdvance}
                        disabled={advancing}
                      >
                        {advancing
                          ? t("Saving…")
                          : t(
                              "Delivery Order (Surat Jalan) or Sales Invoice (Faktur Penjualan) Printed",
                            )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Hand-off mode chooser — dispatch stage, no mode picked yet */}
              {stage === "dispatch" && canAdvance && !handoffMode && (
                <Card>
                  <div className={styles.heading}>{t("Delivery")}</div>
                  <div className={styles.cardActions}>
                    <Button
                      type="button"
                      variant="primary"
                      icon="delivered"
                      size="md"
                      buttonStyle="fullWidth"
                      onClick={handleChooseOwnCourier}
                      disabled={choosingMode}
                    >
                      {t("Take this delivery")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      buttonStyle="fullWidth"
                      icon="pickup"
                      size="md"
                      onClick={handleChoosePickup}
                      disabled={choosingMode}
                    >
                      {t("Customer is picking up")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      buttonStyle="fullWidth"
                      icon="scooter"
                      size="md"
                      isActive={showThirdPartyForm}
                      onClick={() => setShowThirdPartyForm((v) => !v)}
                      disabled={choosingMode}
                    >
                      {t("Send by online courier (Gojek / Grab …)")}
                    </Button>
                  </div>
                  {showThirdPartyForm && (
                    <div className={styles.thirdPartyForm}>
                      <select
                        className={styles.editInput}
                        aria-label={t("Courier service")}
                        value={thirdPartyService}
                        onChange={(e) => setThirdPartyService(e.target.value)}
                      >
                        {THIRD_PARTY_SERVICES.map((svc) => (
                          <option key={svc} value={svc}>
                            {svc === "Other" ? t("Other") : svc}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className={styles.editInput}
                        placeholder={t("Tracking / order ref (optional)")}
                        value={thirdPartyRef}
                        onChange={(e) => setThirdPartyRef(e.target.value)}
                        style={{ flex: 1, minWidth: 160 }}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleConfirmThirdParty}
                        disabled={choosingMode}
                      >
                        {choosingMode ? t("Saving…") : t("Confirm")}
                      </Button>
                    </div>
                  )}
                </Card>
              )}

              {/* Proof capture — mode chosen, relabeled per mode */}
              {stage === "dispatch" && canAdvance && handoffMode && (
                <Card>
                  <div className={styles.proofHeaderRow}>
                    <span className={styles.heading}>
                      {handoffMode === "pickup"
                        ? t("Proof of pickup")
                        : handoffMode === "third"
                          ? `${t("Handed to")} ${order.courier_service ?? ""}`
                          : t("Delivery proof")}
                    </span>
                    {/* Ported from the prototype's own gate
                        (`Dev-OrderDetail.jsx:883`) — unconditional for
                        whoever can act on this dispatch, never gated on
                        whether a photo happens to be staged yet. Previously
                        required `condPhotos.length > 0` here, which hid the
                        button on a freshly-opened proof capture with
                        nothing uploaded yet — reported directly. */}
                    <Button
                      type="button"
                      variant="tertiary"
                      size="md"
                      icon="undo"
                      onClick={handleChangeMethod}
                      disabled={submittingProof || choosingMode}
                    >
                      {t("Change method")}
                    </Button>
                  </div>
                  {handoffMode === "delivery" && (
                    <div className={styles.secondary}>
                      {t("Taken by")}{" "}
                      <strong>{displayName(order.taken_by)}</strong> {t("on")}{" "}
                      {formatTakenAt(
                        [...history]
                          .reverse()
                          .find((h) => h.what === "Handover: own courier")?.at,
                      )}
                    </div>
                  )}
                  <div className={styles.proofsContainer}>
                    <div
                      className={styles.proofFieldRow}
                      style={{
                        borderColor:
                          condPhotos.length > 0
                            ? "var(--accent-primary)"
                            : "var(--border-subtle)",
                      }}
                    >
                      <div className={styles.proofFieldMain}>
                        <div className={styles.left}>
                          <Icon
                            name="check"
                            size={18}
                            className={
                              condPhotos.length > 0
                                ? styles.proofCheckFilled
                                : styles.proofCheckEmpty
                            }
                          />
                          <span className={styles.fieldLabel}>
                            {t("Condition photo")}
                          </span>
                        </div>
                        {condPhotos.length > 0 && (
                          <div className={styles.thumbnailsContainer}>
                            {condPhotos.map((p, i) => (
                              <div
                                key={p.fileId + i}
                                className={styles.thumbnailItem}
                                onClick={() =>
                                  setActiveImageModal({
                                    url: p.url,
                                    title: t("Condition photo"),
                                    stagedProofSlot: "cond",
                                    stagedProofIndex: i,
                                  })
                                }
                              >
                                <img
                                  src={p.url}
                                  alt=""
                                  className={styles.thumbnailImg}
                                />
                                <div
                                  className={styles.thumbnailHoverTrash}
                                  title={t("Delete image")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStagedProofPhoto("cond", i);
                                  }}
                                >
                                  <Icon name="trash" size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <input
                          ref={condFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleUploadProofPhoto("cond", e)}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          icon="camera"
                          iconOnly
                          isActive={condPhotos.length > 0}
                          disabled={uploadingProofSlot === "cond"}
                          title={t("Upload")}
                          onClick={() => condFileInputRef.current?.click()}
                        />
                      </div>
                    </div>

                    {/* SOP hint — ported from the prototype's own copy
                        (`Dev-OrderDetail.jsx:891`), shown for exactly the
                        cases where the receiver/name/signed fields below are
                        still hidden (condition photo not yet staged; not
                        applicable to `third`, which has no such fields to
                        reveal in this port's simplified single-photo
                        hand-off flow). */}
                    {condPhotos.length === 0 && handoffMode !== "third" && (
                      <div className={styles.infoHint}>
                        <Icon
                          name="infoCircle"
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
                        <p className={styles.secondary}>
                          {t(
                            "Photograph the item condition first — then record who received it, or process a return.",
                          )}
                        </p>
                      </div>
                    )}

                    {condPhotos.length > 0 && handoffMode !== "third" && (
                      <>
                        <div
                          className={styles.proofFieldRow}
                          style={{
                            borderColor:
                              recvPhotos.length > 0 &&
                              receiverName.trim() !== ""
                                ? "var(--accent-primary)"
                                : "var(--border-subtle)",
                          }}
                        >
                          <div className={styles.proofFieldMain}>
                            <div className={styles.left}>
                              <Icon
                                name="check"
                                size={18}
                                className={
                                  recvPhotos.length > 0 &&
                                  receiverName.trim() !== ""
                                    ? styles.proofCheckFilled
                                    : styles.proofCheckEmpty
                                }
                              />
                              <span className={styles.fieldLabel}>
                                {handoffMode === "pickup"
                                  ? t("Photo of who collected")
                                  : t("Receiver photo")}
                              </span>
                            </div>
                            {recvPhotos.length > 0 && (
                              <div className={styles.thumbnailsContainer}>
                                {recvPhotos.map((p, i) => (
                                  <div
                                    key={p.fileId + i}
                                    className={styles.thumbnailItem}
                                    onClick={() =>
                                      setActiveImageModal({
                                        url: p.url,
                                        title:
                                          handoffMode === "pickup"
                                            ? t("Photo of who collected")
                                            : t("Receiver photo"),
                                        stagedProofSlot: "recv",
                                        stagedProofIndex: i,
                                      })
                                    }
                                  >
                                    <img
                                      src={p.url}
                                      alt=""
                                      className={styles.thumbnailImg}
                                    />
                                    <div
                                      className={styles.thumbnailHoverTrash}
                                      title={t("Delete image")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveStagedProofPhoto("recv", i);
                                      }}
                                    >
                                      <Icon name="trash" size={14} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <input
                              ref={recvFileInputRef}
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                handleUploadProofPhoto("recv", e)
                              }
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              icon="camera"
                              iconOnly
                              isActive={recvPhotos.length > 0}
                              disabled={uploadingProofSlot === "recv"}
                              title={t("Upload")}
                              onClick={() => recvFileInputRef.current?.click()}
                            />
                          </div>
                          <div
                            style={{
                              paddingLeft: "28px",
                            }}
                          >
                            <input
                              type="text"
                              className={styles.editInput}
                              placeholder={
                                handoffMode === "pickup"
                                  ? t("Collected by")
                                  : t("Receiver's name")
                              }
                              value={receiverName}
                              onChange={(e) => setReceiverName(e.target.value)}
                            />
                          </div>
                        </div>

                        <div
                          className={styles.proofFieldRow}
                          style={{
                            borderColor:
                              signedPhotos.length > 0
                                ? "var(--accent-primary)"
                                : "var(--border-subtle)",
                          }}
                        >
                          <div className={styles.proofFieldMain}>
                            <div className={styles.left}>
                              <Icon
                                name="check"
                                size={18}
                                className={
                                  signedPhotos.length > 0
                                    ? styles.proofCheckFilled
                                    : styles.proofCheckEmpty
                                }
                              />
                              <span className={styles.fieldLabel}>
                                {proofRequired
                                  ? t("Signed doc")
                                  : t("Signed doc (optional)")}
                              </span>
                            </div>
                            {signedPhotos.length > 0 && (
                              <div className={styles.thumbnailsContainer}>
                                {signedPhotos.map((p, i) => (
                                  <div
                                    key={p.fileId + i}
                                    className={styles.thumbnailItem}
                                    onClick={() =>
                                      setActiveImageModal({
                                        url: p.url,
                                        title: proofRequired
                                          ? t("Signed doc")
                                          : t("Signed doc (optional)"),
                                        stagedProofSlot: "signed",
                                        stagedProofIndex: i,
                                      })
                                    }
                                  >
                                    <img
                                      src={p.url}
                                      alt=""
                                      className={styles.thumbnailImg}
                                    />
                                    <div
                                      className={styles.thumbnailHoverTrash}
                                      title={t("Delete image")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveStagedProofPhoto(
                                          "signed",
                                          i,
                                        );
                                      }}
                                    >
                                      <Icon name="trash" size={14} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <input
                              ref={signedFileInputRef}
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                handleUploadProofPhoto("signed", e)
                              }
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              icon="camera"
                              iconOnly
                              isActive={signedPhotos.length > 0}
                              disabled={uploadingProofSlot === "signed"}
                              title={t("Upload")}
                              onClick={() =>
                                signedFileInputRef.current?.click()
                              }
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {condPhotos.length > 0 && handoffMode === "third" && (
                      <input
                        type="text"
                        className={styles.editInput}
                        placeholder={t("Receiver's name")}
                        value={receiverName}
                        onChange={(e) => setReceiverName(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    )}

                    {condPhotos.length > 0 && codApplies && (
                      <div
                        className={styles.proofFieldRow}
                        style={{
                          borderColor:
                            cashCollected != null
                              ? "var(--accent-primary)"
                              : "var(--border-subtle)",
                        }}
                      >
                        <div className={styles.proofFieldMain}>
                          <div className={styles.left}>
                            <Icon
                              name="check"
                              size={18}
                              className={
                                cashCollected != null
                                  ? styles.proofCheckFilled
                                  : styles.proofCheckEmpty
                              }
                            />
                            <span className={styles.fieldLabel}>
                              {t("COD payment")}
                            </span>
                            <span className={styles.codOwedChip}>
                              {t("Collect COD")} {currency.format(codAmount)}
                            </span>
                          </div>
                        </div>
                        <div className={styles.codOutcome}>
                          <div className={styles.codSegments}>
                            <Button
                              type="button"
                              variant="secondary"
                              isActive={codOutcome === "full"}
                              onClick={() => {
                                setCodOutcome("full");
                                setPartialAmountInput("");
                                setOutstandingReason(null);
                              }}
                            >
                              {t("Full")}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              isActive={codOutcome === "partial"}
                              onClick={() => setCodOutcome("partial")}
                            >
                              {t("Partial")}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              isActive={codOutcome === "none"}
                              onClick={() => {
                                setCodOutcome("none");
                                setPartialAmountInput("");
                              }}
                            >
                              {t("None")}
                            </Button>
                          </div>
                          {codOutcome === "partial" && (
                            <input
                              type="number"
                              className={styles.editInput}
                              placeholder={t("Amount collected (Rp)")}
                              value={partialAmountInput}
                              onChange={(e) =>
                                setPartialAmountInput(e.target.value)
                              }
                              style={{ width: 240 }}
                            />
                          )}
                          {codOutcome && (
                            <div className={styles.secondary}>
                              {t("Collected")}{" "}
                              {currency.format(cashCollected ?? 0)} {t("of")}{" "}
                              {currency.format(codAmount)}
                            </div>
                          )}
                          {codOutcome && codOutcome !== "full" && (
                            <div className={styles.codReasonRow}>
                              {OUTSTANDING_REASONS.map((r) => (
                                <Button
                                  key={r.key}
                                  variant="secondary"
                                  type="button"
                                  size="sm"
                                  style={{
                                    borderRadius: "var(--radius-xl)",
                                  }}
                                  isActive={outstandingReason === r.key}
                                  onClick={() => setOutstandingReason(r.key)}
                                >
                                  {t(r.label)}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {condPhotos.length > 0 && (
                    <div className={styles.proofActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        buttonStyle="fullWidth"
                        icon="tick"
                        onClick={handleConfirmDelivery}
                        disabled={
                          submittingProof ||
                          !receiverName.trim() ||
                          (handoffMode !== "third" &&
                            proofRequired &&
                            (recvPhotos.length === 0 ||
                              signedPhotos.length === 0))
                        }
                      >
                        {submittingProof
                          ? t("Saving…")
                          : handoffMode === "pickup"
                            ? t("Mark picked up")
                            : handoffMode === "third"
                              ? t("Mark handed over")
                              : t("Confirm delivery")}
                      </Button>
                      <div className={styles.proofActionsRow}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="lg"
                          buttonStyle="fullWidth"
                          icon="returned"
                          onClick={openRefuseForm}
                          disabled={submittingProof}
                        >
                          {t("Customer refused / returned")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="lg"
                          buttonStyle="fullWidth"
                          icon="cancelled"
                          onClick={handleDeliveryFailed}
                          disabled={submittingProof || choosingMode}
                        >
                          {t("Delivery failed — bring back & retry")}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {(showCodRow || showDocsRow || showTermsRow) && (
                <Card className={styles.followUpsCard}>
                  <div className={styles.heading}>
                    <span>{t("Follow-ups pending")}</span>
                  </div>
                  {showCodRow && (
                    <div className={styles.followUpRow}>
                      <Icon
                        name="cash"
                        size={24}
                        className={styles.followUpIcon}
                      />
                      <div className={styles.followUpMain}>
                        <span className={styles.fieldLabel}>
                          {t("COD cash awaiting office reconcile")}
                        </span>
                        <span className={styles.secondary}>
                          {currency.format(codReconcileAmount)} ·{" "}
                          {t("collected by courier")}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={handleReconcileCOD}
                        disabled={reconcilingCod}
                        style={{ width: "140px" }}
                      >
                        {reconcilingCod ? t("Saving…") : t("Confirm received")}
                      </Button>
                    </div>
                  )}
                  {showDocsRow && (
                    <div className={styles.followUpRow}>
                      <Icon
                        name="fileDoc"
                        size={24}
                        className={styles.followUpIcon}
                      />
                      <div className={styles.followUpMain}>
                        <span className={styles.fieldLabel}>
                          {t("Signed DO & SI not yet returned")}
                        </span>
                        <span className={styles.secondary}>
                          {t("Confirm the signed docs are back and filed")}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        style={{ width: "140px" }}
                        onClick={handleConfirmDocsReturned}
                      >
                        {t("Mark returned")}
                      </Button>
                    </div>
                  )}
                  {showTermsRow && (
                    <div className={styles.followUpRow}>
                      <Icon
                        name="cash"
                        size={24}
                        className={styles.followUpIcon}
                      />
                      <div className={styles.followUpMain}>
                        <span className={styles.fieldLabel}>
                          {t("Terms invoice — payment not yet received")}
                        </span>
                        <span className={styles.secondary}>
                          {order.payment_due_date
                            ? `${t("Due")} ${formatDate(order.payment_due_date)}`
                            : t("No due date on file")}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        style={{ width: "140px" }}
                        onClick={handleTermsPaymentReceived}
                      >
                        {t("Payment received")}
                      </Button>
                    </div>
                  )}
                </Card>
              )}
              {isDelivered && order.docs_returned && (
                <Card className={styles.successCard}>
                  <div className={styles.left}>
                    <Icon name="check" />
                    <div
                      className={styles.fieldLabel}
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {t("Signed DO & SI returned")}
                    </div>
                  </div>
                </Card>
              )}
              {showTermsPaidNotice && (
                <Card
                  style={{
                    borderColor: "var(--accent-primary)",
                    backgroundColor: "var(--bg-surface-hover-dark)",
                  }}
                >
                  <div className={styles.proofHeaderRow}>
                    <div
                      className={styles.left}
                      style={{ color: "var(--accent-primary)" }}
                    >
                      <Icon name="check" />
                      <div className={styles.fieldLabel}>
                        {t("Terms payment received")}
                        {order.payment_paid_at
                          ? ` · ${formatDate(order.payment_paid_at)}`
                          : ""}
                      </div>
                    </div>
                    {canApproveFinance && (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        onClick={handleUndoTermsPayment}
                      >
                        <Icon name="undo" size={16} />
                        {t("Undo")}
                      </Button>
                    )}
                  </div>
                </Card>
              )}

              {showFinanceGateForm && (
                <Card>
                  <div className={styles.proofHeaderRow}>
                    <div className={styles.heading} style={{ margin: 0 }}>
                      <span>{t("Finance gate")}</span>
                    </div>
                    {orderIsPriced ? (
                      <span className={styles.fieldLabel}>
                        {currency.format(orderTotal)}
                      </span>
                    ) : (
                      <span className={styles.secondary}>
                        {t("Priced in Accurate")}
                      </span>
                    )}
                  </div>

                  {showCreditBlock && (
                    <Card
                      style={{
                        marginBottom: "var(--space-md)",
                        borderColor: overCreditLimit
                          ? "var(--state-error)"
                          : "var(--border-default)",
                      }}
                    >
                      <div className={styles.proofRow}>
                        <span className={styles.secondary}>
                          {t("Account exposure (in flight)")}
                        </span>
                        <span className={styles.fieldLabel}>
                          {currency.format(customerExposure)}
                        </span>
                      </div>
                      <div className={styles.proofRow}>
                        <span className={styles.secondary}>
                          {t("Credit limit")}
                        </span>
                        <span className={styles.fieldLabel}>
                          {creditLimitNum
                            ? currency.format(creditLimitNum)
                            : "—"}
                        </span>
                      </div>
                      {overCreditLimit && (
                        <p
                          className={styles.secondary}
                          style={{
                            color: "var(--state-error)",
                            marginTop: "var(--space-xs)",
                            marginBottom: 0,
                          }}
                        >
                          ⚠{" "}
                          {canOverrideCreditLimit
                            ? t(
                                "Over credit limit — confirm with the owner before clearing.",
                              )
                            : t(
                                "Over credit limit — only Finance or the owner can clear this.",
                              )}
                        </p>
                      )}
                    </Card>
                  )}

                  <div className={styles.financeGateRow}>
                    <label className={styles.financeGateField}>
                      <span className={styles.financeFieldLabel}>
                        {t("Method")}
                      </span>
                      <select
                        className={styles.editSelect}
                        value={financeMethod}
                        onChange={(e) => {
                          setFinanceMethod(
                            e.target.value as "transfer" | "cash",
                          );
                          setFinanceVerified(false);
                        }}
                      >
                        <option value="transfer">{t("Transfer")}</option>
                        <option value="cash">{t("Cash")}</option>
                      </select>
                    </label>
                    <label className={styles.financeGateField}>
                      <span className={styles.financeFieldLabel}>
                        {t("Timing")}
                      </span>
                      <select
                        className={styles.editSelect}
                        value={financeTiming}
                        onChange={(e) => {
                          setFinanceTiming(
                            e.target.value as "upfront" | "terms",
                          );
                          setFinanceVerified(false);
                        }}
                      >
                        <option value="upfront">
                          {t("Upfront (pay first)")}
                        </option>
                        <option value="terms">{t("Terms")}</option>
                      </select>
                    </label>
                  </div>

                  <label className={styles.financeGateField}>
                    <span className={styles.financeFieldLabel}>
                      {t("Amount received (Rp, optional)")}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.editInput}
                      value={financeAmount}
                      placeholder={orderIsPriced ? String(orderTotal) : ""}
                      onChange={(e) => setFinanceAmount(e.target.value)}
                    />
                  </label>

                  {financeMethod === "transfer" && (
                    <label className={styles.financeGateField}>
                      <span className={styles.financeFieldLabel}>
                        {t("Bank reference (optional)")}
                      </span>
                      <input
                        type="text"
                        className={styles.editInput}
                        value={financeBankRef}
                        onChange={(e) => setFinanceBankRef(e.target.value)}
                      />
                    </label>
                  )}

                  <div className={styles.financeGateActions}>
                    {!isCodOrder &&
                      financeTiming === "upfront" &&
                      !financeVerified && (
                        <Button
                          type="button"
                          variant="secondary"
                          buttonStyle="fullWidth"
                          size="lg"
                          icon={
                            financeMethod === "transfer"
                              ? "paymentSuccess"
                              : "cash"
                          }
                          onClick={() => setFinanceVerified(true)}
                        >
                          {financeMethod === "transfer"
                            ? t("I verify it in our bank")
                            : t("Cash received")}
                        </Button>
                      )}
                    {!isCodOrder &&
                      financeTiming === "upfront" &&
                      financeVerified && (
                        <div className={styles.financeVerifiedChip}>
                          <Icon name="check" size={16} />
                          {t("Payment confirmed")}
                        </div>
                      )}

                    <Button
                      type="button"
                      variant="primary"
                      buttonStyle="fullWidth"
                      size="lg"
                      icon="check"
                      disabled={
                        approvingFinance ||
                        (!isCodOrder &&
                          financeTiming === "upfront" &&
                          !financeVerified) ||
                        (overCreditLimit && !canOverrideCreditLimit)
                      }
                      onClick={handleApproveFinance}
                    >
                      {approvingFinance
                        ? t("Saving…")
                        : t("Clear — OK to proceed")}
                    </Button>
                  </div>
                </Card>
              )}

              {canUndo && order.undo_snapshot && (
                <div className={styles.undoRow}>
                  <div className={styles.left}>
                    <Icon name="infoCircle" />
                    <p className="tiny muted">{t("Pressed wrongly?")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="tertiary"
                    className={styles.inlineButton}
                    onClick={handleUndo}
                  >
                    <Icon name="undo" size={16} />
                    {t("Undo — back to")}{" "}
                    {t(
                      STAGE_LABELS[
                        order.undo_snapshot
                          .prevStage as keyof typeof STAGE_LABELS
                      ] ?? order.undo_snapshot.prevStage,
                    )}
                  </Button>
                </div>
              )}

              {canTrackCourier &&
                handoffMode === "delivery" &&
                order.taken_by && (
                  <CourierLiveLocation courierId={order.taken_by} />
                )}

              {showRefuseForm && (
                <Card>
                  <div className={styles.heading}>
                    <span>{t("Customer refused / returned")}</span>
                  </div>
                  {lines.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span style={{ flex: 1 }}>{l.name}</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={styles.editInput}
                        style={{ width: 90 }}
                        value={refuseQtyMap[l.id] ?? ""}
                        onChange={(e) =>
                          setRefuseQtyMap((prev) => ({
                            ...prev,
                            [l.id]: e.target.value,
                          }))
                        }
                      />
                      <span className="tiny muted">{l.unit}</span>
                      <label style={{ cursor: "pointer" }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleUploadRefusePhoto(l.id, e)}
                        />
                        <Icon name="camera" size={16} />
                      </label>
                      {(refusePhotosMap[l.id] ?? []).map((p) => (
                        <img
                          key={p.id}
                          src={p.url}
                          alt=""
                          className={styles.thumbnailImg}
                          style={{ width: 32, height: 32 }}
                        />
                      ))}
                    </div>
                  ))}
                  <textarea
                    className={styles.editInput}
                    placeholder={t("Reason for return")}
                    value={refuseReason}
                    onChange={(e) => setRefuseReason(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 60,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                    }}
                  >
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleConfirmRefusal}
                      disabled={submittingRefusal}
                    >
                      {submittingRefusal ? t("Saving…") : t("Confirm return")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowRefuseForm(false)}
                      disabled={submittingRefusal}
                    >
                      {t("Cancel")}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Documents Section — Admin/Finance/Owner only, matching the
              prototype's own hardcoded role check (see `canSeeDocuments`'s
              doc comment above). Previously visible to every role. */}
          {canSeeDocuments && (
            <Card>
              <div className={styles.heading}>
                {t("Documents")}{" "}
                <span className={styles.count}>{docEntries.length}</span>
              </div>

              {docEntries.length === 0 ? (
                <p className={styles.muted}>{t("No documents logged yet.")}</p>
              ) : (
                <div className={styles.docList}>
                  {docEntries.map((doc) => {
                    const fileId = doc.document_file ?? doc.file_path;
                    return (
                      <div key={doc.id} className={styles.docRow}>
                        <div className={styles.docTop}>
                          <span className={styles.docType}>
                            {doc.doc_type} —{" "}
                          </span>
                          <span className={styles.docNumber}>
                            {doc.number ?? "—"}
                          </span>

                          {fileId && (
                            <div
                              className={styles.thumbnailItem}
                              style={{ width: 36, height: 36 }}
                              onClick={() =>
                                setActiveImageModal({
                                  url: directusFileUrl(fileId),
                                  title: `${doc.doc_type} ${doc.number ?? ""}`,
                                  attachmentId: doc.id ?? undefined,
                                })
                              }
                            >
                              <img
                                src={directusFileUrl(fileId)}
                                alt="doc"
                                className={styles.thumbnailImg}
                              />
                            </div>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon="trash"
                            iconOnly
                            title={t("Delete document")}
                            onClick={() =>
                              doc.id != null && handleDeleteDocument(doc.id)
                            }
                          ></Button>
                        </div>

                        {doc.note && (
                          <div className={styles.docNote}>{doc.note}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canAddDocs && (
                <form className={styles.docForm} onSubmit={handleAddDocument}>
                  <div className={styles.docFormRow}>
                    <select
                      className={styles.editInput}
                      style={{ maxWidth: "120px" }}
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                    >
                      {DOC_TYPES.map((docTypeOption) => (
                        <option key={docTypeOption} value={docTypeOption}>
                          {docTypeOption}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className={styles.editInput}
                      style={{ flex: 1 }}
                      placeholder={t("Document number")}
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      required
                    />
                    <input
                      ref={docFileInputRef}
                      type="file"
                      style={{ display: "none" }}
                      accept="image/*,application/pdf"
                      onChange={handleDocFileUpload}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      isActive={!!docFileName}
                      icon={docFileName ? "paperclip" : "add"}
                      iconOnly
                      onClick={() => docFileInputRef.current?.click()}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={savingDoc || !docNumber.trim()}
                    >
                      {savingDoc ? "…" : t("+ Add")}
                    </Button>
                  </div>
                  <input
                    type="text"
                    className={styles.editInput}
                    placeholder={t("Put notes here...")}
                    value={docNote}
                    onChange={(e) => setDocNote(e.target.value)}
                  />
                </form>
              )}
            </Card>
          )}

          {/*
            Order Actions — every cross-stage override lives here, same place
            at every stage (Reorder / Put on hold / Send back / Restore /
            Cancel — "Reopen" is the delivered→dispatch case of Send back).
            Computed independently of stage and hand-off state, mirroring the
            prototype's consolidated anyOrderAction group (Dev-OrderDetail.jsx
            lines 1665–1687) — these are flow overrides, not the work of the
            current stage, so they stay in one predictable place instead of
            moving around per stage.
          */}
          {(canReorder ||
            canCancel ||
            canHold ||
            canSendBack ||
            canRestore) && (
            <div className={styles.orderActions}>
              <div className={styles.orderActionsRow}>
                {canReorder && (
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="fullWidth"
                    size="lg"
                    icon="reload"
                    onClick={handleReorder}
                    disabled={reordering}
                  >
                    {reordering ? t("Creating…") : t("Reorder")}
                  </Button>
                )}
                {canHold && (
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="fullWidth"
                    size="lg"
                    icon={isHold ? "play" : "pause"}
                    onClick={handleToggleHold}
                  >
                    {isHold ? t("Resume order") : t("Put on Hold")}
                  </Button>
                )}
              </div>
              <div className={styles.orderActionsRow}>
                {canSendBack && (
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="fullWidth"
                    size="lg"
                    icon="backward"
                    onClick={handleSendBack}
                    disabled={advancing}
                  >
                    {sendBackLabel()}
                  </Button>
                )}
                {canRestore && (
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="fullWidth"
                    size="lg"
                    icon="refresh"
                    onClick={handleRestore}
                  >
                    {t("Restore Order")}
                  </Button>
                )}
              </div>
              {canCancel && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon="close"
                  tone="error"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? t("Cancelling…") : t("Cancel Order")}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Collapsible Side Panel (Notes & History) ── */}
        <aside className={styles.sidePanelColumn}>
          <Button
            type="button"
            variant="secondary"
            icon={isPanelOpen ? "chevronRight" : "chevronLeft"}
            iconOnly
            className={styles.panelToggleBtn}
            isActive={isPanelOpen}
            onClick={() => setIsPanelOpen((prev) => !prev)}
            title={
              isPanelOpen ? t("Collapse side panel") : t("Expand side panel")
            }
          />

          <div
            className={[
              styles.sidePanelStickyContent,
              !isPanelOpen ? styles.sidePanelStickyContentCollapsed : "",
            ].join(" ")}
          >
            {/* Notes Card */}
            <Card className={styles.notesCard}>
              <h3 className={styles.heading}>{t("Notes")}</h3>
              <div className={styles.notesListScroll}>
                {history.filter((h) => h.what.startsWith("Note")).length ===
                0 ? (
                  <p className={styles.muted}>{t("No note")}</p>
                ) : (
                  history
                    .filter((h) => h.what.startsWith("Note:"))
                    .reverse()
                    .map((n, idx) => (
                      <div key={n.id ?? idx} className={styles.noteItem}>
                        <div className={styles.noteHeader}>
                          <span style={{ fontWeight: "600" }}>
                            {n.who ? `${displayName(n.who)}` : ""}
                          </span>
                          <span>{formatDate(n.at, true)}</span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          {n.what.replace("Note:", "").trim()}
                        </div>
                      </div>
                    ))
                )}
              </div>
              <form className={styles.noteFormFixed} onSubmit={handleAddNote}>
                <textarea
                  className={styles.noteInput}
                  placeholder={t("Add note for the team...")}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitNote();
                    }
                  }}
                  disabled={savingNote}
                  rows={2}
                  style={{
                    resize: "vertical",
                    fontFamily: "inherit",
                    minHeight: 38,
                  }}
                />
                <Button
                  type="submit"
                  variant="primary"
                  icon="add"
                  disabled={savingNote || !noteText.trim()}
                >
                  {t("Add")}
                </Button>
              </form>
            </Card>

            {/* History Card */}
            <Card className={styles.historyCard}>
              <h3 className={styles.heading}>{t("History")}</h3>
              <div className={styles.historyListScroll}>
                {visibleHistory.length === 0 && (
                  <p className={styles.muted}>{t("No history yet.")}</p>
                )}
                {visibleHistory
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <div key={h.id ?? i} className={styles.historyItem}>
                      <span className={styles.historyTime}>
                        {formatDate(h.at, true)}
                        <span style={{ fontWeight: "600" }}>
                          {h.who ? ` ${displayName(h.who)}` : ""}
                        </span>
                      </span>
                      <span className={styles.historyContent}>{t(h.what)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          </div>
        </aside>
      </div>

      <ImageDetailsModal
        open={!!activeImageModal}
        title={activeImageModal?.title ?? ""}
        url={activeImageModal?.url ?? ""}
        onClose={() => setActiveImageModal(null)}
        onDelete={
          activeImageModal?.lineId && activeImageModal?.photoId
            ? () => {
                handleRemoveItemPhoto(
                  activeImageModal.lineId!,
                  activeImageModal.photoId!,
                );
                setActiveImageModal(null);
              }
            : activeImageModal?.weighingLineId &&
                activeImageModal?.weighingId &&
                activeImageModal?.weighingPhotoId
              ? () => {
                  handleRemoveWeighingPhoto(
                    activeImageModal.weighingLineId!,
                    activeImageModal.weighingId!,
                    activeImageModal.weighingPhotoId!,
                  );
                  setActiveImageModal(null);
                }
              : activeImageModal?.receiveLineId &&
                  activeImageModal?.receivePhotoId
                ? () => {
                    handleRemoveReceiveWeighPhoto(
                      activeImageModal.receiveLineId!,
                      activeImageModal.receivePhotoId!,
                    );
                    setActiveImageModal(null);
                  }
                : activeImageModal?.attachmentId
                  ? () => {
                      handleDeleteDocument(activeImageModal.attachmentId!);
                      setActiveImageModal(null);
                    }
                  : activeImageModal?.stagedProofSlot &&
                      activeImageModal?.stagedProofIndex !== undefined
                    ? () => {
                        handleRemoveStagedProofPhoto(
                          activeImageModal.stagedProofSlot!,
                          activeImageModal.stagedProofIndex!,
                        );
                        setActiveImageModal(null);
                      }
                    : undefined
        }
      />
    </div>
  );
}
