import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { Button } from '../../components/Button/Button'
import { useAuth } from '../../hooks/useAuth';
import {
  readCustomers,
  createCustomer,
  updateCustomer,
  readOrders,
  readOrderLines,
} from '../../lib/directus';
import type {
  OrdersCollection,
  OrderLinesCollection,
} from '../../types/directus';
import styles from './CustomerDetail.module.css';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const isNew = id === 'new';
  const canEdit = auth.can('manage_customers');
  const seeCredit = auth.can('seePrices');

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Customer Form State
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [channel, setChannel] = useState('horeca');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [sales, setSales] = useState('');
  const [payTiming, setPayTiming] = useState('upfront');
  const [payMethod, setPayMethod] = useState('transfer');
  const [creditLimit, setCreditLimit] = useState('0');
  const [termDays, setTermDays] = useState('0');

  // Customer dossier
  const [orders, setOrders] = useState<OrdersCollection[]>([]);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const customerRes = await readCustomers({
        filter: { id: { _eq: id } },
      });

      if (cancelled) return;

      if (customerRes.error || !customerRes.data?.[0]) {
        setError(customerRes.error || 'Customer not found.');
        setLoading(false);
        return;
      }

      const cust = customerRes.data[0];
      setName(cust.name);
      setCompanyName(cust.company_name ?? '');
      setChannel(cust.channel ?? 'horeca');
      setContact(cust.contact ?? '');
      setAddress(cust.address ?? '');
      setArea(cust.area ?? '');
      setSales(cust.sales ?? '');
      setPayTiming(cust.pay_timing ?? 'upfront');
      setPayMethod(cust.pay_method ?? 'transfer');
      setCreditLimit(String(cust.credit_limit ?? 0));
      setTermDays(String(cust.term_days ?? 0));

      // Fetch customer orders
      const ordersRes = await readOrders({
        filter: { customer_id: { _eq: id } },
        sort: ['-order_date', '-created_at'],
        limit: 100,
      });

      if (cancelled) return;

      if (ordersRes.data && ordersRes.data.length > 0) {
        setOrders(ordersRes.data);
        const orderIds = ordersRes.data.map((o) => o.id);
        const linesRes = await readOrderLines({
          filter: { order_id: { _in: orderIds } },
          limit: -1,
        });
        if (!cancelled && linesRes.data) {
          setLines(linesRes.data);
        }
      }

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Calculate order value
  const getOrderValue = (orderId: string) => {
    return lines
      .filter((l) => l.order_id === orderId && !l.removed)
      .reduce((acc, line) => {
        const q = typeof line.qty === 'string' ? parseFloat(line.qty) : line.qty ?? 0;
        const p = typeof line.price === 'string' ? parseFloat(line.price) : line.price ?? 0;
        return acc + q * p;
      }, 0);
  };

  // Calculate customer exposure
  const getExposure = () => {
    return orders
      .filter((o) => !o.cancelled && !['delivered', 'cancelled', 'returned'].includes(o.stage ?? ''))
      .reduce((acc, o) => acc + getOrderValue(o.id), 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    const limitNum = parseInt(creditLimit.replace(/[^\d]/g, ''), 10) || 0;
    const termNum = parseInt(termDays, 10) || 0;

    const payload = {
      name: name.trim(),
      company_name: companyName.trim() || null,
      channel,
      contact: contact.trim() || null,
      address: address.trim() || null,
      area: area.trim() || null,
      sales: sales.trim() || null,
      pay_timing: payTiming,
      pay_method: payMethod,
      credit_limit: limitNum,
      term_days: termNum,
    };

    let res;
    if (isNew) {
      res = await createCustomer({
        id: 'c-' + Date.now().toString(36),
        ...payload,
      });
    } else if (id) {
      res = await updateCustomer(id, payload);
    }

    setSaving(false);

    if (res && res.error) {
      window.alert(`Failed to save customer: ${res.error}`);
    } else {
      navigate('/customers');
    }
  };

  if (loading) return <div className={styles.container}>Loading customer details…</div>;
  if (error) return <div className={styles.container} style={{ color: 'var(--status-danger)' }}>{error}</div>;

  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button type="button" variant='secondary' onClick={() => navigate('/customers')}>
            <Icon name="chevronLeft" size={16} />
            Back
          </Button>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              {isNew ? 'New Customer' : name}
            </h1>
          </div>
        </div>
      </header>

      {canEdit ? (
        <Card>
          <form className={styles.form} onSubmit={handleSave}>
            <div className={styles.field}>
              <label className={styles.label}>Restaurant / Outlet Name *</label>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={isNew}
                placeholder="e.g. Toko Makmur"
                disabled={saving}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Company Name (PT / CV for Invoice)</label>
              <input
                type="text"
                className={styles.input}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. PT En Prima Food &amp; Beverages"
                disabled={saving}
              />
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Phone / Contact</label>
                <input
                  type="text"
                  className={styles.input}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. +62 812..."
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Area</label>
                <input
                  type="text"
                  className={styles.input}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Jakarta Selatan"
                  disabled={saving}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Delivery Address</label>
              <input
                type="text"
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Jl. Kemang Raya No. 10..."
                disabled={saving}
              />
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Sales Rep</label>
                <input
                  type="text"
                  className={styles.input}
                  value={sales}
                  onChange={(e) => setSales(e.target.value)}
                  placeholder="e.g. Budi"
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Payment Timing</label>
                <select
                  className={styles.select}
                  value={payTiming}
                  onChange={(e) => setPayTiming(e.target.value)}
                  disabled={saving}
                >
                  <option value="upfront">Upfront</option>
                  <option value="cod">COD</option>
                  <option value="terms">Terms</option>
                </select>
              </div>
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Credit Limit (IDR)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.input}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Terms (days)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={termDays}
                  onChange={(e) => setTermDays(e.target.value)}
                  placeholder="0"
                  disabled={saving}
                />
              </div>
            </div>
            <button type="submit" className={styles.btnPrimary} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save Customer'}
            </button>
          </form>
        </Card>
      ) : (
        <Card className={styles.profileRow}>
          <div className={styles.avatar}>{(name || 'C').charAt(0).toUpperCase()}</div>
          <div className={styles.customerInfo}>
            <h3>{name}</h3>
            {companyName && <p>{companyName}</p>}
            <p>{[area, contact].filter(Boolean).join(' · ') || 'No contact details recorded'}</p>
          </div>
        </Card>
      )}

      {!isNew && seeCredit && parseInt(creditLimit, 10) > 0 && (
        <Card>
          <h3 className={styles.heading}>Credit Profile</h3>
          <div className={styles.exposureRow}>
            <span>Account Exposure (In Flight Orders)</span>
            <span className={styles.exposureVal}>{currency.format(getExposure())}</span>
          </div>
          <div className={styles.exposureRow}>
            <span>Credit Limit</span>
            <span className={styles.exposureVal}>{currency.format(parseInt(creditLimit, 10))}</span>
          </div>
        </Card>
      )}

      {!isNew && orders.length > 0 && (
        <Card>
          <h3 className={styles.heading}>Order History</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Order ID</th>
                <th style={{ textAlign: 'left' }}>Stage</th>
                <th style={{ textAlign: 'left' }}>Order Date</th>
                <th style={{ textAlign: 'right' }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={styles.tr} onClick={() => navigate(`/orders/${o.id}`)}>
                  <td>{o.no || o.order_id}</td>
                  <td>{o.stage || o.status}</td>
                  <td>
                    {o.order_date
                      ? new Date(o.order_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{currency.format(getOrderValue(o.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
