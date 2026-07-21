import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { Button } from '../../components/Button/Button';
import { useAuth } from '../../hooks/useAuth';
import {
  readProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  readOrderLines,
} from '../../lib/directus';

import styles from './ProductDetail.module.css';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const isNew = id === 'new';
  const canManage = auth.can('manage_products');

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usedBy, setUsedBy] = useState(0);

  // Form State
  const [name, setName] = useState('');
  const [accurateName, setAccurateName] = useState('');
  const [category, setCategory] = useState('');
  const [origin, setOrigin] = useState('');
  const [grade, setGrade] = useState('');
  const [brand, setBrand] = useState('');
  const [catchWeight, setCatchWeight] = useState(false);
  const [oos, setOos] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const productRes = await readProducts({
        filter: { id: { _eq: id } },
      });

      if (cancelled) return;

      if (productRes.error || !productRes.data?.[0]) {
        setError(productRes.error || 'Product not found.');
        setLoading(false);
        return;
      }

      const p = productRes.data[0];
      setName(p.name);
      setAccurateName(p.accurate_name ?? '');
      setCategory(p.category ?? '');
      setOrigin(p.origin ?? '');
      setGrade(p.grade ?? '');
      setBrand(p.brand ?? '');
      setCatchWeight(!!p.catch_weight);
      // In schemas.ts, we don't have explicit oos boolean on products, wait!
      // Let's check active flag or check if we mapped active to oos?
      // Wait! The Products page uses toggles. Let's check schemas.ts to see what fields exist on product.
      // Ah! ProductsCollectionSchema:
      // active: z.boolean().nullable().optional()
      // Wait, is there a catch_weight? yes, catch_weight is there.
      // Wait, is there active? Yes, active is a boolean. In Products.tsx, active: false represents OOS!
      // Yes! In Products page: Active = in stock, Inactive/OOS = out of stock.
      // So oos is !active!
      setOos(!p.active);

      // Check if product is in use by orders
      const linesRes = await readOrderLines({
        filter: { product_id: { _eq: id } },
        limit: 1,
        fields: ['id'],
      });

      if (!cancelled && linesRes.data) {
        setUsedBy(linesRes.data.length);
      }

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    const payload = {
      name: name.trim(),
      accurate_name: accurateName.trim() || name.trim(),
      category: category.trim() || null,
      origin: origin.trim() || null,
      grade: grade.trim() || null,
      brand: brand.trim() || null,
      catch_weight: catchWeight,
      active: !oos, // active is true if NOT out of stock
    };

    let res;
    if (isNew) {
      const generatedId = `${slugify(name) || 'product'}-${Date.now().toString(36)}`;
      res = await createProduct({
        id: generatedId,
        ...payload,
      });
    } else if (id) {
      res = await updateProduct(id, payload);
    }

    setSaving(false);

    if (res && res.error) {
      window.alert(`Failed to save product: ${res.error}`);
    } else {
      navigate('/products');
    }
  };

  const handleDelete = async () => {
    if (usedBy > 0) {
      window.alert(`Product is used by active orders and cannot be deleted.`);
      return;
    }
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }

    if (id) {
      const res = await deleteProduct(id);
      if (res.error) {
        window.alert(`Failed to delete product: ${res.error}`);
      } else {
        navigate('/products');
      }
    }
  };

  if (loading) return <div className={styles.container}>Loading product details…</div>;
  if (error) return <div className={styles.container} style={{ color: 'var(--status-danger)' }}>{error}</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Button type="button" variant="tertiary" onClick={() => navigate('/products')}>
            <Icon name="chevronLeft" size={16} />
            Back
          </Button>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              {isNew ? 'New Product' : name}
            </h1>
          </div>
        </div>
      </header>

      <Card>
        {canManage ? (
          <form className={styles.form} onSubmit={handleSave}>
            <div className={styles.field}>
              <label className={styles.label}>Display Name *</label>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Aus Wagyu Striploin 8-9"
                disabled={saving}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Accurate Name (Raw)</label>
              <input
                type="text"
                className={styles.input}
                value={accurateName}
                onChange={(e) => setAccurateName(e.target.value)}
                placeholder="WAGYU STRIPLOIN 8-9"
                disabled={saving}
              />
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Category</label>
                <input
                  type="text"
                  className={styles.input}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Origin</label>
                <input
                  type="text"
                  className={styles.input}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Grade</label>
                <input
                  type="text"
                  className={styles.input}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Brand</label>
                <input
                  type="text"
                  className={styles.input}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={catchWeight}
                onChange={(e) => setCatchWeight(e.target.checked)}
                disabled={saving}
              />
              <span>Catch-weight (sold by actual weight)</span>
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={oos}
                onChange={(e) => setOos(e.target.checked)}
                disabled={saving}
              />
              <span style={oos ? { color: 'var(--status-danger)', fontWeight: 600 } : undefined}>
                Out of Stock (warn when someone orders this)
              </span>
            </label>

            {!isNew && usedBy > 0 && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                Product is currently used by {usedBy} active order(s).
              </p>
            )}

            <div className={styles.actions}>
              <Button type="submit" variant="primary" size="md" disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : 'Save Product'}
              </Button>
              {!isNew && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleDelete}
                  disabled={saving}
                  title="Delete Product"
                >
                  <Icon name="trash" size={16} />
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className={styles.field}>
              <span className={styles.label}>Display Name</span>
              <span style={{ fontSize: '16px', fontWeight: 600 }}>{name}</span>
            </div>
            {accurateName && (
              <div className={styles.field}>
                <span className={styles.label}>Accurate Name</span>
                <span>{accurateName}</span>
              </div>
            )}
            <div className={styles.grid2}>
              <div className={styles.field}>
                <span className={styles.label}>Category</span>
                <span>{category || '—'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Origin</span>
                <span>{origin || '—'}</span>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Read-only — only an admin can edit products.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
