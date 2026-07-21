import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '../Icon/Icon';
import { Button } from '../Button/Button';
import { useAuth, useCurrentUserName } from '../../hooks/useAuth';
import {
  appendOrderHistory,
  createOrder,
  createOrderLines,
  getNextOrderNo,
  readCustomers,
  readProducts,
  upsertCorrection,
  type CreateOrderLineInput,
  type ParsedOrderDraft,
  type ParsedOrderLine,
} from '../../lib/directus';
import type { CustomersCollection, ProductsCollection } from '../../types/directus';
import styles from './NewOrderModal.module.css';

interface NewOrderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Optional prefill from the WhatsApp intake parser. */
  prefill?: ParsedOrderDraft | null;
}

interface LineDraft {
  id: string;
  productId: string | '';
  freeText: string;
  qty: string;
  unit: string;
  /** From parser: 'recognized' | 'probable' | 'unrecognized' | undefined */
  parseStatus?: ParsedOrderLine['status'];
  /** Raw text from parser — shown when status is 'unrecognized' */
  rawText?: string;
}

const UNITS = ['kg', 'gram', 'pack', 'pcs', 'box', 'ekor', 'loaf'] as const;

let lineSeq = 0;
function newLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

function emptyLine(): LineDraft {
  return { id: newLineId(), productId: '', freeText: '', qty: '1', unit: 'pcs' };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Modal form: pick an existing customer + add product lines (or free-text).
 *  Submit creates an `orders` row + N `order_lines` rows + 1 `order_history` row.
 *  Accepts an optional `prefill` from the WhatsApp intake parser to pre-fill all fields.
 *  Every submit passes through `can('createOrders')` first (domain layer). */
export function NewOrderModal({ open, onClose, onCreated, prefill }: NewOrderModalProps) {
  const can = useAuth().can;
  const currentUserName = useCurrentUserName();
  const allowed = can('createOrders');

  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [deliverAt, setDeliverAt] = useState('');
  const [sales, setSales] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadOptions() {
      setLoadingOpts(true);
      if (currentUserName) setSales(currentUserName);
      const [c, p] = await Promise.all([
        readCustomers({ fields: ['id', 'name', 'channel', 'contact', 'area'], limit: -1, sort: ['name'] }),
        readProducts({ fields: ['id', 'name', 'catch_weight', 'active'], filter: { active: { _eq: true } }, limit: -1, sort: ['name'] }),
      ]);
      if (cancelled) return;
      if (c.error === null) setCustomers(c.data);
      if (p.error === null) setProducts(p.data);
      setLoadingOpts(false);

      // Apply prefill after products/customers are loaded
      if (prefill && !cancelled) {
        // Pre-select customer by id, or by best name match
        if (prefill.customerId) {
          setCustomerId(prefill.customerId);
        } else if (prefill.customerTyped && c.data) {
          const typed = prefill.customerTyped.toLowerCase();
          const match = c.data.find(
            (cu) =>
              cu.name.toLowerCase().includes(typed) ||
              (cu.company_name ?? '').toLowerCase().includes(typed),
          );
          if (match) setCustomerId(match.id);
        }
        // Pre-fill delivery date
        if (prefill.deliver) setDeliverAt(prefill.deliver);
        // Pre-fill notes from ref/address
        if (prefill.ref) setNotes(prefill.ref);
        // Pre-fill sales
        if (prefill.sales) setSales(prefill.sales);
        // Pre-fill lines from parsed lines
        if (prefill.lines && prefill.lines.length > 0 && p.data) {
          const productMap = new Map(p.data.map((pr) => [pr.id, pr.name]));
          setLines(
            prefill.lines.map((pl) => ({
              id: newLineId(),
              productId: pl.productId && productMap.has(pl.productId) ? pl.productId : '',
              freeText: pl.productId ? '' : pl.name,
              qty: String(pl.qty ?? 1),
              unit: pl.unit || 'kg',
              parseStatus: pl.status,
              rawText: pl.raw,
            })),
          );
        }
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [open, currentUserName, prefill]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  function updateLine(id: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  if (!open) return null;

  function close() {
    if (submitting) return;
    setError(null);
    setCustomerId('');
    setDeliverAt('');
    setNotes('');
    setLines([emptyLine()]);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowed) {
      setError("Your role doesn't have permission to create orders.");
      return;
    }
    if (!customerId) {
      setError('Pick a customer.');
      return;
    }
    const cleanLines = lines
      .map((l) => ({
        ...l,
        qtyNum: parseFloat(l.qty),
        name: l.productId ? (productNameById.get(l.productId) ?? '') : l.freeText.trim(),
      }))
      .filter((l) => l.name.length > 0 && l.qtyNum > 0 && Number.isFinite(l.qtyNum));
    if (cleanLines.length === 0) {
      setError('Add at least one line with a name and a quantity greater than 0.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const noRes = await getNextOrderNo();
    if (noRes.error !== null || noRes.data === null) {
      setError(`Could not generate order number: ${noRes.error ?? 'unknown'}`);
      setSubmitting(false);
      return;
    }

    const orderRes = await createOrder({
      no: noRes.data,
      customer_id: customerId,
      channel: 'horeca',
      stage: 'intake',
      status: 'Open',
      sales: sales || null,
      deliver_at: deliverAt || null,
      order_date: todayISO(),
      notes: notes || null,
    });
    if (orderRes.error !== null || orderRes.data === null) {
      setError(`Failed to create order: ${orderRes.error ?? 'unknown'}`);
      setSubmitting(false);
      return;
    }
    const orderId = orderRes.data.id;

    const lineInputs: CreateOrderLineInput[] = cleanLines.map((l, i) => ({
      order_id: orderId,
      product_id: l.productId || null,
      name: l.name,
      qty: l.qtyNum,
      unit: l.unit,
      status: l.productId ? 'recognized' : 'manual',
      sort_order: i,
    }));
    const linesRes = await createOrderLines(lineInputs);
    if (linesRes.error !== null) {
      setError(`Order created but lines failed: ${linesRes.error}. Order id ${orderId}.`);
      setSubmitting(false);
      onCreated();
      close();
      return;
    }

    // Persist any corrections the user made for unrecognized lines
    const correctionPromises = cleanLines
      .filter((l) => l.productId && l.rawText)
      .map((l) => upsertCorrection(l.rawText!, l.productId));
    await Promise.allSettled(correctionPromises);

    await appendOrderHistory({
      order_id: orderId,
      what: 'Order created',
      who: null,
      stage: 'intake',
    });

    setSubmitting(false);
    onCreated();
    close();
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="new-order-title" className={styles.title}>
            New Order
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={close}
            disabled={submitting}
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        {!allowed && (
          <p className={styles.error} role="alert">
            Your role doesn't have permission to create orders.
          </p>
        )}

        {loadingOpts && <p className={styles.muted}>Loading customers + products…</p>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Customer *</span>
              <select
                className={styles.select}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={submitting || !allowed}
                required
              >
                <option value="" disabled>
                  Select customer…
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Delivery date</span>
              <input
                type="date"
                className={styles.input}
                value={deliverAt}
                onChange={(e) => setDeliverAt(e.target.value)}
                disabled={submitting || !allowed}
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Sales rep</span>
              <input
                type="text"
                className={styles.input}
                value={sales}
                onChange={(e) => setSales(e.target.value)}
                disabled={submitting || !allowed}
                placeholder="Auto-filled from your name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Notes</span>
              <input
                type="text"
                className={styles.input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting || !allowed}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className={styles.linesSection}>
            <div className={styles.linesHeader}>
              <span className={styles.label}>Order lines *</span>
              <button
                type="button"
                className={styles.addLineBtn}
                onClick={addLine}
                disabled={submitting || !allowed}
              >
                <Icon name="add" size={16} />
                Add line
              </button>
            </div>

            {lines.map((l, i) => (
              <div key={l.id} className={styles.lineRow}>
                <span className={styles.lineIndex}>{i + 1}</span>
                <select
                  className={`${styles.select} ${styles.lineProduct}`}
                  value={l.productId}
                  onChange={(e) => updateLine(l.id, { productId: e.target.value, freeText: '' })}
                  disabled={submitting || !allowed}
                >
                  <option value="">— free text —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className={`${styles.input} ${styles.lineName}`}
                  value={l.productId ? (productNameById.get(l.productId) ?? '') : l.freeText}
                  onChange={(e) =>
                    updateLine(l.id, { freeText: e.target.value, productId: e.target.value ? '' : l.productId })
                  }
                  placeholder="Line name"
                  disabled={submitting || !allowed || !!l.productId}
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={`${styles.input} ${styles.lineQty}`}
                  value={l.qty}
                  onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                  placeholder="Qty"
                  disabled={submitting || !allowed}
                />
                <select
                  className={`${styles.select} ${styles.lineUnit}`}
                  value={l.unit}
                  onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                  disabled={submitting || !allowed}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.removeLineBtn}
                  onClick={() => removeLine(l.id)}
                  disabled={submitting || !allowed || lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <footer className={styles.footer}>
            <Button variant="ghost" size="md" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={submitting || !allowed || loadingOpts}>
              {submitting ? 'Creating…' : 'Create order'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
