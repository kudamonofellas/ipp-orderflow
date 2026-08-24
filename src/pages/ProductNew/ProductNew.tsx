import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card/Card';
import { Button } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Toggle } from '../../components/Toggle/Toggle';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { createProduct } from '../../lib/directus';
import styles from './ProductNew.module.css';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** Create-a-product form — layout ported from `ProductEdit.tsx`, minus the
 *  load-existing/change-detection/OOS-only-access machinery an edit needs
 *  but a fresh record never does (creating is always a full-manage action). */
export function ProductNew() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();

  const canManage = auth.can('manage_products');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [accurateName, setAccurateName] = useState('');
  const [category, setCategory] = useState('');
  const [origin, setOrigin] = useState('');
  const [grade, setGrade] = useState('');
  const [brand, setBrand] = useState('');
  const [catchWeight, setCatchWeight] = useState(false);
  const [oos, setOos] = useState(false);

  // Defence-in-depth — the button that reaches this page is already gated on
  // `manage_products` (Products.tsx), same self-guard pattern as every other
  // Edit/New page in this app.
  useEffect(() => {
    if (!canManage) navigate('/products', { replace: true });
  }, [canManage, navigate]);

  const canSave = !!name.trim() && !saving;

  function handleCancel() {
    navigate('/products');
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    const generatedId = `${slugify(name) || 'product'}-${Date.now().toString(36)}`;
    const res = await createProduct({
      id: generatedId,
      name: name.trim(),
      accurate_name: accurateName.trim() || name.trim(),
      category: category.trim() || null,
      origin: origin.trim() || null,
      grade: grade.trim() || null,
      brand: brand.trim() || null,
      catch_weight: catchWeight,
      oos,
    });

    setSaving(false);

    if (res.error) {
      setError(`Failed to create product: ${res.error}`);
    } else {
      navigate(res.data ? `/products/${res.data.id}` : '/products');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        {/* ── Sticky Header ── */}
        <header className={styles.header}>
          <div className={styles.topActionsRow}>
            <Button type="button" variant="tertiary" icon="chevronLeft" onClick={handleCancel}>
              {t('Back to products')}
            </Button>
            <div className={styles.actions}>
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
                {saving ? t('Creating…') : t('Create Product')}
              </Button>
            </div>
          </div>

          <div className={styles.titleRow}>
            <h2 className={styles.title}>{t('New Product')}</h2>
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
                autoFocus
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
              <Checkbox
                size="sm"
                checked={catchWeight}
                onChange={setCatchWeight}
                label={t('Catch-weight (sold by actual weight)')}
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
          </div>
        </Card>
      </div>
    </div>
  );
}
