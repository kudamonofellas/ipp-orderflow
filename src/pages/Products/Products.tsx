import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import { Card } from '../../components/Card/Card';
import { SortableTh } from '../../components/SortableTh/SortableTh';
import { Toggle } from '../../components/Toggle/Toggle';
import { readProducts, updateProduct, aggregateProducts } from '../../lib/directus';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { useDialog } from '../../hooks/useDialog';
import type { ProductsCollection } from '../../types/directus';
import styles from './Products.module.css';

const PAGE_SIZE = 25;

type ActiveFilter = 'all' | 'active' | 'oos';

/** Products page: searchable, filterable list. Warehouse/Admin/Owner can toggle OOS. */
export function Products() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { t } = useLanguage();
  const { alert } = useDialog();
  const canManageProducts = can('manage_products');
  const canToggleOOS = can('flag_out_of_stock');
  const canView = can('browseProducts');

  // Defence-in-depth: the route is already wrapped in <Guarded cap="browseProducts">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate('/', { replace: true });
  }, [canView, navigate]);

  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFilter = useCallback(() => {
    const parts: Record<string, unknown>[] = [];

    if (search.trim()) {
      parts.push({
        _or: [
          { name: { _icontains: search.trim() } },
          { accurate_name: { _icontains: search.trim() } },
          { category: { _icontains: search.trim() } },
          { brand: { _icontains: search.trim() } },
        ],
      });
    }

    if (activeFilter === 'active') {
      parts.push({
        _or: [
          { oos: { _eq: false } },
          { oos: { _null: true } },
        ],
      });
    } else if (activeFilter === 'oos') {
      parts.push({ oos: { _eq: true } });
    }

    return parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { _and: parts };
  }, [search, activeFilter]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const filter = buildFilter();

      const [dataRes, countRes] = await Promise.all([
        readProducts({
          filter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          sort: [sortBy],
          fields: ['id', 'name', 'accurate_name', 'category', 'grade', 'brand', 'form', 'pack', 'oos'],
        }),
        aggregateProducts({
          aggregate: { count: '*' },
          ...(Object.keys(filter).length ? { query: { filter } } : {}),
        }),
      ]);

      if (dataRes.error) {
        setError(dataRes.error);
      } else {
        setProducts(dataRes.data ?? []);
        if (countRes.error) {
          // Count failed independently of the data fetch — don't block the
          // list from rendering, but don't silently claim a total of 0 either.
          console.warn('Failed to fetch product count:', countRes.error);
          setTotal(dataRes.data?.length ?? 0);
        } else {
          const countValue = Number(countRes.data?.[0]?.count ?? 0);
          setTotal(Number.isNaN(countValue) ? 0 : countValue);
        }
      }
      setLoading(false);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, search ? 300 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page, sortBy, activeFilter, buildFilter]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSort = (next: string) => {
    setSortBy(next);
    setPage(1);
  };

  const handleFilterChange = (f: ActiveFilter) => {
    setActiveFilter(f);
    setPage(1);
  };

  const handleToggleActive = async (product: ProductsCollection) => {
    if (!canToggleOOS) return;
    setTogglingId(product.id);
    const newOos = !product.oos;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, oos: newOos } : p)),
    );

    const res = await updateProduct(product.id, { oos: newOos });
    if (res.error) {
      // Revert on failure
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, oos: product.oos } : p)),
      );
      alert(res.error);
    }
    setTogglingId(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  const FILTERS: { key: ActiveFilter; label: string }[] = [
    { key: 'all', label: t('All') },
    { key: 'active', label: t('Active') },
    { key: 'oos', label: t('Out of Stock') },
  ];

  return (
    <main className={styles.main}>

      <div className={styles.header}>
        <h1 className={styles.title}>{t('Products')}</h1>
        {!loading && (
          <span className={styles.count}>{total.toLocaleString()}</span>
        )}
        <div className={styles.controls}>
          <div className={styles.filterGroup}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                id={`products-filter-${f.key}`}
                type="button"
                className={`${styles.filterBtn} ${activeFilter === f.key ? styles.filterBtnActive : ''}`}
                onClick={() => handleFilterChange(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className={styles.search}>
            <Icon name="search" size={16} className={styles.searchIcon} />
            <input
              id="products-search"
              type="search"
              placeholder={t('Search products…')}
              className={styles.searchInput}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          {canManageProducts && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => navigate('/products/new')}
            >
              <Icon name="add" size={16} />
              {t('New Product')}
            </button>
          )}
        </div>
      </div>

      <Card>
        <div>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh label={t('Name')} sortKey="name" activeSort={sortBy} onSort={handleSort} className={styles.th} />
                <SortableTh label={t('Category')} sortKey="category" activeSort={sortBy} onSort={handleSort} className={styles.th} />
                <th className={styles.th}>{t('Grade')}</th>
                <SortableTh label={t('Brand')} sortKey="brand" activeSort={sortBy} onSort={handleSort} className={styles.th} />
                <th className={styles.th}>{t('Form / Pack')}</th>
                {canToggleOOS && (
                  <th className={styles.th}>{t('Active')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className={styles.stateRow}>
                  <td colSpan={canToggleOOS ? 6 : 5}>{t('Loading products…')}</td>
                </tr>
              ) : error ? (
                <tr className={styles.stateRow}>
                  <td colSpan={canToggleOOS ? 6 : 5}>Error: {error}</td>
                </tr>
              ) : products.length === 0 ? (
                <tr className={styles.stateRow}>
                  <td colSpan={canToggleOOS ? 6 : 5}>{t('No products found')}</td>
                </tr>
              ) : (
                products.map((p) => {
                  const isActive = !p.oos;
                  return (
                    <tr
                      key={p.id}
                      className={`${styles.orderRow} ${styles.clickable} ${!isActive ? styles.inactive : ''}`}
                      onClick={() => navigate(`/products/${p.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.td}>
                        <div className={styles.nameCell}>
                          <span className={styles.name}>{p.name}</span>
                          {p.accurate_name && p.accurate_name !== p.name && (
                            <span className={styles.accurateName}>{p.accurate_name}</span>
                          )}
                        </div>
                      </td>
                      <td className={styles.td}>
                        {p.category ? (
                          <span className={styles.pill}>{p.category}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.td}>{p.grade ?? '—'}</td>
                      <td className={styles.td}>{p.brand ?? '—'}</td>
                      <td className={styles.td}>
                        {[p.form, p.pack].filter(Boolean).join(' / ') || '—'}
                      </td>
                      {canToggleOOS && (
                        <td className={styles.td}>
                          <div
                            className={styles.toggleCell}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className={styles.toggleLabel}>
                              {isActive ? t('Active') : t('OOS')}
                            </span>
                            <Toggle
                              size="sm"
                              checked={isActive}
                              disabled={togglingId === p.id}
                              label={isActive ? t('Mark out of stock') : t('Mark active')}
                              onChange={() => handleToggleActive(p)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <footer className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t('Showing')} {rangeStart}–{rangeEnd} {t('of')} {total}
            </span>
            <div className={styles.pageControls}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label={t('Previous page')}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <span className={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label={t('Next page')}
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </footer>
        </div>
      </Card>
    </main>
  );
}
