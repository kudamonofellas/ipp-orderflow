import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Button } from '../../components/Button/Button';
import { Toggle } from '../../components/Toggle/Toggle';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import {
  readProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  readOrderLines,
} from '../../lib/directus';
import styles from './ProductEdit.module.css';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function ProductEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();

  const isNew = id === 'new';
  const canManage = auth.can('manage_products');

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usedBy, setUsedBy] = useState(0);

  // ── Loaded (original) values — used for change detection ──
  const [origName, setOrigName] = useState('');
  const [origAccurateName, setOrigAccurateName] = useState('');
  const [origCategory, setOrigCategory] = useState('');
  const [origOrigin, setOrigOrigin] = useState('');
  const [origGrade, setOrigGrade] = useState('');
  const [origBrand, setOrigBrand] = useState('');
  const [origCatchWeight, setOrigCatchWeight] = useState(false);
  const [origOos, setOrigOos] = useState(false);

  // ── Working copy ──
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

      // Populate originals
      setOrigName(p.name);
      setOrigAccurateName(p.accurate_name ?? '');
      setOrigCategory(p.category ?? '');
      setOrigOrigin(p.origin ?? '');
      setOrigGrade(p.grade ?? '');
      setOrigBrand(p.brand ?? '');
      setOrigCatchWeight(!!p.catch_weight);
      setOrigOos(!!p.oos);

      // Populate working copies
      setName(p.name);
      setAccurateName(p.accurate_name ?? '');
      setCategory(p.category ?? '');
      setOrigin(p.origin ?? '');
      setGrade(p.grade ?? '');
      setBrand(p.brand ?? '');
      setCatchWeight(!!p.catch_weight);
      setOos(!!p.oos);

      const linesRes = await readOrderLines({
        filter: { product_id: { _eq: id } },
        limit: 1,
        // `name` is required (non-optional) in OrderLinesCollectionSchema —
        // must be requested even though it's unused here, or zod parsing fails.
        fields: ['id', 'name'],
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

  // ── Redirect unauthorized users away ──
  useEffect(() => {
    if (!loading && !canManage) {
      navigate(isNew ? '/products' : `/products/${id}`, { replace: true });
    }
  }, [loading, canManage, navigate, id, isNew]);

  // ── Change detection ──
  const hasChanges =
    name.trim() !== origName.trim() ||
    accurateName.trim() !== origAccurateName.trim() ||
    category.trim() !== origCategory.trim() ||
    origin.trim() !== origOrigin.trim() ||
    grade.trim() !== origGrade.trim() ||
    brand.trim() !== origBrand.trim() ||
    catchWeight !== origCatchWeight ||
    oos !== origOos;

  const canSave = hasChanges && !!name.trim() && !saving;

  function handleCancel() {
    navigate(isNew ? '/products' : `/products/${id}`);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    const payload = {
      name: name.trim(),
      accurate_name: accurateName.trim() || name.trim(),
      category: category.trim() || null,
      origin: origin.trim() || null,
      grade: grade.trim() || null,
      brand: brand.trim() || null,
      catch_weight: catchWeight,
      oos,
    };

    let res;
    if (isNew) {
      const generatedId = `${slugify(name) || 'product'}-${Date.now().toString(36)}`;
      res = await createProduct({ id: generatedId, ...payload });
    } else if (id) {
      res = await updateProduct(id, payload);
    }

    setSaving(false);

    if (res && res.error) {
      setError(`Failed to save product: ${res.error}`);
    } else {
      navigate(isNew ? '/products' : `/products/${id}`);
    }
  };

  const handleDelete = async () => {
    if (usedBy > 0) {
      window.alert(t('Product is used by active orders and cannot be deleted.'));
      return;
    }
    if (!window.confirm(t('Are you sure you want to delete this product?'))) return;
    if (!id) return;

    setDeleting(true);
    const res = await deleteProduct(id);
    setDeleting(false);

    if (res.error) {
      window.alert(`Failed to delete product: ${res.error}`);
    } else {
      navigate('/products');
    }
  };

  if (loading) return <div className={styles.container}>{t('Loading…')}</div>;
  if (error && !name)
    return (
      <div className={styles.container} style={{ color: 'var(--state-error)' }}>
        {t(error)}
      </div>
    );

  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        {/* ── Sticky Header ── */}
        <header className={styles.header}>
          <div className={styles.titleSection}>
            <Button type="button" variant="tertiary" icon="chevronLeft" onClick={handleCancel}>
              {t('Back to product')}
            </Button>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{isNew ? t('New Product') : t('Edit Product')}</h2>
            </div>
          </div>
          <div className={styles.actions}>
            {!isNew && (
              <Button
                type="button"
                variant="secondary"
                icon="trash"
                onClick={handleDelete}
                disabled={saving || deleting}
              >
                {deleting ? t('Deleting…') : t('Delete')}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              icon="save"
              disabled={!canSave}
              onClick={handleSave}
            >
              {saving ? t('Saving…') : t('Save Changes')}
            </Button>
          </div>
        </header>

        {error && <div className={styles.error}>{t(error)}</div>}

        <Card>
          <h3 className={styles.heading}>{t('Product Details')}</h3>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.label}>{t('Display Name')} *</span>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={isNew}
                placeholder="Aus Wagyu Striploin 8-9"
                disabled={saving}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('Accurate Name (Raw)')}</span>
              <input
                type="text"
                className={styles.input}
                value={accurateName}
                onChange={(e) => setAccurateName(e.target.value)}
                placeholder="WAGYU STRIPLOIN 8-9"
                disabled={saving}
              />
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t('Category')}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('Origin')}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t('Grade')}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('Brand')}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={catchWeight}
                onChange={(e) => setCatchWeight(e.target.checked)}
                disabled={saving}
              />
              <span>{t('Catch-weight (sold by actual weight)')}</span>
            </label>

            <label className={styles.checkboxLabel}>
              <Toggle
                size="sm"
                label={t('Out of Stock')}
                checked={oos}
                onChange={setOos}
                disabled={saving}
              />
              <span style={oos ? { color: 'var(--state-error)', fontWeight: 600 } : undefined}>
                {t('Out of Stock (warn when someone orders this)')}
              </span>
            </label>

            {!isNew && usedBy > 0 && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                {t('Product is currently used by')} {usedBy} {t('active order(s).')}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
