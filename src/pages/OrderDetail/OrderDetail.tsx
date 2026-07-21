import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { Button } from '../../components/Button/Button';
import { useAuth, useCurrentUserName, useCurrentUserId } from '../../hooks/useAuth';
import {
  readOrder,
  readOrderLines,
  readOrderHistory,
  readAttachments,
  appendOrderHistory,
  updateOrder,
  updateOrderLine,
  createAttachment,
  uploadFile,
} from '../../lib/directus';
import type {
  OrdersCollection,
  OrderLinesCollection,
  OrderHistoryCollection,
  AttachmentsCollection,
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

/**
 * For each stage: which capability gates the "Advance" button, and what stage
 * does advancing lead to. Finance is a parallel gate — it sets
 * payment_confirmed instead of changing stage directly.
 */
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

/* ─────────────────────────────────────── component ── */

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const userName = useCurrentUserName();
  const userId = useCurrentUserId();

  /* ── data state ── */
  const [order, setOrder] = useState<OrdersCollection | null>(null);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);
  const [history, setHistory] = useState<OrderHistoryCollection[]>([]);
  const [attachments, setAttachments] = useState<AttachmentsCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── action state ── */
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  /* ── document log form ── */
  const [docType, setDocType] = useState<string>('DO');
  const [docNumber, setDocNumber] = useState('');
  const [docNote, setDocNote] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  /* ── file upload ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /* ── edit state ── */
  const [editingHeader, setEditingHeader] = useState(false);
  const [editDeliver, setEditDeliver] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSales, setEditSales] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLineQty, setEditLineQty] = useState('');
  const [editLineUnit, setEditLineUnit] = useState('');
  const [editLinePrice, setEditLinePrice] = useState('');
  const [savingLine, setSavingLine] = useState(false);

  /* ────────────── load ── */
  useEffect(() => {
    const orderId = id as string;
    if (!orderId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [orderRes, linesRes, historyRes, attachmentsRes] = await Promise.all([
        readOrder(orderId),
        readOrderLines({ filter: { order_id: { _eq: orderId } } }),
        readOrderHistory(orderId),
        readAttachments(orderId),
      ]);

      if (cancelled) return;

      if (orderRes.error) { setError(`Failed to load order: ${orderRes.error}`); setLoading(false); return; }
      if (linesRes.error) { setError(`Failed to load order lines: ${linesRes.error}`); setLoading(false); return; }

      setOrder(orderRes.data);
      setLines(linesRes.data ?? []);
      setHistory(historyRes.data ?? []);
      setAttachments(attachmentsRes.data ?? []);
      setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [id]);

  /* ────────────── guards ── */
  if (loading) return <div className={styles.muted}>Loading order details…</div>;
  if (error || !order) return (
    <div className={styles.muted} style={{ color: 'var(--status-danger)' }}>
      {error || 'Order not found.'}
    </div>
  );

  /* ────────────── derived ── */
  const stage = order.stage ?? 'intake';
  const flow = STAGE_FLOW[stage];
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  const isCancelled = order.cancelled === true || stage === 'cancelled';
  const isOutstanding = stage === 'outstanding';
  const isDelivered = stage === 'delivered';
  const isReturned = stage === 'returned';

  const canEdit = auth.can('editOrderLines') && !isCancelled && !isDelivered;

  const canAdvance = flow ? auth.can(flow.capability) : false;
  const canSendBack = flow?.prev ? auth.can(flow.capability) : false;
  const canCancel = auth.can('cancelOrders') && !isCancelled && !isDelivered;
  const canHold = auth.can('advanceStage') && !isOutstanding && !isCancelled && !isDelivered;
  const canRestore = (isCancelled || isOutstanding) && auth.can('advanceStage');
  const canAddDocs = auth.can('printDocuments');
  const canUpload = auth.can('uploadDeliveryProof') || auth.can('advanceStage');
  const canApproveFinance = auth.can('approveFinance');

  const orderTotal = lines.reduce((acc, line) => {
    const qty = typeof line.qty === 'string' ? parseFloat(line.qty) : (line.qty ?? 0);
    const price = typeof line.price === 'string' ? parseFloat(line.price) : (line.price ?? 0);
    return acc + qty * price;
  }, 0);



  /* split attachments: manual doc entries vs WhatsApp-sourced files */
  const docEntries = attachments.filter((a) => !a.message_id && (a.number || a.doc_type));
  const fileEntries = attachments.filter((a) => a.document_file || a.file_path);

  /* ────────────── actions ── */

  async function handleSaveHeader(e: React.FormEvent) {
    e.preventDefault();
    if (!id || savingEdit) return;
    setSavingEdit(true);
    const patch: Record<string, unknown> = {};
    if (editDeliver) patch.deliver_at = new Date(editDeliver).toISOString();
    if (editSales) patch.sales = editSales;
    if (editNotes !== undefined) patch.notes = editNotes;

    const res = await updateOrder(id, patch);
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({ order_id: id, what: 'Order details edited', who: userId, stage });
      setEditingHeader(false);
    } else {
      window.alert(`Failed to save: ${res.error}`);
    }
    setSavingEdit(false);
  }

  async function handleSaveLine(lineId: string) {
    if (!id || savingLine) return;
    setSavingLine(true);
    const res = await updateOrderLine(lineId, {
      qty: parseFloat(editLineQty) || 0,
      unit: editLineUnit,
      price: parseFloat(editLinePrice) || null,
    });
    if (!res.error) {
      setLines((prev) => prev.map((l) =>
        l.id === lineId
          ? { ...l, qty: parseFloat(editLineQty), unit: editLineUnit, price: parseFloat(editLinePrice) }
          : l
      ));
      setEditingLineId(null);
      await appendOrderHistory({ order_id: id, what: `Line edited: ${editLineQty} ${editLineUnit}`, who: userId, stage });
    } else {
      window.alert(`Failed to save line: ${res.error}`);
    }
    setSavingLine(false);
  }

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

  async function handleApproveFinance() {
    if (!id || advancing) return;
    setAdvancing(true);
    const res = await updateOrder(id, { payment_confirmed: true });
    if (!res.error && res.data) {
      setOrder(res.data);
      await appendOrderHistory({
        order_id: id,
        what: 'Finance: payment approved',
        who: userId,
        stage,
      });
      const hRes = await readOrderHistory(id);
      if (!hRes.error) setHistory(hRes.data ?? []);
    } else {
      window.alert(`Failed to approve payment: ${res.error}`);
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
    if (!id) return;
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

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
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
      created_by: userId ?? undefined,
    });
    if (!res.error && res.data) {
      setAttachments((prev) => [res.data!, ...prev]);
      setDocNumber('');
      setDocNote('');
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    const uploadRes = await uploadFile(file);
    if (uploadRes.error || !uploadRes.data) {
      window.alert(`Upload failed: ${uploadRes.error}`);
      setUploading(false);
      return;
    }
    const attachRes = await createAttachment({
      order_uuid: id,
      doc_type: 'Other',
      label: file.name,
      document_file: uploadRes.data.id,
      created_by: userId ?? undefined,
    });
    if (!attachRes.error && attachRes.data) {
      setAttachments((prev) => [attachRes.data!, ...prev]);
      await appendOrderHistory({
        order_id: id,
        what: `File uploaded: ${file.name}`,
        who: userId,
        stage,
      });
    } else {
      window.alert(`Failed to save attachment record: ${attachRes.error}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(false);
  }

  async function copyWA() {
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

  const directusFileUrl = (fileId: string) =>
    `${import.meta.env.VITE_DIRECTUS_URL}/assets/${fileId}`;

  return (
    <div className={styles.container}>

      {/* ── header ── */}
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button type="button" variant="tertiary" onClick={() => navigate(-1)}>
            <Icon name="chevronLeft" size={16} /> Back
          </Button>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>Order {order.no}</h3>
            {isCancelled && (
              <span style={{ color: 'var(--status-danger)', fontSize: '0.8rem', fontWeight: 600 }}>
                CANCELLED
              </span>
            )}
            {isOutstanding && (
              <span style={{ color: 'var(--color-warning)', fontSize: '0.8rem', fontWeight: 600 }}>
                ON HOLD
              </span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={copyWA}>
            <Icon name="whatsapp" size={16} /> Copy WA
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Icon name="printer" size={16} /> Print
          </Button>
          {canEdit && (
            <Button type="button" variant="secondary"
              onClick={() => {
                setEditDeliver(order.deliver_at?.slice(0, 10) ?? '');
                setEditNotes(order.notes ?? '');
                setEditSales(order.sales ?? '');
                setEditingHeader(true);
              }}>
              <Icon name="edit" size={16} /> Edit
            </Button>
          )}
        </div>
      </header>

      {/* ── stepper ── */}
      <div className={styles.stepper}>
        <div className={styles.stepperTrack}>
          {PIPELINE_STAGES.map((s, idx) => {
            const isActive = stage === s.key;
            const isCompleted = currentStageIndex > idx;
            return (
              <div
                key={s.key}
                className={[
                  styles.step,
                  isActive ? styles.stepActive : '',
                  isCompleted ? styles.stepCompleted : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={styles.stepDot} />
              </div>
            );
          })}
        </div>
        <div className={styles.stepperLabels}>
          {PIPELINE_STAGES.map((s) => (
            <span key={s.key} className={styles.stepLabel}>{s.label}</span>
          ))}
        </div>
      </div>


      {/* ── customer card ── */}
      <Card className={styles.customerCard}>
        <div className={styles.profileRow}>
          <div className={styles.avatar}>
            {(order.customer_name ?? 'C').charAt(0).toUpperCase()}
          </div>
          <div className={styles.customerInfo}>
            <h3>{order.customer_name || '—'}</h3>
            <p>Horeca · B2B</p>
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
      </Card>

      {/* ── items table ── */}
      <Card>
        <h3 className={styles.heading}>Items</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Item Name</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'left' }}>Unit</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const qty = typeof line.qty === 'string' ? parseFloat(line.qty) : (line.qty ?? 0);
              const price = typeof line.price === 'string' ? parseFloat(line.price) : (line.price ?? 0);
              const isEditingThis = editingLineId === line.id;

              if (isEditingThis) return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input type="number" style={{ width: 60 }} value={editLineQty}
                      onChange={(e) => setEditLineQty(e.target.value)} />
                  </td>
                  <td>
                    <input type="text" style={{ width: 60 }} value={editLineUnit}
                      onChange={(e) => setEditLineUnit(e.target.value)} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input type="number" style={{ width: 100 }} value={editLinePrice}
                      onChange={(e) => setEditLinePrice(e.target.value)} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button type="button" variant="primary" onClick={() => handleSaveLine(line.id!)}
                      disabled={savingLine}>
                      {savingLine ? '…' : 'Save'}
                    </Button>
                    <Button type="button" variant="secondary"
                      onClick={() => setEditingLineId(null)} style={{ marginLeft: 4 }}>
                      ✕
                    </Button>
                  </td>
                </tr>
              );

              return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td style={{ textAlign: 'right' }}>{qty}</td>
                  <td>{line.unit}</td>
                  <td style={{ textAlign: 'right' }}>{currency.format(price)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canEdit ? (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {currency.format(qty * price)}
                        <Icon name="edit" size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                          onClick={() => {
                            setEditingLineId(line.id!);
                            setEditLineQty(String(qty));
                            setEditLineUnit(line.unit ?? '');
                            setEditLinePrice(String(price));
                          }} />
                      </span>
                    ) : currency.format(qty * price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={styles.totalRow}>
          <span>Total Order Value</span>
          <span className={styles.totalValue}>{currency.format(orderTotal)}</span>
        </div>
      </Card>

      {editingHeader && canEdit && (
        <Card>
          <h3 className={styles.heading}>Edit Order</h3>
          <form onSubmit={handleSaveHeader} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className={styles.detailLabel}>Delivery Date</label>
              <input type="date" className={styles.noteInput}
                value={editDeliver} onChange={(e) => setEditDeliver(e.target.value)} />
            </div>
            <div>
              <label className={styles.detailLabel}>Sales Rep</label>
              <input type="text" className={styles.noteInput}
                value={editSales} onChange={(e) => setEditSales(e.target.value)} />
            </div>
            <div>
              <label className={styles.detailLabel}>Notes</label>
              <input type="text" className={styles.noteInput}
                value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="submit" variant="primary" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingHeader(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── stage actions ── */}
      {!isCancelled && !isReturned && (
        <div className={styles.stageActions}>
          {/* Finance parallel gate — shown alongside cold stage */}
          {stage === 'cold' && canApproveFinance && !order.payment_confirmed && (
            <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-warning)' }}>
                ⚠ Finance approval pending
              </span>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleApproveFinance}
                disabled={advancing}
                className={styles.actionBtn}>
                Approve Payment
              </Button>
            </div>
          )}
          {stage === 'cold' && order.payment_confirmed && (
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--status-success)' }}>
              ✓ Payment approved
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Advance button */}
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

            {/* Send back button */}
            {flow?.prev && canSendBack && (
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleSendBack}
                disabled={advancing}
                className={styles.actionBtn}
              >
                {flow.sendBackLabel ?? 'Send Back'}
              </Button>
            )}

            {/* Re-open from delivered */}
            {isDelivered && flow?.prev && canSendBack && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleSendBack}
                disabled={advancing}
                className={styles.actionBtn}>
                {flow.sendBackLabel}
              </Button>
            )}

            {/* No actions available */}
            {!flow?.next && !flow?.prev && !isDelivered && (
              <p className={styles.muted}>No stage actions available for your role at this stage.</p>
            )}
          </div>
        </div>
      )}

      {/* ── order actions (cancel / hold / restore) ── */}
      {(canCancel || canHold || canRestore) && (
        <div className={styles.orderActions}>
          {canRestore && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleRestore}>
              <Icon name="refresh" size={16} /> Restore Order
            </Button>
          )}
          {canHold && !isOutstanding && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleHold}>
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

      {/* ── documents section ── */}
      <Card>
        <h3 className={styles.heading}>Documents</h3>

        {docEntries.length === 0 ? (
          <p className={styles.muted}>No documents logged yet.</p>
        ) : (
          <div className={styles.docList}>
            {docEntries.map((doc) => (
              <div key={doc.id} className={styles.docRow}>
                <span className={styles.docType}>{doc.doc_type}</span>
                <span className={styles.docNumber}>{doc.number ?? '—'}</span>
                {doc.note && <span className={styles.docNote}>{doc.note}</span>}
                <span className={styles.docDate}>{formatDate(doc.created_at, true)}</span>
              </div>
            ))}
          </div>
        )}

        {canAddDocs && (
          <form className={styles.docForm} onSubmit={handleAddDocument}>
            <div className={styles.docFormTop}>
              <select
                className={styles.docSelect}
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                className={styles.docInput}
                placeholder="Document number…"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
              />
            </div>
            <input
              type="text"
              className={styles.docInput}
              placeholder="Note (optional)"
              value={docNote}
              onChange={(e) => setDocNote(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={savingDoc || !docNumber.trim()}
            >
              {savingDoc ? 'Saving…' : 'Add Document'}
            </Button>
          </form>
        )}
      </Card>

      {/* ── attachments / proof photos ── */}
      <Card>
        <h3 className={styles.heading}>Attachments</h3>

        {fileEntries.length === 0 ? (
          <p className={styles.muted}>No files attached yet.</p>
        ) : (
          <div className={styles.attachList}>
            {fileEntries.map((att) => {
              const fileId = att.document_file ?? att.file_path;
              return (
                <div key={att.id} className={styles.attachRow}>
                  {fileId && (
                    <a
                      href={directusFileUrl(fileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.attachLink}
                    >
                      <Icon name="paperclip" size={14} />
                      {att.label ?? att.caption ?? att.doc_type ?? 'File'}
                    </a>
                  )}
                  <span className={styles.docDate}>{formatDate(att.created_at, true)}</span>
                </div>
              );
            })}
          </div>
        )}

        {canUpload && (
          <div style={{ marginTop: '0.75rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Icon name="paperclip" size={16} />
              {uploading ? 'Uploading…' : 'Upload File'}
            </Button>
          </div>
        )}
      </Card>

      {/* ── notes & team comms ── */}
      <Card>
        <h3 className={styles.heading}>Notes &amp; Team Comms</h3>
        <form className={styles.noteForm} onSubmit={handleAddNote}>
          <input
            type="text"
            className={styles.noteInput}
            placeholder="Add note for the team…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            disabled={savingNote}
          />
          <Button type="submit" variant="secondary" disabled={savingNote || !noteText.trim()}>
            Add Note
          </Button>
        </form>
      </Card>

      {/* ── order history ── */}
      <Card>
        <h3 className={styles.heading}>History</h3>
        <div className={styles.historyList}>
          {history.length === 0 && (
            <p className={styles.muted}>No history yet.</p>
          )}
          {history.map((h, i) => (
            <div key={h.id ?? i} className={styles.historyItem}>
              <span className={styles.historyTime}>
                {formatDate(h.at, true)}
              </span>
              <span className={styles.historyContent}>
                {h.what}{h.who ? ` · ${h.who}` : ''}
              </span>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}