import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { Button } from '../../components/Button/Button';
import { useAuth, useCurrentUserId } from '../../hooks/useAuth';
import {
  readOrder,
  readOrderLines,
  readOrderHistory,
  readAttachments,
  readCustomers,
  readProducts,
  readMe,
  appendOrderHistory,
  updateOrder,
  updateOrderLine,
  createOrderLine,
  deleteOrderLine,
  createAttachment,
  deleteAttachment,
  uploadFile,
  readAllUsers,
  readLineCuts,
  createLineCut,
  updateLineCut,
  deleteLineCut,
} from '../../lib/directus';
import type {
  OrdersCollection,
  OrderLinesCollection,
  OrderHistoryCollection,
  AttachmentsCollection,
  CustomersCollection,
  ProductsCollection,
  UserBrief,
  LineCutsCollection
} from '../../types/directus';
import styles from './OrderDetail.module.css';

/* ─────────────────────────────────────── pipeline definition ── */

const PIPELINE_STAGES = [
  { key: 'intake', label: 'Intake' },
  { key: 'cold', label: 'Cold Storage' },
  { key: 'finance', label: 'Finance' },
  { key: 'production', label: 'Production' },
  { key: 'packing', label: 'Packing' },
  { key: 'finalise', label: 'Finalise' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'delivered', label: 'Delivered' },
];

const STAGE_FLOW: Record<string, {
  next: string | null;
  prev: string | null;
  capability: 'advanceStage' | 'approveFinance' | 'weighColdStorage' | 'cutProduction' | 'packWarehouse' | 'dispatch';
  advanceLabel: string;
  sendBackLabel?: string;
}> = {
  intake: { next: 'cold', prev: null, capability: 'advanceStage', advanceLabel: 'Send to Cold Storage', sendBackLabel: undefined },
  cold: { next: 'production', prev: 'intake', capability: 'weighColdStorage', advanceLabel: 'Done — Send to Production', sendBackLabel: 'Return to Intake' },
  finance: { next: null, prev: null, capability: 'approveFinance', advanceLabel: 'Approve Payment', sendBackLabel: undefined },
  production: { next: 'packing', prev: 'cold', capability: 'cutProduction', advanceLabel: 'Done — Send to Packing', sendBackLabel: 'Return to Cold Storage' },
  packing: { next: 'finalise', prev: 'production', capability: 'packWarehouse', advanceLabel: 'Done — Send to Finalise', sendBackLabel: 'Return to Production' },
  finalise: { next: 'dispatch', prev: 'packing', capability: 'advanceStage', advanceLabel: 'Ready — Send to Dispatch', sendBackLabel: 'Return to Packing' },
  dispatch: { next: 'delivered', prev: 'finalise', capability: 'dispatch', advanceLabel: 'Mark as Delivered', sendBackLabel: 'Return to Finalise' },
  delivered: { next: null, prev: 'dispatch', capability: 'advanceStage', advanceLabel: '', sendBackLabel: 'Re-open to Dispatch' },
};

const DOC_TYPES = ['DO', 'SI', 'Return Note', 'PO', 'Other'] as const;
const UNIT_OPTIONS = ['Loaf', 'Box', 'Pack', 'kg', 'gram', 'pcs', 'ekor'];

/* ─────────────────────────────────────── helpers ── */

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
});

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (withTime) {
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

interface WeighingLine {
  id: string;
  weight: string;
  photoId: string | null;
  photoUrl?: string;
}

interface CutItem {
  id: string;
  text: string;
}

interface EditableLine {
  id: string;
  isNew?: boolean;
  productId: string | null;
  name: string;
  qty: string;
  unit: string;
  price: string;
  cuts: CutItem[];
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = useCurrentUserId();

  /* ── data state ── */
  const [order, setOrder] = useState<OrdersCollection | null>(null);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);
  const [history, setHistory] = useState<OrderHistoryCollection[]>([]);
  const [attachments, setAttachments] = useState<AttachmentsCollection[]>([]);
  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineCutsByLine, setLineCutsByLine] = useState<Record<string, LineCutsCollection[]>>({});

  /* ── ui state ── */
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeImageModal, setActiveImageModal] = useState<{
    url: string;
    title: string;
    attachmentId?: number | string;
    lineId?: string;
    photoId?: string;
  } | null>(null);

  /* ── action state ── */
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);

  /* ── document form ── */
  const [docType, setDocType] = useState<string>('DO');
  const [docNumber, setDocNumber] = useState('');
  const [docNote, setDocNote] = useState('');
  const [docFileId, setDocFileId] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  /* ── weighing lines & item photos local state ── */
  const [weighingsMap, setWeighingsMap] = useState<Record<string, WeighingLine[]>>({});
  const [itemPhotosMap, setItemPhotosMap] = useState<Record<string, { id: string; url: string; attachmentId?: number | string }[]>>({});
  const [sendingQtyMap, setSendingQtyMap] = useState<Record<string, number>>({});

  /* ── edit mode form state ── */
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [editDeliverDate, setEditDeliverDate] = useState('');
  const [editOrderDate, setEditOrderDate] = useState('');
  const [editSales, setEditSales] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editLines, setEditLines] = useState<EditableLine[]>([]);

  /* ── user's name state ── */
  const [users, setUsers] = useState<UserBrief[]>([]);

  /* ── Add Item Modal state ── */
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [addItemText, setAddItemText] = useState('');
  const [matchedItem, setMatchedItem] = useState<{
    qty: string;
    unit: string;
    name: string;
    productId: string | null;
  } | null>(null);

  /* ────────────── load data ── */
  useEffect(() => {
    const orderId = id as string;
    if (!orderId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [orderRes, linesRes, historyRes, attachmentsRes, customersRes, productsRes, usersRes] = await Promise.all([
        readOrder(orderId),
        readOrderLines({ filter: { order_id: { _eq: orderId } } }),
        readOrderHistory(orderId),
        readAttachments(orderId),
        readCustomers(),
        readProducts(),
        readAllUsers(),
      ]);

      if (cancelled) return;

      if (orderRes.error) { setError(`Failed to load order: ${orderRes.error}`); setLoading(false); return; }
      if (linesRes.error) { setError(`Failed to load order lines: ${linesRes.error}`); setLoading(false); return; }

      setOrder(orderRes.data);
      const loadedLines = linesRes.data ?? [];
      setLines(loadedLines);
      setHistory(historyRes.data ?? []);
      setAttachments(attachmentsRes.data ?? []);
      setCustomers(customersRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setUsers(usersRes.data ?? []);
      setLines(loadedLines);

      // initialize weighing lines state for lines
      const initialWeighings: Record<string, WeighingLine[]> = {};
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
          initialSending[line.id] = typeof line.qty === 'string' ? parseFloat(line.qty) : (line.qty ?? 1);
          const wVal = line.weight != null ? String(line.weight) : '0.00';
          initialWeighings[line.id] = [
            { id: 'w1', weight: wVal !== '0.00' ? wVal : '2.01', photoId: line.weigh_photo ?? null }
          ];
        }
      });
      setWeighingsMap(initialWeighings);
      setSendingQtyMap(initialSending);

      setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [id]);

  /* ────────────── guards ── */
  if (loading) return <div className={styles.muted}>Loading order details…</div>;
  if (error || !order) return (
    <div className={styles.muted} style={{ color: 'var(--state-error)' }}>
      {error || 'Order not found.'}
    </div>
  );

  /* ────────────── derived ── */
  const stage = order.stage ?? 'intake';
  const flow = STAGE_FLOW[stage];
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === stage);

  /* ────────────── stepper ── */
  const completedPct = currentStageIndex === -1
    ? '0%'
    : `${(currentStageIndex / (PIPELINE_STAGES.length - 1)) * 100}%`;

  const isCancelled = order.cancelled === true || stage === 'cancelled';
  const isOutstanding = stage === 'outstanding';
  const isDelivered = stage === 'delivered';

  const canEdit = auth.can('editOrderLines') && !isCancelled && !isDelivered;
  const canAdvance = flow ? auth.can(flow.capability) : false;
  const canSendBack = flow?.prev ? auth.can(flow.capability) : false;
  const canCancel = auth.can('cancelOrders') && !isCancelled && !isDelivered;
  const canHold = auth.can('advanceStage') && !isOutstanding && !isCancelled && !isDelivered;
  const canRestore = (isCancelled || isOutstanding) && auth.can('advanceStage');
  const canAddDocs = auth.can('printDocuments');

  const editSummary = isEditing ? buildEditSummary() : 'Order edited (no change)';
  const hasEditChanges = editSummary !== 'Order edited (no change)';

  const directusFileUrl = (fileId: string) =>
    `${import.meta.env.VITE_DIRECTUS_URL}/assets/${fileId}`;

  function displayName(id: string | null | undefined): string {
    if (!id) return '—';
    const u = users.find((u) => u.id === id);
    if (!u) return id; // fallback: still show the UUID rather than nothing
    const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    return full || u.email || id;
  }

  const matchedCustomer = customers.find(
    (c) => (order.customer_id && c.id === order.customer_id) ||
      (order.customer_name && c.name?.toLowerCase() === order.customer_name.toLowerCase())
  );
  const customerId = order.customer_id || matchedCustomer?.id;

  /* Calculate order total value */
  const orderTotal = (isEditing ? editLines : lines).reduce((acc, line) => {
    const qty = typeof line.qty === 'string' ? parseFloat(line.qty) || 0 : (line.qty ?? 0);
    const price = typeof line.price === 'string' ? parseFloat(line.price) || 0 : (line.price ?? 0);
    return acc + qty * price;
  }, 0);

  /* Split attachments: manual doc entries vs file uploads */
  const docEntries = attachments.filter((a) => !a.message_id && (a.number || a.doc_type));

  /* ────────────── Edit Mode Handlers ── */
  function startEdit() {
    if (!order) return;
    setEditCustomerName(order.customer_name ?? '');
    setEditCustomerId(order.customer_id ?? null);
    setEditDeliverDate(formatDateInput(order.deliver_at));
    setEditOrderDate(formatDateInput(order.order_date));
    setEditSales(order.sales ?? order.sales_rep ?? '');
    setEditContact(order.customer_contact ?? '');

    setEditLines(
      lines.map((l) => ({
        id: l.id,
        productId: l.product_id ?? null,
        name: l.name,
        qty: String(parseFloat(String(l.qty ?? 1)) || 1),
        unit: l.unit ?? 'Loaf',
        price: String(parseFloat(String(l.price ?? 0)) || 0),
        cuts: (lineCutsByLine[l.id] ?? []).map((c) => ({ id: c.id, text: c.text })),
      }))
    );

    setIsEditing(true);
  }



  function handleDeleteEditLine(lineId: string) {
    setEditLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  function handleAddCutToLine(lineId: string) {
    setEditLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: [...l.cuts, { id: 'cut_' + Date.now(), text: '' }] }
          : l
      )
    );
  }

  function handleDeleteCutFromLine(lineId: string, cutId: string) {
    setEditLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: l.cuts.filter((c) => c.id !== cutId) }
          : l
      )
    );
  }

  function buildEditSummary(): string {
    const changes: string[] = [];

    if ((order?.customer_name ?? '').trim() !== editCustomerName.trim()) {
      changes.push(`Customer ${order?.customer_name || '—'}→${editCustomerName || '—'}`);
    }
    if ((order?.sales ?? order?.sales_rep ?? '').trim() !== editSales.trim()) {
      changes.push(`Sales ${order?.sales ?? order?.sales_rep ?? '—'}→${editSales || '—'}`);
    }
    if ((order?.customer_contact ?? '').trim() !== editContact.trim()) {
      changes.push(`Contact ${order?.customer_contact || '—'}→${editContact || '—'}`);
    }
    const beforeDeliver = formatDateInput(order?.deliver_at);
    if (beforeDeliver !== editDeliverDate) changes.push(`Delivery date ${beforeDeliver || '—'}→${editDeliverDate || '—'}`);
    const beforeOrderDate = formatDateInput(order?.order_date);
    if (beforeOrderDate !== editOrderDate) changes.push(`Order date ${beforeOrderDate || '—'}→${editOrderDate || '—'}`);

    const origById = new Map(lines.map((l) => [l.id, l]));
    const editIds = new Set(editLines.filter((l) => !l.isNew).map((l) => l.id));
    lines.forEach((l) => {
      if (!editIds.has(l.id)) changes.push(`Removed ${l.name}`);
    });

    editLines.forEach((el) => {
      if (el.isNew) {
        changes.push(`Added ${el.name} — ${el.qty} ${el.unit}`);
        return;
      }
      const orig = origById.get(el.id);
      if (!orig) return;
      const origQty = String(parseFloat(String(orig.qty ?? 1)) || 1);
      const origPrice = String(parseFloat(String(orig.price ?? 0)) || 0);
      const origUnit = orig.unit ?? 'Loaf';

      if (orig.name !== el.name) changes.push(`${orig.name} name→${el.name}`);
      if (origQty !== el.qty) changes.push(`${el.name} qty ${origQty}→${el.qty}`);
      if (origUnit !== el.unit) changes.push(`${el.name} unit ${origUnit}→${el.unit}`);
      if (origPrice !== el.price) changes.push(`${el.name} price ${origPrice}→${el.price}`);

      const origCutTexts = (lineCutsByLine[el.id] ?? []).map((c) => c.text).join(', ');
      const editCutTexts = el.cuts.map((c) => c.text).filter(Boolean).join(', ');
      if (origCutTexts !== editCutTexts) {
        changes.push(`${el.name} cutting ${origCutTexts || '—'}→${editCutTexts || '—'}`);
      }
    });

    return changes.length === 0 ? 'Order edited (no change)' : `Edited — ${changes.join('; ')}`;
  }

  async function handleSaveAllEdits() {
    if (!id || savingEdits) return;
    const editSummary = buildEditSummary();
    setSavingEdits(true);

    try {
      // 0. Pre-flight: verify the session is still alive before any writes.
      //    Do NOT call refreshToken() here — the SDK's authentication('json')
      //    composable auto-manages token refresh. Manually calling refresh()
      //    with an invalid/expired refresh token causes the SDK to wipe its
      //    internal access token, which breaks all subsequent requests (500s).
      //    A simple readMe() probe is sufficient: if it succeeds, the access
      //    token is valid; if it fails, we surface the re-login message.
      const authCheck = await readMe();
      if (authCheck.error !== null) {
        window.alert(
          'Your session has expired. Please log in again to save changes.'
        );
        setSavingEdits(false);
        return;
      }

      const errors: string[] = [];

      // 1. Update Order Header
      const headerPatch: Record<string, unknown> = {
        customer_name: editCustomerName,
        customer_id: editCustomerId,
        sales: editSales,
        customer_contact: editContact,
      };
      if (editDeliverDate) headerPatch.deliver_at = new Date(editDeliverDate).toISOString();
      if (editOrderDate) headerPatch.order_date = new Date(editOrderDate).toISOString();

      const orderRes = await updateOrder(id, headerPatch);
      if (orderRes.error) {
        errors.push(`Order header: ${orderRes.error}`);
      } else if (orderRes.data) {
        setOrder(orderRes.data);
      }

      // 2. Process Lines: Delete removed lines, Update modified lines, Create new lines
      const existingIdsInEdit = new Set(editLines.filter((l) => !l.isNew).map((l) => l.id));
      const deletedLineIds = lines.filter((l) => !existingIdsInEdit.has(l.id)).map((l) => l.id);

      for (const dId of deletedLineIds) {
        const delRes = await deleteOrderLine(dId);
        if (delRes.error) errors.push(`Delete line ${dId}: ${delRes.error}`);
      }

      for (let i = 0; i < editLines.length; i++) {
        const el = editLines[i]!;
        const matchedProd = products.find((p) => p.name === el.name || p.id === el.productId);
        const isUuidStr = (v: string | null | undefined) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        const resolvedProdId = isUuidStr(el.productId) ? el.productId : (matchedProd && isUuidStr(matchedProd.id) ? matchedProd.id : null);
        let savedLineId: string | null = null;

        if (el.isNew) {
          const createRes = await createOrderLine({
            order_id: id,
            product_id: resolvedProdId,
            name: el.name,
            qty: parseFloat(el.qty) || 1,
            unit: el.unit,
            status: resolvedProdId ? 'recognized' : 'unrecognized',
            sort_order: i,
          });
          if (createRes.error) {
            errors.push(`Create line "${el.name}": ${createRes.error}`);
          } else {
            savedLineId = createRes.data?.id ?? null;
          }
        } else {
          const updateRes = await updateOrderLine(el.id, {
            name: el.name,
            product_id: resolvedProdId,
            qty: parseFloat(el.qty) || 0,
            unit: el.unit,
            price: parseFloat(el.price) || null,
            sort_order: i,
          });
          if (updateRes.error) {
            errors.push(`Update line "${el.name}": ${updateRes.error}`);
          } else {
            savedLineId = el.id;
          }
        }
        if (savedLineId) {
          const original = el.isNew ? [] : (lineCutsByLine[el.id] ?? []);
          const existingEditCuts = el.cuts.filter((c) => !c.id.startsWith('cut_'));
          const newEditCuts = el.cuts.filter((c) => c.id.startsWith('cut_'));

          const deleted = original.filter((oc) => !existingEditCuts.some((ec) => ec.id === oc.id));
          const updated = existingEditCuts.filter((ec) => {
            const oc = original.find((o) => o.id === ec.id);
            return oc && oc.text !== ec.text;
          });

          for (const d of deleted) {
            const r = await deleteLineCut(d.id);
            if (r.error) errors.push(`Delete cut "${d.text}": ${r.error}`);
          }
          for (const u of updated) {
            const r = await updateLineCut(u.id, { text: u.text });
            if (r.error) errors.push(`Update cut "${u.text}": ${r.error}`);
          }
          for (let ci = 0; ci < newEditCuts.length; ci++) {
            const nc = newEditCuts[ci]!;
            if (!nc.text.trim()) continue;
            const r = await createLineCut({ line_id: savedLineId, text: nc.text, sort_order: ci });
            if (r.error) errors.push(`Add cut "${nc.text}": ${r.error}`);
          }
        }
      }

      // Surface any write errors before continuing
      if (errors.length > 0) {
        window.alert(
          `Some changes could not be saved:\n\n${errors.join('\n')}`
        );
        // Still reload so any partial saves are reflected
      }

      // 3. Reload fresh lines to reflect what's actually in the DB
      const reloadedLines = await readOrderLines({ filter: { order_id: { _eq: id } } });
      if (reloadedLines.data) {
        setLines(reloadedLines.data);
        const cutsRes = await readLineCuts(reloadedLines.data.map((l) => l.id));
        const grouped: Record<string, LineCutsCollection[]> = {};
        (cutsRes.data ?? []).forEach((c) => { (grouped[c.line_id] ??= []).push(c); });
        setLineCutsByLine(grouped);
      }

      // 4. Append Audit History (only if at least the header or some lines saved)
      if (errors.length === 0) {
        await appendOrderHistory({
          order_id: id,
          what: editSummary,
          who: userId,
          stage,
        });
      }

      if (errors.length === 0 && editSummary !== 'Order edited (no change)') {
        await appendOrderHistory({
          order_id: id,
          what: editSummary,
          who: userId,
          stage,
        });
      }

      const hRes = await readOrderHistory(id);
      if (hRes.data) setHistory(hRes.data);

      // Only exit edit mode if everything saved cleanly
      if (errors.length === 0) {
        setIsEditing(false);
      }
    } catch (err) {
      window.alert(`Failed to save edits: ${err}`);
    } finally {
      setSavingEdits(false);
    }

  }

  /* ────────────── Weighing & Item Photo Handlers ── */
  function handleAddWeighing(lineId: string) {
    setWeighingsMap((prev) => {
      const current = prev[lineId] ?? [];
      return {
        ...prev,
        [lineId]: [
          ...current,
          { id: 'w_' + Date.now(), weight: '0.00', photoId: null },
        ],
      };
    });
  }

  function handleRemoveWeighing(lineId: string, wId: string) {
    setWeighingsMap((prev) => {
      const current = prev[lineId] ?? [];
      return {
        ...prev,
        [lineId]: current.filter((w) => w.id !== wId),
      };
    });
  }

  function handleUpdateWeighingWeight(lineId: string, wId: string, val: string) {
    setWeighingsMap((prev) => {
      const current = prev[lineId] ?? [];
      return {
        ...prev,
        [lineId]: current.map((w) => (w.id === wId ? { ...w, weight: val } : w)),
      };
    });
  }

  function parseFreeTextLine(
    text: string,
    productsList: ProductsCollection[]
  ): { qty: string; unit: string; name: string; productId: string | null } {
    const trimmed = text.trim();
    if (!trimmed) return { qty: '1', unit: 'Loaf', name: '', productId: null };

    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s*(.*)$/);
    let qty = '1';
    let unit = 'pcs';
    let searchName = trimmed;

    if (match) {
      qty = match[1] || '1';
      const unitCandidate = (match[2] || '').toLowerCase();
      const rest = (match[3] || '').trim();

      const unitMap: Record<string, string> = {
        kg: 'kg', kilo: 'kg', kilos: 'kg',
        gram: 'gram', g: 'gram', gr: 'gram',
        loaf: 'Loaf', loaves: 'Loaf',
        box: 'Box', boxes: 'Box',
        pack: 'Pack', packs: 'Pack',
        pcs: 'pcs', pc: 'pcs', ekor: 'ekor',
      };

      if (unitMap[unitCandidate]) {
        unit = unitMap[unitCandidate];
        searchName = rest || searchName;
      } else if (rest) {
        searchName = `${unitCandidate} ${rest}`.trim();
      }
    }

    let matchedProduct: ProductsCollection | undefined;
    if (searchName) {
      const sLower = searchName.toLowerCase();
      matchedProduct = productsList.find((p) => p.name.toLowerCase() === sLower);
      if (!matchedProduct) {
        matchedProduct = productsList.find((p) => p.name.toLowerCase().includes(sLower) || sLower.includes(p.name.toLowerCase()));
      }
      if (!matchedProduct) {
        const words = sLower.split(/\s+/).filter(Boolean);
        matchedProduct = productsList.find((p) => words.every((w) => p.name.toLowerCase().includes(w)));
      }
    }

    return {
      qty,
      unit,
      name: matchedProduct ? matchedProduct.name : (searchName || trimmed),
      productId: matchedProduct ? matchedProduct.id : null,
    };
  }

  function handleMatchItem() {
    if (!addItemText.trim()) return;
    const res = parseFreeTextLine(addItemText, products);
    setMatchedItem(res);
  }

  function handleConfirmAddMatchedItem() {
    if (!matchedItem) return;
    const newLine: EditableLine = {
      id: 'new_' + Date.now(),
      isNew: true,
      productId: matchedItem.productId,
      name: matchedItem.name || 'New Item',
      qty: matchedItem.qty || '1',
      unit: matchedItem.unit || 'pcs',
      price: '0',
      cuts: [],
    };
    setEditLines((prev) => [...prev, newLine]);
    closeAddItemModal();
  }

  function closeAddItemModal() {
    setIsAddItemModalOpen(false);
    setAddItemText('');
    setMatchedItem(null);
  }

  async function handleUploadWeighingPhoto(lineId: string, wId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const uploadRes = await uploadFile(file);
    if (!uploadRes.error && uploadRes.data) {
      const photoId = uploadRes.data.id;
      const photoUrl = directusFileUrl(photoId);
      setWeighingsMap((prev) => {
        const current = prev[lineId] ?? [];
        return {
          ...prev,
          [lineId]: current.map((w) => (w.id === wId ? { ...w, photoId, photoUrl } : w)),
        };
      });
      setItemPhotosMap((prev) => {
        const current = prev[lineId] ?? [];
        return {
          ...prev,
          [lineId]: [...current, { id: photoId, url: photoUrl }],
        };
      });
    }
    e.target.value = '';
  }

  async function handleUploadItemPhoto(lineId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const uploadRes = await uploadFile(file);
    if (!uploadRes.error && uploadRes.data) {
      const photoId = uploadRes.data.id;
      const photoUrl = directusFileUrl(photoId);
      setItemPhotosMap((prev) => {
        const current = prev[lineId] ?? [];
        return {
          ...prev,
          [lineId]: [...current, { id: photoId, url: photoUrl }],
        };
      });
    }
    e.target.value = '';
  }

  async function handleRemoveItemPhoto(lineId: string, photoId: string, attachmentId?: number | string) {
    if (attachmentId) {
      await deleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
    setItemPhotosMap((prev) => {
      const current = prev[lineId] ?? [];
      return {
        ...prev,
        [lineId]: current.filter((p) => p.id !== photoId),
      };
    });
    if (activeImageModal?.photoId === photoId) {
      setActiveImageModal(null);
    }
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
    if (docFileInputRef.current) docFileInputRef.current.value = '';
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
      setDocNumber('');
      setDocNote('');
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
    if (!window.confirm('Delete this document?')) return;
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
    if (!id || !window.confirm('Cancel this order? This can be undone via Restore.')) return;
    setCancelling(true);
    const res = await updateOrder(id, {
      cancelled: true,
      stage: 'cancelled',
      cancelled_from: stage,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({ order_id: id, what: 'Order cancelled', who: userId, stage: 'cancelled' });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      window.alert(`Failed to cancel order: ${res.error}`);
    }
    setCancelling(false);
  }

  async function handleHold() {
    if (!id) return;
    const res = await updateOrder(id, { stage: 'outstanding' });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({ order_id: id, what: 'Order put on hold (outstanding)', who: userId, stage: 'outstanding' });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      window.alert(`Failed to hold order: ${res.error}`);
    }
  }

  async function handleRestore() {
    if (!id || !order) return;
    const restoreStage = order.cancelled_from ?? 'intake';
    const res = await updateOrder(id, {
      stage: restoreStage,
      cancelled: false,
      cancelled_from: null,
    });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({ order_id: id, what: `Order restored to ${restoreStage}`, who: userId, stage: restoreStage });
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
      setNoteText('');
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
    const itemsText = lines.map((l) => `• ${l.qty} ${l.unit} ${l.name}`).join('\n');
    const d = order.deliver_at ? new Date(order.deliver_at) : new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const txt = [
      `*Konfirmasi Pesanan #${order.no}*`,
      order.customer_name ?? '',
      `Kirim: ${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
      '',
      itemsText,
      order.notes ? `\nCatatan: ${order.notes}` : null,
      '',
      'Terima kasih 🙏',
      'PT Inti Pangan Perkasa',
    ].filter((x) => x !== null).join('\n');
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    window.alert('WhatsApp order confirmation copied to clipboard.');
  }

  /* ────────────── render ── */

  return (
    <div className={styles.container}>



      {/* ── Main Content & Side Panel Grid ── */}
      <div
        className={[
          styles.layoutGrid,
          isPanelOpen ? styles.layoutGridWithPanel : styles.layoutGridFull,
        ].join(' ')}
      >

        {/* ── Main Column ── */}
        <div className={styles.mainColumn}>
          {/* ── Top Header ── */}
          <header className={styles.header}>
            <div className={styles.titleSection}>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => navigate(-1)}
              >
                <Icon name="chevronLeft" size={16} /> Back
              </Button>

              <div className={styles.titleRow}>
                <h3 className={styles.title}>Order {order.no}</h3>
                {isCancelled && (
                  <span style={{ color: 'var(--state-error)', fontSize: '0.8rem', fontWeight: 600 }}>
                    CANCELLED
                  </span>
                )}
                {isOutstanding && (
                  <span style={{ color: 'var(--state-warning)', fontSize: '0.8rem', fontWeight: 600 }}>
                    ON HOLD
                  </span>
                )}
              </div>
            </div>
            <div className={styles.actions}>
              {!isEditing && (
                <>
                  <Button type="button" variant="secondary" onClick={copyWA}>
                    <Icon name="whatsapp" size={16} /> Copy WA
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => window.print()}>
                    <Icon name="printer" size={16} /> Print
                  </Button>
                </>
              )}

              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSaveAllEdits}
                    disabled={savingEdits || !hasEditChanges}
                  >
                    <Icon name="save" size={16} /> {savingEdits ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsEditing(false)}
                    disabled={savingEdits}
                  >
                    <Icon name="close" size={16} /> Cancel
                  </Button>
                </>
              ) : (
                canEdit && (
                  <Button type="button" variant="secondary" onClick={startEdit}>
                    <Icon name="edit" size={16} /> Edit
                  </Button>
                )
              )}
            </div>
          </header>

          {/* Stepper (hidden in Edit mode) */}

          {!isEditing && (
            <div
              className={styles.stepperContainer}
              style={{ '--completed-pct': completedPct } as React.CSSProperties}>
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
                            idx === 0 ? styles.stepLineInvisible : '',
                            currentStageIndex >= idx ? styles.stepLineCompleted : '',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            styles.stepDot,
                            isActive ? styles.stepDotActive : '',
                            isCompleted ? styles.stepDotCompleted : '',
                          ].join(' ')}
                        />
                        <div
                          className={[
                            styles.stepLine,
                            idx === PIPELINE_STAGES.length - 1 ? styles.stepLineInvisible : '',
                            currentStageIndex > idx ? styles.stepLineCompleted : '',
                          ].join(' ')}
                        />
                      </div>
                      <span
                        className={[
                          styles.stepLabel,
                          isActive ? styles.stepLabelActive : '',
                          isCompleted ? styles.stepLabelCompleted : '',
                        ].join(' ')}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer Info Card */}
          <Card className={styles.customerCard}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div>
                  <label className={styles.detailLabel}>Customer Name</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    list="customers-list"
                    value={editCustomerName}
                    onChange={(e) => {
                      setEditCustomerName(e.target.value);
                      const matched = customers.find((c) => c.name === e.target.value);
                      if (matched) setEditCustomerId(matched.id);
                    }}
                  />
                  <datalist id="customers-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <label className={styles.detailLabel}>Delivery Date</label>
                    <input
                      type="date"
                      className={styles.editInput}
                      value={editDeliverDate}
                      onChange={(e) => setEditDeliverDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.detailItem}>
                    <label className={styles.detailLabel}>Order Date</label>
                    <input
                      type="date"
                      className={styles.editInput}
                      value={editOrderDate}
                      onChange={(e) => setEditOrderDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.detailItem}>
                    <label className={styles.detailLabel}>Sales Rep</label>
                    <input
                      type="text"
                      className={styles.editInput}
                      value={editSales}
                      onChange={(e) => setEditSales(e.target.value)}
                    />
                  </div>
                  <div className={styles.detailItem}>
                    <label className={styles.detailLabel}>Contact</label>
                    <input
                      type="text"
                      className={styles.editInput}
                      value={editContact}
                      onChange={(e) => setEditContact(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={[
                    styles.profileRow,
                    customerId ? styles.profileRowClickable : '',
                  ].join(' ')}
                  onClick={() => {
                    if (customerId) navigate(`/customers/${customerId}`);
                  }}
                  title={customerId ? 'View customer details' : undefined}
                >
                  <div className={styles.avatar}>
                    {(order.customer_name ?? 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.customerInfo}>
                    <h3>{order.customer_name || '—'}</h3>
                    <p>{matchedCustomer?.channel || 'Horeca · B2B'}</p>
                  </div>
                </div>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Delivery Date</span>
                    <span className={styles.detailValue}>{formatDate(order.deliver_at)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Order Date</span>
                    <span className={styles.detailValue}>
                      {order.order_date
                        ? new Date(order.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Sales Rep</span>
                    <span className={styles.detailValue}>{order.sales ?? order.sales_rep ?? '—'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Contact</span>
                    <span className={styles.detailValue}>{order.customer_contact ?? '—'}</span>
                  </div>
                  {order.customer_address && (
                    <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                      <span className={styles.detailLabel}>Address</span>
                      <span className={styles.detailValue}>{order.customer_address}</span>
                    </div>
                  )}
                  {order.notes && (
                    <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                      <span className={styles.detailLabel}>Order Note</span>
                      <span className={styles.detailValue}>{order.notes}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Items Card */}
          <Card>
            <div className={styles.heading}>
              Items <span className={styles.count}>{(isEditing ? editLines : lines).length}</span>
            </div>

            {isEditing ? (
              /* Edit Mode Items List */
              <div className={styles.itemsList}>
                {editLines.map((line) => (
                  <div key={line.id} className={styles.itemRow}>
                    <div className={styles.editItemHeader}>
                      <input
                        type="number"
                        className={styles.editInput}
                        style={{
                          width: 80,
                          textAlign: 'right'
                        }}
                        value={line.qty}
                        min="1"
                        onChange={(e) => {
                          const qVal = e.target.value;
                          setEditLines((prev) =>
                            prev.map((l) => (l.id === line.id ? { ...l, qty: qVal } : l))
                          );
                        }}
                      />
                      <select
                        className={styles.editSelect}
                        style={{
                          width: 90,
                        }}
                        value={line.unit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditLines((prev) =>
                            prev.map((l) => (l.id === line.id ? { ...l, unit: val } : l))
                          );
                        }}
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className={styles.editInput}
                        style={{ flex: 1 }}
                        list="products-catalog-list"
                        value={line.name}
                        onChange={(e) => {
                          const nameVal = e.target.value;
                          const matchedProd = products.find((p) => p.name === nameVal);
                          setEditLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id
                                ? { ...l, name: nameVal, productId: matchedProd ? matchedProd.id : l.productId }
                                : l
                            )
                          );
                        }}
                      />
                      <datalist id="products-catalog-list">
                        {products.map((p) => (
                          <option key={p.id} value={p.name} />
                        ))}
                      </datalist>

                      <Button
                        type="button"
                        variant="tertiary"
                        size="md"
                        onClick={() => handleDeleteEditLine(line.id)}
                      >
                        <Icon name="trash" size={14} /> Delete item
                      </Button>
                    </div>

                    {/* Cutting instructions list in Edit Mode */}
                    <div style={{ marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {line.cuts.map((cut) => (
                        <div key={cut.id} className={styles.editCutRow}>
                          <Icon name="knife" size={14} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}>cutting</span>
                          <input
                            type="text"
                            className={styles.editInput}
                            style={{ flex: 1, maxWidth: 220 }}
                            value={cut.text}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id
                                    ? {
                                      ...l,
                                      cuts: l.cuts.map((c) => (c.id === cut.id ? { ...c, text: val } : c)),
                                    }
                                    : l
                                )
                              );
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            iconOnly
                            onClick={() => handleDeleteCutFromLine(line.id, cut.id)}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => handleAddCutToLine(line.id)}
                      >
                        <Icon name="add" size={14} />Add cutting
                      </Button>
                    </div>

                    {/* Price & Qty Row */}
                    <div className={styles.itemTotalRow}>
                      <span>Total:</span>
                      <div className={styles.priceCalc}>
                        <input
                          className={styles.editInput}
                          style={{ width: 110, textAlign: 'right' }}
                          value={line.price}
                          placeholder="0"
                          onChange={(e) => {
                            const pVal = e.target.value;
                            setEditLines((prev) =>
                              prev.map((l) => (l.id === line.id ? { ...l, price: pVal } : l))
                            );
                          }}
                        />
                        <span style={{
                          textAlign: 'left',
                          width: 'auto',
                        }}>x {line.qty}</span>
                        <span className={styles.lineTotalPrice}>
                          {currency.format((parseFloat(line.price) || 0) * (parseFloat(line.qty) || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="primary"
                  buttonStyle="fullWidth"
                  onClick={() => setIsAddItemModalOpen(true)}
                  style={{ marginTop: 'var(--space-md)', height: 44, fontWeight: 600 }}
                >
                  <Icon name="add" size={16} /> Add Item
                </Button>
              </div>
            ) : (
              /* View Mode Items List */
              <div className={styles.itemsList}>
                {lines.map((line) => {
                  const qty = typeof line.qty === 'string' ? parseFloat(line.qty) || 0 : (line.qty ?? 0);
                  const price = typeof line.price === 'string' ? parseFloat(line.price) || 0 : (line.price ?? 0);
                  const isWeighedItem = line.unit === 'Loaf' || line.unit === 'kg' || line.unit === 'gram';

                  const weighingLines = line.id ? (weighingsMap[line.id] ?? []) : [];
                  const totalMeasuredWeight = weighingLines.reduce(
                    (acc, w) => acc + (parseFloat(w.weight) || 0),
                    0
                  );
                  const itemPhotos = line.id ? (itemPhotosMap[line.id] ?? []) : [];
                  const sendingQty = line.id ? (sendingQtyMap[line.id] ?? qty) : qty;

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
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              if (line.id) setSendingQtyMap((prev) => ({ ...prev, [line.id!]: val }));
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
                                value={w.weight}
                                onChange={(e) => handleUpdateWeighingWeight(line.id, w.id, e.target.value)}
                              />
                              <span className={styles.unitText}>kg</span>

                              <label style={{ display: 'inline-flex', cursor: 'pointer' }}>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  iconOnly
                                  title="Upload scale photo"
                                  onClick={(e) => {
                                    const inputElem = (e.currentTarget as HTMLElement).nextElementSibling as HTMLInputElement;
                                    inputElem?.click();
                                  }}
                                >
                                  <Icon name="camera" size={16} />
                                </Button>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) => handleUploadWeighingPhoto(line.id, w.id, e)}
                                />
                              </label>

                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                iconOnly
                                title="Remove weighing"
                                onClick={() => handleRemoveWeighing(line.id, w.id)}
                              >
                                <Icon name="trash" size={14} />
                              </Button>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="tertiary"
                            size="sm"
                            style={{ alignSelf: 'flex-start' }}
                            onClick={() => handleAddWeighing(line.id)}
                          >
                            <Icon name="add" size={14} />Add weighing
                          </Button>

                          {/* Cutting instruction */}
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
                        </div>
                      )}

                      {/* For Non-weighed Items (Box, Pack, pcs, etc.) */}
                      {!isWeighedItem && (
                        <div style={{ marginTop: 6, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ display: 'inline-flex', cursor: 'pointer' }}>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              iconOnly
                              title="Upload item photo"
                              onClick={(e) => {
                                const inputElem = (e.currentTarget as HTMLElement).nextElementSibling as HTMLInputElement;
                                inputElem?.click();
                              }}
                            >
                              <Icon name="camera" size={16} />
                            </Button>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => handleUploadItemPhoto(line.id, e)}
                            />
                          </label>
                        </div>
                      )}
                      {itemPhotos.length > 0 && (
                        <div className={styles.thumbnailsContainer} style={{ marginLeft: 28 }}>
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
                                  attachmentId: img.attachmentId,
                                })
                              }
                            >
                              <img src={img.url} alt="thumbnail" className={styles.thumbnailImg} />
                              <div
                                className={styles.thumbnailHoverTrash}
                                title="Delete image"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveItemPhoto(line.id, img.id, img.attachmentId);
                                }}
                              >
                                <Icon name="trash" size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Item Summary line */}
                      <div className={styles.itemTotalRow}>
                        <span className={styles.totalWeight}>
                          Total: {isWeighedItem ? `${totalMeasuredWeight.toFixed(2)} kg` : ''}
                        </span>
                        <div className={styles.priceCalc}>
                          <span>{currency.format(price)} x {qty}</span>
                          <span className={styles.lineTotalPrice}>
                            {currency.format(price * qty)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.totalRow}>
              <span>Order value · from PO</span>
              <span className={styles.totalValue}>{currency.format(orderTotal)}</span>
            </div>
          </Card>

          {/* Documents Section (hidden in Edit mode) */}
          {!isEditing && (
            <Card>
              <div className={styles.heading}>
                Documents <span className={styles.count}>{docEntries.length}</span>
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
                          <span className={styles.docType}>{doc.doc_type}</span>
                          <span className={styles.docNumber}>{doc.number ?? '—'}</span>

                          {fileId && (
                            <div
                              className={styles.thumbnailItem}
                              style={{ width: 36, height: 36 }}
                              onClick={() =>
                                setActiveImageModal({
                                  url: directusFileUrl(fileId),
                                  title: `${doc.doc_type} ${doc.number ?? ''}`,
                                  attachmentId: doc.id ?? undefined,
                                })
                              }
                            >
                              <img src={directusFileUrl(fileId)} alt="doc" className={styles.thumbnailImg} />
                            </div>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            iconOnly
                            title="Delete document"
                            onClick={() => doc.id != null && handleDeleteDocument(doc.id)}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        </div>

                        {doc.note && <div className={styles.docNote}>{doc.note}</div>}
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
                      style={{ maxWidth: '100px' }}
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                    >
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
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
                      style={{ display: 'none' }}
                      accept="image/*,application/pdf"
                      onChange={handleDocFileUpload}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      isActive={!!docFileName}
                      onClick={() => docFileInputRef.current?.click()}
                    >
                      <Icon name={docFileName ? 'paperclip' : 'add'} size={16} />
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={savingDoc || !docNumber.trim()}
                    >
                      {savingDoc ? '…' : '+ Add'}
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
          )}

          {/* Stage Action Controls (hidden in Edit mode) */}
          {!isEditing && !isCancelled && (
            <div className={styles.stageActions}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {flow?.next && canAdvance && (
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={handleAdvance}
                    disabled={advancing}
                    className={styles.actionBtn}
                  >
                    {advancing ? 'Saving…' : flow.advanceLabel}
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
                    {flow.sendBackLabel ?? 'Send Back'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Order Actions (Hold / Cancel / Restore - hidden in Edit mode) */}
          {!isEditing && (canCancel || canHold || canRestore) && (
            <div className={styles.orderActions}>
              {canRestore && (
                <Button type="button" variant="secondary" size="lg" onClick={handleRestore}>
                  <Icon name="refresh" size={16} /> Restore Order
                </Button>
              )}
              {canHold && !isOutstanding && (
                <Button type="button" variant="secondary" size="lg" onClick={handleHold}>
                  <Icon name="pause" size={16} /> Put on Hold
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  <Icon name="cancel" size={16} /> {cancelling ? 'Cancelling…' : 'Cancel Order'}
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
            iconOnly
            className={styles.panelToggleBtn}
            isActive={isPanelOpen}
            onClick={() => setIsPanelOpen((prev) => !prev)}
            title={isPanelOpen ? 'Collapse side panel' : 'Expand side panel'}
          >
            <Icon name={isPanelOpen ? 'chevronRight' : 'chevronLeft'} size={16} />
          </Button>

          <div
            className={[
              styles.sidePanelStickyContent,
              !isPanelOpen ? styles.sidePanelStickyContentCollapsed : '',
            ].join(' ')}
          >
            {/* Notes Card */}
            <Card className={styles.notesCard}>
              <h3 className={styles.heading}>Notes</h3>
              <div className={styles.notesListScroll}>
                {history
                  .filter((h) => h.what.startsWith('Note:'))
                  .reverse()
                  .map((n, idx) => (
                    <div key={n.id ?? idx} className={styles.noteItem}>
                      <div className={styles.noteHeader}>
                        <span style={{ fontWeight: '600' }}>{n.who ? `${displayName(n.who)}` : ''}</span>
                        <span>{formatDate(n.at, true)}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.what.replace('Note:', '').trim()}</div>
                    </div>
                  ))}
              </div>
              <form className={styles.noteFormFixed} onSubmit={handleAddNote}>
                <textarea
                  className={styles.noteInput}
                  placeholder="Add note for the team..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitNote();
                    }
                  }}
                  disabled={savingNote}
                  rows={2}
                  style={{ resize: 'vertical', fontFamily: 'inherit', minHeight: 38 }}
                />
                <Button type="submit" variant="primary" disabled={savingNote || !noteText.trim()}>
                  <Icon name="add" size={16} />Add
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
                {history.slice().reverse().map((h, i) => (
                  <div key={h.id ?? i} className={styles.historyItem}>
                    <span className={styles.historyTime}>
                      {formatDate(h.at, true)}
                      <span style={{ fontWeight: '600' }}>{h.who ? ` ${displayName(h.who)}` : ''}
                      </span>
                    </span>
                    <span className={styles.historyContent}>
                      {h.what}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        </aside>

      </div>

      {/* ── Image Details Modal Overlay ── */}
      {activeImageModal && (
        <div className={styles.modalBackdrop} onClick={() => setActiveImageModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>{activeImageModal.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={() => setActiveImageModal(null)}
              >
                <Icon name="close" size={16} />
              </Button>
            </div>
            <div className={styles.modalBody}>
              <img
                src={activeImageModal.url}
                alt="Detail preview"
                className={styles.modalImage}
              />
            </div>
            <div className={styles.modalFooter}>
              <Button
                type="button"
                variant="secondary"
                style={{ color: 'var(--state-error)' }}
                onClick={() => {
                  if (activeImageModal.lineId && activeImageModal.photoId) {
                    handleRemoveItemPhoto(
                      activeImageModal.lineId,
                      activeImageModal.photoId,
                      activeImageModal.attachmentId
                    );
                  } else if (activeImageModal.attachmentId) {
                    handleDeleteDocument(activeImageModal.attachmentId);
                    setActiveImageModal(null);
                  }
                }}
              >
                <Icon name="trash" size={16} /> Delete Image
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActiveImageModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Add Item Modal ── */}
      {isAddItemModalOpen && (
        <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) closeAddItemModal(); }}>
          <div className={styles.addItemModalCard}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Add new item</span>
              <Button type="button" variant="tertiary" iconOnly size="sm" onClick={closeAddItemModal}>
                <Icon name="close" size={18} />
              </Button>
            </div>

            {/* Step 1: Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ font: 'var(--text-body)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Type or paste the item here:
              </label>
              <textarea
                className={styles.addItemTextarea}
                placeholder={'e.g. "2 kg short rib" or "1 Box Wagyu Striploin"'}
                value={addItemText}
                onChange={(e) => {
                  setAddItemText(e.target.value);
                  if (matchedItem) setMatchedItem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && addItemText.trim()) {
                    e.preventDefault();
                    handleMatchItem();
                  }
                }}
                autoFocus
              />
              <Button
                type="button"
                variant="primary"
                buttonStyle="fullWidth"
                disabled={!addItemText.trim()}
                onClick={handleMatchItem}
                style={{ height: 42, fontWeight: 600, gap: 6 }}
              >
                ✨ Match
              </Button>
            </div>

            {/* Step 2: Matched Result */}
            {matchedItem && (
              <>
                <hr className={styles.matchDivider} />
                <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>
                  Matched result — review and adjust:
                </div>
                <div className={styles.matchedResultRow}>
                  {/* Qty */}
                  <input
                    type="number"
                    className={styles.editInput}
                    style={{ width: 70, textAlign: 'center', flexShrink: 0 }}
                    value={matchedItem.qty}
                    min="0"
                    step="0.5"
                    onChange={(e) => setMatchedItem((prev) => prev ? { ...prev, qty: e.target.value } : prev)}
                  />

                  {/* Unit */}
                  <select
                    className={styles.editSelect}
                    style={{ width: 90, flexShrink: 0 }}
                    value={matchedItem.unit}
                    onChange={(e) => setMatchedItem((prev) => prev ? { ...prev, unit: e.target.value } : prev)}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>

                  {/* Product from catalog */}
                  <select
                    className={styles.editSelect}
                    style={{ flex: 1, minWidth: 0 }}
                    value={matchedItem.productId ?? '__custom__'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__custom__') {
                        setMatchedItem((prev) => prev ? { ...prev, productId: null } : prev);
                      } else {
                        const prod = products.find((p) => p.id === val);
                        setMatchedItem((prev) => prev
                          ? { ...prev, productId: val, name: prod?.name ?? prev.name }
                          : prev
                        );
                      }
                    }}
                  >
                    <option value="__custom__">— No match (custom) —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* If no catalog match, let user set a custom name */}
                {!matchedItem.productId && (
                  <input
                    type="text"
                    className={styles.editInput}
                    placeholder="Item name (custom)"
                    value={matchedItem.name}
                    onChange={(e) => setMatchedItem((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                  />
                )}

                <div className={styles.modalActionsRow}>
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="fullWidth"
                    onClick={closeAddItemModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    buttonStyle="fullWidth"
                    onClick={handleConfirmAddMatchedItem}
                    disabled={!matchedItem.name.trim()}
                    style={{ fontWeight: 600 }}
                  >
                    Add to order
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}