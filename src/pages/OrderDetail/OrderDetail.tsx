import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { useAuth, useCurrentUserName } from '../../hooks/useAuth';
import {
  readOrder,
  readOrderLines,
  readOrderHistory,
  appendOrderHistory,
} from '../../lib/directus';
import type {
  OrdersCollection,
  OrderLinesCollection,
  OrderHistoryCollection,
} from '../../types/directus';
import styles from './OrderDetail.module.css';

const STAGES = [
  { key: 'intake', label: 'Intake' },
  { key: 'cold', label: 'Cold Storage' },
  { key: 'finance', label: 'Finance' },
  { key: 'production', label: 'Production' },
  { key: 'packing', label: 'Packing' },
  { key: 'finalise', label: 'Finalise' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'delivered', label: 'Delivered' },
];

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const userName = useCurrentUserName();

  const [order, setOrder] = useState<OrdersCollection | null>(null);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);
  const [history, setHistory] = useState<OrderHistoryCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const orderId = id as string;
    if (!orderId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [orderRes, linesRes, historyRes] = await Promise.all([
        readOrder(orderId),
        readOrderLines({ filter: { order_id: { _eq: orderId } } }),
        readOrderHistory(orderId),
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
      setLines(linesRes.data || []);
      setHistory(historyRes.data || []);
      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className={styles.container}>Loading order details…</div>;
  if (error || !order) return <div className={styles.container} style={{ color: 'var(--status-danger)' }}>{error || 'Order not found.'}</div>;

  const currentStageIndex = STAGES.findIndex((s) => s.key === order.stage);

  // Calculate order total
  const orderTotal = lines.reduce((acc, line) => {
    const qty = typeof line.qty === 'string' ? parseFloat(line.qty) : line.qty ?? 0;
    const price = typeof line.price === 'string' ? parseFloat(line.price) : line.price ?? 0;
    return acc + qty * price;
  }, 0);

  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  const copyWA = async () => {
    if (!order) return;
    const itemsText = lines
      .map((l) => `• ${l.qty} ${l.unit} ${l.name}`)
      .join('\n');

    const d = order.deliver_at ? new Date(order.deliver_at) : new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const hariID = days[d.getDay()];
    const bulanID = months[d.getMonth()];

    const txt = [
      `*Konfirmasi Pesanan Pesanan #${order.no}*`,
      order.customer_name ?? '',
      `Kirim: ${hariID}, ${d.getDate()} ${bulanID} ${d.getFullYear()}`,
      '',
      itemsText,
      order.notes ? `\nCatatan: ${order.notes}` : null,
      '',
      'Terima kasih 🙏',
      'PT Inti Pangan Perkasa',
    ]
      .filter((x) => x !== null)
      .join('\n');

    try {
      await navigator.clipboard.writeText(txt);
      window.alert('WhatsApp order confirmation copied to clipboard.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      window.alert('WhatsApp order confirmation copied to clipboard.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || savingNote || !id) return;

    setSavingNote(true);
    // Directus has notes column as free-text. For now, let's update order notes field
    // or append order history log. Since the prototype appends order notes array or history:
    // Let's create an order history event to document the team note.
    const historyInput = {
      order_id: id,
      what: `Note: ${noteText.trim()}`,
      who: userName || 'Team Member',
      stage: order.stage || 'intake',
    };

    const res = await appendOrderHistory(historyInput);
    if (!res.error && res.data) {
      setHistory((prev) => [res.data!, ...prev]);
      setNoteText('');
    } else {
      window.alert(`Failed to add note: ${res.error || 'Unknown error'}`);
    }
    setSavingNote(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <Icon name="chevronLeft" size={16} />
            Back
          </button>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Order #{order.no || '—'}</h1>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={copyWA}>
            <Icon name="whatsapp" size={16} />
            Copy WA
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
            <Icon name="reports" size={16} />
            Print
          </button>
          {auth.can('createOrders') && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => window.alert('Order editing is managed in Directus / main flow.')}
            >
              <Icon name="settings" size={16} />
              Edit
            </button>
          )}
        </div>
      </header>

      {/* Stepper progress */}
      <Card>
        <div className={styles.stepper}>
          {STAGES.map((s, idx) => {
            const isActive = order.stage === s.key;
            const isCompleted = currentStageIndex > idx;
            return (
              <div
                key={s.key}
                className={[
                  styles.step,
                  isActive ? styles.stepActive : '',
                  isCompleted ? styles.stepCompleted : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.stepDot} />
                <span className={styles.stepLabel}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Customer + dossier card */}
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
            <span className={styles.detailValue}>
              {order.deliver_at
                ? new Date(order.deliver_at).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '—'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Order Date</span>
            <span className={styles.detailValue}>
              {order.order_date
                ? new Date(order.order_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '—'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Sales Rep</span>
            <span className={styles.detailValue}>{order.sales ?? '—'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Contact</span>
            <span className={styles.detailValue}>{order.customer_contact ?? '—'}</span>
          </div>
        </div>
      </Card>

      {/* Items list */}
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
              const qty = typeof line.qty === 'string' ? parseFloat(line.qty) : line.qty ?? 0;
              const price = typeof line.price === 'string' ? parseFloat(line.price) : line.price ?? 0;
              return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td style={{ textAlign: 'right' }}>{qty}</td>
                  <td>{line.unit}</td>
                  <td style={{ textAlign: 'right' }}>{currency.format(price)}</td>
                  <td style={{ textAlign: 'right' }}>{currency.format(qty * price)}</td>
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

      {/* Notes / Team Comms */}
      <Card>
        <h3 className={styles.heading}>Notes &amp; Team Comms</h3>
        {order.notes && (
          <div className={styles.notesList}>
            <div className={styles.noteItem}>
              <div className={styles.noteHeader}>
                <span>Customer Note</span>
              </div>
              <p style={{ margin: 0 }}>{order.notes}</p>
            </div>
          </div>
        )}
        <form className={styles.noteForm} onSubmit={handleAddNote}>
          <input
            type="text"
            className={styles.noteInput}
            placeholder="Add note for the team…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            disabled={savingNote}
          />
          <button type="submit" className={styles.btnPrimary} disabled={savingNote || !noteText.trim()}>
            Add Note
          </button>
        </form>
      </Card>

      {/* Order History */}
      <Card>
        <h3 className={styles.heading}>History</h3>
        <div className={styles.historyList}>
          {history.map((h, i) => (
            <div key={h.id || i} className={styles.historyItem}>
              <span className={styles.historyTime}>
                {h.at
                  ? new Date(h.at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
              <span className={styles.historyContent}>
                {h.what} {h.who ? ` · ${h.who}` : ''}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
