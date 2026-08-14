import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
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
  readReturnDocuments,
  createReturnDocument,
  createDeliveryProof,
  readDeliveryProofs,
  updateDeliveryProof,
  getNextOrderNo,
  createOrder,
  createOrderLines,
  createLineCut,
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
  dispatchSubStatus,
  isOrderLocked,
  type ReturnStage,
} from "../../lib/pipeline";
import { redactHistoryPrices } from "../../lib/redactHistory";
import { dateCode } from "../../lib/orderNo";
import { ImageDetailsModal } from "../../components/ImageDetailsModal/ImageDetailsModal";
import styles from "./OrderDetail.module.css";

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

/* ─────────────────────────────────────── pipeline definition ── */

const PIPELINE_STAGES = [
  { key: "intake", label: "New Order" },
  { key: "cold", label: "Cold Storage" },
  { key: "finance", label: "Finance" },
  { key: "production", label: "Production" },
  { key: "packing", label: "Packing" },
  { key: "finalise", label: "Finalise" },
  { key: "dispatch", label: "Dispatch" },
  { key: "delivered", label: "Delivered" },
];

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
    advanceLabel: "Done — Send to Production",
  },
  finance: {
    next: null,
    prev: null,
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
    advanceLabel: "Done — Send to Finalise",
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

/** "HH:MM" from an ISO timestamp, for the drop-location row. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
  const { alert, confirm } = useDialog();
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
  const [confirmingReceive, setConfirmingReceive] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [confirmingSettle, setConfirmingSettle] = useState(false);
  const [signedDocFileId, setSignedDocFileId] = useState<string | null>(null);
  const [closingSigned, setClosingSigned] = useState(false);

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
        readCustomers(),
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
          initialSending[line.id] =
            typeof line.qty === "string"
              ? parseFloat(line.qty)
              : (line.qty ?? 1);
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

  // Locked once delivered, dispatched-and-taken, or in a terminal off-pipeline
  // stage (outstanding/cancelled/returned) — `editAfterLock` (Owner by
  // default, via the Owner short-circuit in `can()`) can override the lock.
  const canEdit =
    auth.can("editOrderLines") &&
    (!isOrderLocked(order) || auth.can("editAfterLock"));
  // A role can advance a stage it owns (flow.capability) OR — if granted the
  // separate "floor helper" capability — cover any stage regardless of owner.
  const canAdvance = flow
    ? auth.can(flow.capability) || auth.can("helpOtherStages")
    : false;
  const canSendBack = flow?.prev ? auth.can("sendBackStage") : false;
  const canCancel =
    auth.can("cancelOrders") && !isCancelled && !isDelivered && !isReturned;
  const canHold =
    auth.can("holdResume") &&
    !isOutstanding &&
    !isCancelled &&
    !isDelivered &&
    !isReturned;
  const canRestore = (isCancelled || isOutstanding) && auth.can("reopenOrders");
  const canAddDocs = auth.can("printDocuments");
  const canProcessReturns = auth.can("processReturns");
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
  // covering someone else's cold-storage queue.
  const canWeighHere =
    stage === "cold" &&
    (auth.can("weighColdStorage") || auth.can("helpOtherStages"));
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
  /** Quiet Undo link eligibility — a snapshot exists (nothing since has
   *  superseded it, see the clearing in handleSendBack/handleHold/etc.) and
   *  the viewer is either who confirmed the delivery or an Owner. */
  const canUndo =
    !!order.undo_snapshot &&
    (userId === order.undo_snapshot.who || auth.role === "Owner");
  const showActorNotice =
    !!stageActor &&
    !isStageActor &&
    !canAdvance &&
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
  const inReceiveBucket = returnBuckets.includes("awaiting_return");
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

  /* Finance gate — a parallel check alongside Cold Storage's own weighing
   * (see the `canWeighHere` doc comment above): `stage` stays `'cold'`
   * throughout, `payment_confirmed` is the actual signal, so this card is
   * gated on the flag, not a stage transition. Undo is available any time
   * afterward (not stage-restricted) — flipping the flag back is a fully
   * self-contained, safely-repeatable write with no other state to
   * reconcile, unlike the delivered-order Undo which has to restore a whole
   * pre-delivery snapshot. */
  const canApproveFinance = auth.can("approveFinance");
  const showFinanceApproveRow =
    stage === "cold" && !order.payment_confirmed && canApproveFinance;
  const showFinanceUndoRow = !!order.payment_confirmed && canApproveFinance;

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
        alert(`Failed to delete weighing: ${res.error}`);
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
        alert(`Failed to save weighing: ${res.error}`);
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
      if (res.error) alert(`Failed to update weighing: ${res.error}`);
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
      alert(`Photo upload failed: ${uploadRes.error}`);
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
        alert(`Failed to save weighing: ${res.error}`);
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
      alert(`Failed to save photo: ${photoRes.error}`);
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
      alert(`Failed to remove photo: ${res.error}`);
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
      alert(`Photo upload failed: ${uploadRes.error}`);
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
      alert(`Failed to save photo: ${createRes.error}`);
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
      alert(`Failed to remove photo: ${res.error}`);
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
      alert(`Upload failed: ${uploadRes.error}`);
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
      alert(`Failed to log document: ${res.error}`);
    }
    setSavingDoc(false);
  }

  async function handleDeleteDocument(docId: number | string) {
    if (!(await confirm(t("Delete this document?"), { danger: true }))) return;
    const res = await deleteAttachment(docId);
    if (!res.error) {
      setAttachments((prev) => prev.filter((a) => a.id !== docId));
    } else {
      alert(`Failed to delete document: ${res.error}`);
    }
  }

  /* ────────────── Stage Flow Actions ── */
  async function handleAdvance() {
    if (!id || !flow?.next || advancing) return;
    if (stage === "cold" && requirePhoto) {
      const hasAnyItemPhoto = lines.some(
        (line) => line.id && (itemPhotosMap[line.id]?.length ?? 0) > 0,
      );
      if (!hasAnyItemPhoto) {
        alert(
          t(
            "Attach at least one item photo before releasing from Cold Storage.",
          ),
        );
        return;
      }
    }
    setAdvancing(true);
    const res = await updateOrder(id, { stage: flow.next });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: `Stage advanced: ${stage} → ${flow.next}`,
        who: userId,
        stage: flow.next,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to advance stage: ${res.error}`);
    }
    setAdvancing(false);
  }

  async function handleSendBack() {
    if (!id || !flow?.prev || advancing) return;
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
    const patch: Record<string, unknown> = isDispatchReset
      ? {
          stage: flow.prev,
          taken_by: null,
          pickup: false,
          third_party: false,
          courier_service: null,
          // Reopening is a distinct, deliberate action that supersedes any
          // pending quiet Undo from the delivery this is reopening.
          ...(stage === "delivered" ? { undo_snapshot: null } : {}),
        }
      : { stage: flow.prev };
    const res = await updateOrder(id, patch);
    if (!res.error && res.data) {
      setOrder(res.data);
      if (stage === "delivered") {
        setActiveProof(null);
        resetProofState();
      }
      await appendOrderHistory({
        order_id: id,
        what: `Stage returned: ${stage} → ${flow.prev}`,
        who: userId,
        stage: flow.prev,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to send back: ${res.error}`);
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
      alert(`Failed to record hand-off: ${res.error}`);
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
      alert(`Failed to confirm documents returned: ${res.error}`);
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
      alert(`Failed to reconcile COD: ${res.error}`);
    }
    setReconcilingCod(false);
  }

  /** Clears the Finance gate — the previously-missing write behind the
   *  `approveFinance` capability and the "Orders awaiting finance approval"
   *  Needs Attention bucket, which existed with nothing to actually press.
   *  Mirrors the prototype's Finance/Owner-gated "Clear — OK to proceed"
   *  (`Dev-OrderDetail.jsx:678-742`) — Clear-only, no reject; a Finance user
   *  who won't clear simply leaves the order parked here. */
  async function handleApproveFinance() {
    if (!id) return;
    setApprovingFinance(true);
    const res = await updateOrder(id, {
      payment_confirmed: true,
      payment_confirmed_at: new Date().toISOString(),
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Payment cleared — Finance",
        who: userId,
        stage: null,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to clear payment: ${res.error}`);
    }
    setApprovingFinance(false);
  }

  /** Undoes an accidental Finance clearance — just flips the flag back, no
   *  stage or snapshot to reconcile (see the `showFinanceUndoRow` comment). */
  async function handleUndoFinanceClear() {
    if (!id) return;
    setApprovingFinance(true);
    const res = await updateOrder(id, {
      payment_confirmed: false,
      payment_confirmed_at: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Payment clearance undone",
        who: userId,
        stage: null,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to undo payment clearance: ${res.error}`);
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
      alert(`Photo upload failed: ${uploadRes.error}`);
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
      );
      return;
    }
    if (!receiverName.trim()) {
      alert(t("Enter the receiver's name."));
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
      );
      return;
    }
    if (codApplies && codOutcome !== "full" && !outstandingReason) {
      alert(
        t(
          "Pick a reason for the outstanding balance before marking delivered.",
        ),
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
      alert(`Failed to save delivery proof: ${proofRes.error}`);
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
    // Undo can archive it, not just reset the order fields).
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
      at: new Date().toISOString(),
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
      alert(`Failed to advance stage: ${res.error}`);
    }
    setSubmittingProof(false);
  }

  /**
   * Un-happens a mistaken "Mark delivered" — distinct from Reopen (a
   * deliberate re-delivery that resets hand-off state and stays available
   * indefinitely). Undo restores the exact pre-delivery field values from
   * `undo_snapshot`, archives the delivery_proofs row the confirm created,
   * and only stays offered while nothing else has touched the order since
   * (every other order-mutating handler clears `undo_snapshot` itself).
   */
  async function handleUndo() {
    if (!id || !order || !order.undo_snapshot) return;
    if (
      !(await confirm(
        t(
          "Undo this delivery? The order goes back to dispatch exactly as it was.",
        ),
        { danger: true },
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
        what: "Undid — back to dispatch",
        who: userId,
        stage: snapshot.prevStage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to undo: ${res.error}`);
    }
  }

  async function handleCancel() {
    if (
      !id ||
      !(await confirm(t("Cancel this order? This can be undone via Restore."), {
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
      alert(`Failed to cancel order: ${res.error}`);
    }
    setCancelling(false);
  }

  async function handleHold() {
    if (!id) return;
    const res = await updateOrder(id, {
      stage: "outstanding",
      undo_snapshot: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: "Order put on hold (outstanding)",
        who: userId,
        stage: "outstanding",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to hold order: ${res.error}`);
    }
  }

  async function handleRestore() {
    if (!id || !order) return;
    const restoreStage = order.cancelled_from ?? "intake";
    const res = await updateOrder(id, {
      stage: restoreStage,
      cancelled: false,
      cancelled_from: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: `Order restored to ${restoreStage}`,
        who: userId,
        stage: restoreStage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to restore order: ${res.error}`);
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
      alert(t("This order has no customer on file — can't reorder."));
      return;
    }
    if (
      !(await confirm(
        t("Create a new order with the same items for this customer?"),
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
      alert(`Failed to generate order number: ${noRes.error}`);
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
      alert(`Failed to create order: ${orderRes.error}`);
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
      alert(`Photo upload failed: ${uploadRes.error}`);
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
      alert(`Failed to save photo: ${createRes.error}`);
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
      alert(t("Enter a returned quantity for at least one item."));
      return;
    }
    setSubmittingRefusal(true);
    for (const l of refusedLines) {
      const qty = parseFloat(refuseQtyMap[l.id] ?? "0") || 0;
      const res = await updateOrderLine(l.id, { returned: qty });
      if (res.error) {
        alert(`Failed to record return on "${l.name}": ${res.error}`);
        setSubmittingRefusal(false);
        return;
      }
    }
    const summary = refusedLines
      .map((l) => `"${l.name}" (${refuseQtyMap[l.id]} ${l.unit ?? ""})`)
      .join(", ");
    const res = await updateOrder(id, {
      stage: "returned",
      returned_reason: refuseReason.trim() || null,
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
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
      setShowRefuseForm(false);
    } else {
      alert(`Failed to record the return: ${res.error}`);
    }
    setSubmittingRefusal(false);
  }

  /** RECEIVE bucket — warehouse weighs the goods back in, per line, with a scale photo. */
  async function handleUploadReceiveWeighPhoto(
    lineId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      alert(`Photo upload failed: ${uploadRes.error}`);
      e.target.value = "";
      return;
    }
    const res = await updateOrderLine(lineId, {
      returned_weigh_photo: uploadRes.data.id,
    });
    if (res.error || !res.data) {
      alert(`Failed to save weigh-back photo: ${res.error}`);
      e.target.value = "";
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === lineId ? res.data! : l)));
    e.target.value = "";
  }

  async function handleConfirmReceive() {
    if (!id || confirmingReceive) return;
    setConfirmingReceive(true);
    const returnedLines = lines.filter((l) => Number(l.returned) > 0);
    for (const l of returnedLines) {
      const verifiedRaw = receiveQtyMap[l.id];
      if (verifiedRaw == null) continue;
      const verified = parseFloat(verifiedRaw) || 0;
      if (verified === Number(l.returned)) continue;
      const res = await updateOrderLine(l.id, { returned: verified });
      if (res.error) {
        alert(`Failed to update "${l.name}": ${res.error}`);
        setConfirmingReceive(false);
        return;
      }
    }
    const res = await updateOrder(id, {
      return_received: true,
      return_inbound: false,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      const linesRes = await readOrderLines({
        filter: { order_id: { _eq: id } },
      });
      if (!linesRes.error) setLines(linesRes.data ?? []);
      await appendOrderHistory({
        order_id: id,
        what: "Returned goods received & weighed at the warehouse",
        who: userId,
        stage: "returned",
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      alert(`Failed to confirm receipt: ${res.error}`);
    }
    setConfirmingReceive(false);
  }

  /** SETTLE bucket — admin picks the Accurate document type, branching to close or replacement. */
  async function handleConfirmSettle() {
    if (!id || !order || confirmingSettle) return;
    const doc = RETURN_DOC_OPTIONS.find((d) => d.key === selectedDocType);
    if (!doc) return;
    setConfirmingSettle(true);

    if (doc.replacement) {
      const returnedLines = lines.filter((l) => Number(l.returned) > 0);
      for (const l of returnedLines) {
        const res = await updateOrderLine(l.id, { returned: 0, delivered: 0 });
        if (res.error) {
          alert(`Failed to reset "${l.name}": ${res.error}`);
          setConfirmingSettle(false);
          return;
        }
      }
      const res = await updateOrder(id, {
        stage: "cold",
        is_replacement: true,
        return_doc: doc.label,
        return_settle: null,
      });
      if (!res.error && res.data) {
        setOrder(res.data);
        const linesRes = await readOrderLines({
          filter: { order_id: { _eq: id } },
        });
        if (!linesRes.error) setLines(linesRes.data ?? []);
        await appendOrderHistory({
          order_id: id,
          what: `Return + replacement (${doc.label}) — back to Cold Storage`,
          who: userId,
          stage: "cold",
        });
        const hRes = await readOrderHistory(id);
        if (!hRes.error) setHistory(hRes.data ?? []);
      } else {
        alert(`Failed to process the replacement: ${res.error}`);
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
        alert(`Failed to issue the revised DO/SI: ${res.error}`);
      }
    } else {
      // return-note: nothing physical goes out — closes immediately.
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
      } else {
        alert(`Failed to close the return: ${res.error}`);
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
      alert(`Upload failed: ${uploadRes.error}`);
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
      alert(`Failed to save the signed document: ${docRes.error}`);
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
      alert(`Failed to close the return: ${res.error}`);
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
      alert(`Failed to add note: ${res.error}`);
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
    alert(t("WhatsApp order confirmation copied to clipboard."));
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
            <div className={styles.titleSection}>
              <Button
                type="button"
                variant="tertiary"
                icon="chevronLeft"
                onClick={() => navigate(backTo)}
              >
                {t("Back")}
              </Button>

              <div className={styles.titleRow}>
                <h3 className={styles.title}>
                  {t("Order")} {order.no}
                </h3>
                {isCancelled && (
                  <span
                    style={{
                      color: "var(--state-error)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {t("CANCELLED")}
                  </span>
                )}
                {isOutstanding && (
                  <span
                    style={{
                      color: "var(--state-warning)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {t("ON HOLD")}
                  </span>
                )}
                {isReturned && (
                  <span
                    style={{
                      color: "var(--state-error)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {t("RETURNED")}
                  </span>
                )}
                {order.is_replacement && (
                  <span
                    style={{
                      color: "var(--accent-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {t("REPLACEMENT")}
                  </span>
                )}
              </div>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                icon="whatsapp"
                onClick={copyWA}
              >
                {t("Copy WA")}
              </Button>
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
          </header>

          {/* Stepper — once delivered, replace the 8-step track with one
              prominent "done" banner instead of a stepper with nothing left
              to step through. */}
          {stage === "delivered" ? (
            <div className={styles.deliveredBanner}>
              <Card
                style={{
                  backgroundColor: "var(--bg-surface-hover-dark)",
                  borderColor: "var(--accent-primary)",
                }}
              >
                <div className={styles.deliveredBannerHeader}>
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
                    <button
                      type="button"
                      className={styles.mapLink}
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${order.deliver_geo!.lat},${order.deliver_geo!.lng}`,
                          "_blank",
                          "noopener",
                        )
                      }
                    >
                      {t("Map")}
                    </button>
                  </div>
                )}
                {activeProof?.name && (
                  <div className={styles.receivedByRow}>
                    {t("Received by")} <strong>{activeProof.name}</strong>
                  </div>
                )}
              </Card>
              {stage === "delivered" && canUndo && (
                <div className={styles.undoRow}>
                  <Button type="button" variant="tertiary" onClick={handleUndo}>
                    <Icon name="undo" size={16} />
                    {t("Pressed wrongly? Undo — back to dispatch")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <></>
          )}

          {stage !== "delivered" && (
            <div
              className={styles.stepperContainer}
              style={{ "--completed-pct": completedPct } as React.CSSProperties}
            >
              <div className={styles.stepperTrack}>
                {PIPELINE_STAGES.map((s, idx) => {
                  // Once the order is delivered, the whole stepper — every
                  // dot and every connecting line, not just up to the current
                  // index — reads as done: no in-progress/pulsing step left.
                  const isDeliveredStage = stage === "delivered";
                  const isTerminalDelivered =
                    s.key === "delivered" && isDeliveredStage;
                  const isActive = stage === s.key && !isTerminalDelivered;
                  const isCompleted =
                    isDeliveredStage || currentStageIndex > idx;

                  return (
                    <div key={s.key} className={styles.stepColumn}>
                      <div className={styles.stepHeaderRow}>
                        <div
                          className={[
                            styles.stepLine,
                            idx === 0 ? styles.stepLineInvisible : "",
                            isDeliveredStage || currentStageIndex >= idx
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
                            isDeliveredStage || currentStageIndex > idx
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
                const hasPrice = line.price != null && line.price !== "";
                const isWeighedItem =
                  line.unit === "Loaf" ||
                  line.unit === "kg" ||
                  line.unit === "gram";

                const weighingLines = line.id
                  ? (weighingsMap[line.id] ?? [])
                  : [];
                const totalMeasuredWeight = weighingLines.reduce(
                  (acc, w) => acc + (parseFloat(w.weight) || 0),
                  0,
                );
                const itemPhotos = line.id
                  ? (itemPhotosMap[line.id] ?? [])
                  : [];
                const sendingQty = line.id
                  ? (sendingQtyMap[line.id] ?? qty)
                  : qty;

                return (
                  <div key={line.id} className={styles.itemRow}>
                    <div className={styles.itemHeader}>
                      <div className={styles.itemInfo}>
                        <span className={styles.itemIndex}>{qty}</span>
                        <span className={styles.unitTag}>{line.unit}</span>
                        <span className={styles.itemName}>{line.name}</span>
                      </div>
                      <div className={styles.sendingBadge}>
                        {t("sending")}
                        <input
                          type="number"
                          className={styles.sendingInput}
                          value={sendingQty}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              parseInt(e.target.value) || 0,
                            );
                            if (line.id)
                              setSendingQtyMap((prev) => ({
                                ...prev,
                                [line.id!]: val,
                              }));
                          }}
                        />
                        {t("of")} {qty}
                      </div>
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

                    <div className={styles.linePhotos}>
                      {canWeighHere && (
                        <label
                          style={{
                            display: "inline-flex",
                            cursor: "pointer",
                            marginLeft: 28,
                          }}
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon="camera"
                            iconOnly
                            title={t("Upload item photo")}
                            onClick={(e) => {
                              const inputElem = (e.currentTarget as HTMLElement)
                                .nextElementSibling as HTMLInputElement;
                              inputElem?.click();
                            }}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => handleUploadItemPhoto(line.id, e)}
                          />
                        </label>
                      )}
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
                                  stage === "delivered"
                                    ? {
                                        url: img.url,
                                        title: `${t("Attachment for")} ${line.name}`,
                                      }
                                    : {
                                        url: img.url,
                                        title: `${t("Attachment for")} ${line.name}`,
                                        photoId: img.id,
                                        lineId: line.id,
                                      },
                                )
                              }
                            >
                              <img
                                src={img.url}
                                alt="thumbnail"
                                className={styles.thumbnailImg}
                              />
                              {stage !== "delivered" && (
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

                    {/* Item Summary line */}
                    <div className={styles.itemTotalRow}>
                      {stage !== "intake" && (
                        <span className={styles.totalWeight}>
                          {t("Total:")}{" "}
                          {isWeighedItem
                            ? `${totalMeasuredWeight.toFixed(2)} kg`
                            : ""}
                        </span>
                      )}
                      {canSeePrices &&
                        (hasPrice ? (
                          <div className={styles.priceCalc}>
                            <span>{currency.format(price)}</span>
                            <span>x {qty}</span>
                            <span className={styles.lineTotalPrice}>
                              {currency.format(price * qty)}
                            </span>
                          </div>
                        ) : (
                          <div className={styles.priceCalc}>
                            {t("No price on the order — invoiced in Accurate.")}
                          </div>
                        ))}
                    </div>
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

            {canSeePrices && (
              <div className={styles.totalRow}>
                <span>{t("Order value · from PO")}</span>
                <span className={styles.totalValue}>
                  {currency.format(orderTotal)}
                </span>
              </div>
            )}
          </Card>

          {/* Documents Section */}
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

          {showActorNotice && (
            <div className={styles.actorNotice}>
              {t("This order is currently with")}{" "}
              <strong>{t(stageActor ?? "")}</strong>.
            </div>
          )}

          {/* Stage Action Controls */}
          {!isCancelled && (
            <div className={styles.stageActions}>
              {flow?.next && canAdvance && stage !== "dispatch" && (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleAdvance}
                  disabled={advancing}
                  className={styles.actionBtn}
                >
                  {advancing ? t("Saving…") : t(flow.advanceLabel)}
                </Button>
              )}

              {/* Hand-off mode chooser — dispatch stage, no mode picked yet */}
              {stage === "dispatch" && canAdvance && !handoffMode && (
                <Card>
                  <div className={styles.heading}>{t("Delivery")}</div>
                  <div className={styles.deliveryActions}>
                    <Button
                      type="button"
                      variant="primary"
                      icon="navigation"
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
                      onClick={handleChoosePickup}
                      disabled={choosingMode}
                    >
                      {t("Customer is picking up")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      buttonStyle="fullWidth"
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
                    {condPhotos.length > 0 && (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="md"
                        icon="reload"
                        onClick={handleChangeMethod}
                        disabled={submittingProof || choosingMode}
                      >
                        {t("Change method")}
                      </Button>
                    )}
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
                            <button
                              type="button"
                              className={[
                                styles.codSegment,
                                codOutcome === "full"
                                  ? styles.codSegmentSuccess
                                  : "",
                              ].join(" ")}
                              onClick={() => {
                                setCodOutcome("full");
                                setPartialAmountInput("");
                                setOutstandingReason(null);
                              }}
                            >
                              {t("Full")}
                            </button>
                            <button
                              type="button"
                              className={[
                                styles.codSegment,
                                codOutcome === "partial"
                                  ? styles.codSegmentWarning
                                  : "",
                              ].join(" ")}
                              onClick={() => setCodOutcome("partial")}
                            >
                              {t("Partial")}
                            </button>
                            <button
                              type="button"
                              className={[
                                styles.codSegment,
                                codOutcome === "none"
                                  ? styles.codSegmentWarning
                                  : "",
                              ].join(" ")}
                              onClick={() => {
                                setCodOutcome("none");
                                setPartialAmountInput("");
                              }}
                            >
                              {t("None")}
                            </button>
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
                              style={{ width: 180 }}
                            />
                          )}
                          {codOutcome && (
                            <div
                              className={[
                                styles.codOutcomeLine,
                                codOutcome === "full"
                                  ? styles.codOutcomeLineSuccess
                                  : styles.codOutcomeLineWarning,
                              ].join(" ")}
                            >
                              {t("Collected")}{" "}
                              {currency.format(cashCollected ?? 0)} {t("of")}{" "}
                              {currency.format(codAmount)}
                            </div>
                          )}
                          {codOutcome && codOutcome !== "full" && (
                            <div className={styles.codReasonRow}>
                              {OUTSTANDING_REASONS.map((r) => (
                                <button
                                  key={r.key}
                                  type="button"
                                  className={[
                                    styles.codReasonChip,
                                    outstandingReason === r.key
                                      ? styles.codReasonChipActive
                                      : "",
                                  ].join(" ")}
                                  onClick={() => setOutstandingReason(r.key)}
                                >
                                  {t(r.label)}
                                </button>
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
                        size="md"
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
                          size="md"
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
                          size="md"
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

              {(showCodRow || showDocsRow) && (
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
                </Card>
              )}
              {isDelivered && order.docs_returned && (
                <Card
                  style={{
                    borderColor: "var(--accent-primary)",
                    backgroundColor: "var(--bg-surface-hover-dark)",
                  }}
                >
                  <div
                    className={styles.left}
                    style={{ color: "var(--accent-primary)" }}
                  >
                    <Icon name="check" />
                    <div className={styles.fieldLabel}>
                      {t("Signed DO & SI returned")}
                    </div>
                  </div>
                </Card>
              )}

              {showFinanceApproveRow && (
                <Card className={styles.followUpsCard}>
                  <div className={styles.heading}>
                    <span>{t("Finance gate")}</span>
                  </div>
                  <div className={styles.followUpRow}>
                    <Icon
                      name="cash"
                      size={24}
                      className={styles.followUpIcon}
                    />
                    <div className={styles.followUpMain}>
                      <span className={styles.fieldLabel}>
                        {t("Awaiting payment approval")}
                      </span>
                      <span className={styles.secondary}>
                        {t("Finance is clearing payment in parallel")}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={handleApproveFinance}
                      disabled={approvingFinance}
                      style={{ width: "140px" }}
                    >
                      {approvingFinance
                        ? t("Saving…")
                        : t("Approve Payment")}
                    </Button>
                  </div>
                </Card>
              )}
              {showFinanceUndoRow && (
                <div className={styles.undoRow}>
                  <Button
                    type="button"
                    variant="tertiary"
                    onClick={handleUndoFinanceClear}
                    disabled={approvingFinance}
                  >
                    <Icon name="undo" size={16} />
                    {t("Pressed wrongly? Undo payment clearance")}
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
                      <label
                        className={styles.actionBtn}
                        style={{ cursor: "pointer" }}
                      >
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

          {/* Returns Sub-Flow — parallel buckets (receive / settle / sign) */}
          {isReturned && !isCancelled && (
            <Card>
              <div className={styles.heading}>
                <span>{t("Customer Return")}</span>
              </div>
              {order.returned_reason && (
                <p className="tiny muted">
                  {t("Reason:")} {order.returned_reason}
                </p>
              )}

              {inReceiveBucket && (
                <div style={{ marginBottom: "1rem" }}>
                  <h4 style={{ margin: "0.5rem 0" }}>{t("Awaiting Return")}</h4>
                  {lines
                    .filter((l) => Number(l.returned) > 0)
                    .map((l) => (
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
                          value={receiveQtyMap[l.id] ?? String(l.returned ?? 0)}
                          disabled={!canProcessReturns}
                          onChange={(e) =>
                            setReceiveQtyMap((prev) => ({
                              ...prev,
                              [l.id]: e.target.value,
                            }))
                          }
                        />
                        <span className="tiny muted">{l.unit}</span>
                        {canProcessReturns && (
                          <label
                            className={styles.actionBtn}
                            style={{ cursor: "pointer" }}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                handleUploadReceiveWeighPhoto(l.id, e)
                              }
                            />
                            <Icon name="camera" size={16} />
                          </label>
                        )}
                        {l.returned_weigh_photo && (
                          <img
                            src={getAssetUrl(l.returned_weigh_photo)}
                            alt=""
                            className={styles.thumbnailImg}
                            style={{ width: 32, height: 32 }}
                          />
                        )}
                      </div>
                    ))}
                  {canProcessReturns && (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleConfirmReceive}
                      disabled={confirmingReceive}
                    >
                      {confirmingReceive
                        ? "Saving…"
                        : "Confirm received & weighed"}
                    </Button>
                  )}
                </div>
              )}

              {inSettleBucket && (
                <div style={{ marginBottom: "1rem" }}>
                  <h4 style={{ margin: "0.5rem 0" }}>
                    {t("Admin Action Required")}
                  </h4>
                  {canProcessReturns ? (
                    <>
                      {RETURN_DOC_OPTIONS.map((opt) => (
                        <label
                          key={opt.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginBottom: "0.375rem",
                          }}
                        >
                          <input
                            type="radio"
                            name="returnDocType"
                            value={opt.key}
                            checked={selectedDocType === opt.key}
                            onChange={() => setSelectedDocType(opt.key)}
                          />
                          {t(opt.label)}
                        </label>
                      ))}
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleConfirmSettle}
                        disabled={!selectedDocType || confirmingSettle}
                      >
                        {confirmingSettle ? t("Saving…") : t("Confirm")}
                      </Button>
                    </>
                  ) : (
                    <p className="tiny muted">
                      {t("Waiting for an admin to update Accurate & decide.")}
                    </p>
                  )}
                </div>
              )}

              {inSignBucket && (
                <div style={{ marginBottom: "1rem" }}>
                  <h4 style={{ margin: "0.5rem 0" }}>
                    {t("Awaiting Signed DO/SI")}
                  </h4>
                  {latestSignedDoc ? (
                    <p className="tiny muted">
                      {t(
                        "Signed document on file — order closes once received.",
                      )}
                    </p>
                  ) : canProcessReturns ? (
                    <>
                      <label
                        className={styles.actionBtn}
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
                      <div>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={handleMarkSignedAndClose}
                          disabled={!signedDocFileId || closingSigned}
                        >
                          {closingSigned
                            ? t("Saving…")
                            : t("Mark signed & close")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="tiny muted">
                      {t("Revised DO/SI is out with the customer to sign.")}
                    </p>
                  )}
                </div>
              )}

              {order.is_replacement && !isDelivered && (
                <p className="tiny muted">
                  {t("Replacement re-entered the pipeline and is currently at")}{" "}
                  <strong>
                    {t(
                      PIPELINE_STAGES.find((s) => s.key === stage)?.label ??
                        stage,
                    )}
                  </strong>
                  .
                </p>
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
                    icon="pause"
                    onClick={handleHold}
                  >
                    {t("Put on Hold")}
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
