import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { Avatar } from "../../components/Avatar/Avatar";
import { useAuth, useCurrentUserId } from "../../hooks/useAuth";
import { getInitials } from "../../lib/initials";
import {
  readOrder,
  readOrderLines,
  readOrderHistory,
  readAttachments,
  readCustomers,
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
} from "../../lib/directus";
import type {
  OrdersCollection,
  OrderLinesCollection,
  OrderHistoryCollection,
  AttachmentsCollection,
  CustomersCollection,
  UserBrief,
  LineCutsCollection,
} from "../../types/directus";
import { ImageDetailsModal } from "../../components/ImageDetailsModal/ImageDetailsModal";
import styles from "./OrderDetail.module.css";

/* ─────────────────────────────────────── pipeline definition ── */

const PIPELINE_STAGES = [
  { key: "intake", label: "Intake" },
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
    sendBackLabel?: string;
  }
> = {
  intake: {
    next: "cold",
    prev: null,
    capability: "advanceStage",
    advanceLabel: "Send to Cold Storage",
    sendBackLabel: undefined,
  },
  cold: {
    next: "production",
    prev: "intake",
    capability: "weighColdStorage",
    advanceLabel: "Done — Send to Production",
    sendBackLabel: "Return to Intake",
  },
  finance: {
    next: null,
    prev: null,
    capability: "approveFinance",
    advanceLabel: "Approve Payment",
    sendBackLabel: undefined,
  },
  production: {
    next: "packing",
    prev: "cold",
    capability: "cutProduction",
    advanceLabel: "Done — Send to Packing",
    sendBackLabel: "Return to Cold Storage",
  },
  packing: {
    next: "finalise",
    prev: "production",
    capability: "packWarehouse",
    advanceLabel: "Done — Send to Finalise",
    sendBackLabel: "Return to Production",
  },
  finalise: {
    next: "dispatch",
    prev: "packing",
    capability: "advanceStage",
    advanceLabel: "Ready — Send to Dispatch",
    sendBackLabel: "Return to Packing",
  },
  dispatch: {
    next: "delivered",
    prev: "finalise",
    capability: "dispatch",
    advanceLabel: "Mark as Delivered",
    sendBackLabel: "Return to Finalise",
  },
  delivered: {
    next: null,
    prev: "dispatch",
    capability: "advanceStage",
    advanceLabel: "",
    sendBackLabel: "Re-open to Dispatch",
  },
};

const DOC_TYPES = ["DO", "SI", "Return Note", "PO", "Other"] as const;

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
  const backTo = (location.state as { from?: string } | null)?.from ?? "/orders";
  const auth = useAuth();
  const userId = useCurrentUserId();

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
  } | null>(null);

  /* ── action state ── */
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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
      ] = await Promise.all([
        readOrder(orderId),
        readOrderLines({ filter: { order_id: { _eq: orderId } } }),
        readOrderHistory(orderId),
        readAttachments(orderId),
        readCustomers(),
        readAllUsers(),
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

  /* ────────────── guards ── */
  if (loading)
    return <div className={styles.muted}>Loading order details…</div>;
  if (error || !order)
    return (
      <div className={styles.muted} style={{ color: "var(--state-error)" }}>
        {error || "Order not found."}
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

  const canEdit = auth.can("editOrderLines") && !isCancelled && !isDelivered;
  const canAdvance = flow ? auth.can(flow.capability) : false;
  const canSendBack = flow?.prev ? auth.can(flow.capability) : false;
  const canCancel = auth.can("cancelOrders") && !isCancelled && !isDelivered;
  const canHold =
    auth.can("advanceStage") && !isOutstanding && !isCancelled && !isDelivered;
  const canRestore = (isCancelled || isOutstanding) && auth.can("advanceStage");
  const canAddDocs = auth.can("printDocuments");

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

  /* Split attachments: manual doc entries vs file uploads */
  const docEntries = attachments.filter(
    (a) => !a.message_id && (a.number || a.doc_type),
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
        window.alert(`Failed to delete weighing: ${res.error}`);
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
        window.alert(`Failed to save weighing: ${res.error}`);
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
      if (res.error) window.alert(`Failed to update weighing: ${res.error}`);
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
      window.alert(`Photo upload failed: ${uploadRes.error}`);
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
        window.alert(`Failed to save weighing: ${res.error}`);
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
      window.alert(`Failed to save photo: ${photoRes.error}`);
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
      window.alert(`Failed to remove photo: ${res.error}`);
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
      window.alert(`Photo upload failed: ${uploadRes.error}`);
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
      window.alert(`Failed to save photo: ${createRes.error}`);
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
      window.alert(`Failed to remove photo: ${res.error}`);
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
      window.alert(`Upload failed: ${uploadRes.error}`);
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
      window.alert(`Failed to log document: ${res.error}`);
    }
    setSavingDoc(false);
  }

  async function handleDeleteDocument(docId: number | string) {
    if (!window.confirm("Delete this document?")) return;
    const res = await deleteAttachment(docId);
    if (!res.error) {
      setAttachments((prev) => prev.filter((a) => a.id !== docId));
    } else {
      window.alert(`Failed to delete document: ${res.error}`);
    }
  }

  /* ────────────── Stage Flow Actions ── */
  async function handleAdvance() {
    if (!id || !flow?.next || advancing) return;
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
      window.alert(`Failed to advance stage: ${res.error}`);
    }
    setAdvancing(false);
  }

  async function handleSendBack() {
    if (!id || !flow?.prev || advancing) return;
    setAdvancing(true);
    const res = await updateOrder(id, { stage: flow.prev });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: `Stage returned: ${stage} → ${flow.prev}`,
        who: userId,
        stage: flow.prev,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      window.alert(`Failed to send back: ${res.error}`);
    }
    setAdvancing(false);
  }

  async function handleCancel() {
    if (
      !id ||
      !window.confirm("Cancel this order? This can be undone via Restore.")
    )
      return;
    setCancelling(true);
    const res = await updateOrder(id, {
      cancelled: true,
      stage: "cancelled",
      cancelled_from: stage,
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
      window.alert(`Failed to cancel order: ${res.error}`);
    }
    setCancelling(false);
  }

  async function handleHold() {
    if (!id) return;
    const res = await updateOrder(id, { stage: "outstanding" });
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
      window.alert(`Failed to hold order: ${res.error}`);
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
      window.alert(`Failed to restore order: ${res.error}`);
    }
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
      window.alert(`Failed to add note: ${res.error}`);
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
    window.alert("WhatsApp order confirmation copied to clipboard.");
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
                Back
              </Button>

              <div className={styles.titleRow}>
                <h3 className={styles.title}>Order {order.no}</h3>
                {isCancelled && (
                  <span
                    style={{
                      color: "var(--state-error)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    CANCELLED
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
                    ON HOLD
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
                Copy WA
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon="printer"
                onClick={() => window.print()}
              >
                Print
              </Button>
              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  icon="edit"
                  onClick={() => navigate(`/orders/${order.id}/edit`)}
                >
                  Edit
                </Button>
              )}
            </div>
          </header>

          {/* Stepper */}
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
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

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
              title={customerId ? "View customer details" : undefined}
            >
              <Avatar
                initials={getInitials(order.customer_name) || "??"}
                label={order.customer_name || ""}
                size="lg"
              ></Avatar>
              <div className={styles.customerInfo}>
                <h3>{order.customer_name || "—"}</h3>
                <p>
                  {matchedCustomer?.channel?.toUpperCase() || "Horeca · B2B"}
                </p>
              </div>
            </div>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Delivery Date</span>
                <span className={styles.detailValue}>
                  {formatDate(order.deliver_at)}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Order Date</span>
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
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Sales Rep</span>
                <span className={styles.detailValue}>
                  {order.sales ?? order.sales_rep ?? "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Contact</span>
                <span className={styles.detailValue}>
                  {order.customer_contact ?? "—"}
                </span>
              </div>
              {order.customer_address && (
                <div
                  className={styles.detailItem}
                  style={{ gridColumn: "1 / -1" }}
                >
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>
                    {order.customer_address}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Items Card */}
          <Card>
            <div className={styles.heading}>
              Items <span className={styles.count}>{lines.length}</span>
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
                        sending
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
                        of {qty}
                      </div>
                    </div>

                    {/* Weighing Lines for Loaf/kg items */}
                    {isWeighedItem && (
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
                                title="Add weighing photo"
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
                              title="Remove weighing"
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
                                        title: `Weighing photo — ${line.name}`,
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
                                      title="Delete image"
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
                          Add weighing
                        </Button>
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
                          title="Upload item photo"
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
                                setActiveImageModal({
                                  url: img.url,
                                  title: `Attachment for ${line.name}`,
                                  photoId: img.id,
                                  lineId: line.id,
                                })
                              }
                            >
                              <img
                                src={img.url}
                                alt="thumbnail"
                                className={styles.thumbnailImg}
                              />
                              <div
                                className={styles.thumbnailHoverTrash}
                                title="Delete image"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveItemPhoto(line.id, img.id);
                                }}
                              >
                                <Icon name="trash" size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Item Summary line */}
                    <div className={styles.itemTotalRow}>
                      <span className={styles.totalWeight}>
                        Total:{" "}
                        {isWeighedItem
                          ? `${totalMeasuredWeight.toFixed(2)} kg`
                          : ""}
                      </span>
                      <div className={styles.priceCalc}>
                        <span>
                          {currency.format(price)} x {qty}
                        </span>
                        <span className={styles.lineTotalPrice}>
                          {currency.format(price * qty)}
                        </span>
                      </div>
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
                <span className={styles.noteHeader}>Order Note</span>
                <span>{order.notes}</span>
              </div>
            )}

            <div className={styles.totalRow}>
              <span>Order value · from PO</span>
              <span className={styles.totalValue}>
                {currency.format(orderTotal)}
              </span>
            </div>
          </Card>

          {/* Documents Section */}
          <Card>
            <div className={styles.heading}>
              Documents{" "}
              <span className={styles.count}>{docEntries.length}</span>
            </div>

            {docEntries.length === 0 ? (
              <p className={styles.muted}>No documents logged yet.</p>
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
                          title="Delete document"
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
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className={styles.editInput}
                    style={{ flex: 1 }}
                    placeholder="Document number"
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
                    {savingDoc ? "…" : "+ Add"}
                  </Button>
                </div>
                <input
                  type="text"
                  className={styles.editInput}
                  placeholder="Put notes here..."
                  value={docNote}
                  onChange={(e) => setDocNote(e.target.value)}
                />
              </form>
            )}
          </Card>

          {/* Stage Action Controls */}
          {!isCancelled && (
            <div className={styles.stageActions}>
              <div
                style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
              >
                {flow?.next && canAdvance && (
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={handleAdvance}
                    disabled={advancing}
                    className={styles.actionBtn}
                  >
                    {advancing ? "Saving…" : flow.advanceLabel}
                  </Button>
                )}
                {flow?.prev && canSendBack && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={handleSendBack}
                    disabled={advancing}
                    className={styles.actionBtn}
                  >
                    {flow.sendBackLabel ?? "Send Back"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Order Actions (Hold / Cancel / Restore) */}
          {(canCancel || canHold || canRestore) && (
            <div className={styles.orderActions}>
              {canRestore && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon="refresh"
                  onClick={handleRestore}
                >
                  Restore Order
                </Button>
              )}
              {canHold && !isOutstanding && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon="pause"
                  onClick={handleHold}
                >
                  Put on Hold
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon="cancel"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling…" : "Cancel Order"}
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
            title={isPanelOpen ? "Collapse side panel" : "Expand side panel"}
          />

          <div
            className={[
              styles.sidePanelStickyContent,
              !isPanelOpen ? styles.sidePanelStickyContentCollapsed : "",
            ].join(" ")}
          >
            {/* Notes Card */}
            <Card className={styles.notesCard}>
              <h3 className={styles.heading}>Notes</h3>
              <div className={styles.notesListScroll}>
                {history.filter((h) => h.what.startsWith("Note")).length ===
                0 ? (
                  <p className={styles.muted}>No note</p>
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
                  placeholder="Add note for the team..."
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
                  Add
                </Button>
              </form>
            </Card>

            {/* History Card */}
            <Card className={styles.historyCard}>
              <h3 className={styles.heading}>History</h3>
              <div className={styles.historyListScroll}>
                {history.length === 0 && (
                  <p className={styles.muted}>No history yet.</p>
                )}
                {history
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
                      <span className={styles.historyContent}>{h.what}</span>
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
                : undefined
        }
      />
    </div>
  );
}
