import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { readProducts, updateProduct } from '../../lib/directus';
import { useAuth } from '../../hooks/useAuth';
import type { ProductsCollection } from '../../types/directus';
import styles from './Products.module.css';

const PAGE_SIZE = 25;

type ActiveFilter = 'all' | 'active' | 'oos';

/** Products page: searchable, filterable list. Warehouse/Admin/Owner can toggle OOS. */
export function Products() {
  const { can } = useAuth();
  const canToggleOOS = can('manage_products');

  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
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
      parts.push({ active: { _eq: true } });
    } else if (activeFilter === 'oos') {
      parts.push({ _or: [{ active: { _eq: false } }, { active: { _null: true } }] });
    }

    return parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { _and: parts };
  }, [search, activeFilter]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const load = async () => {
      const filter = buildFilter();

      const [dataRes, countRes] = await Promise.all([
        readProducts({
          filter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          sort: ['name'],
          fields: ['id', 'name', 'accurate_name', 'category', 'brand', 'form', 'pack', 'active'],
        }),
        readProducts({
          filter,
          limit: -1,
          fields: ['id'],
        }),
      ]);

      if (dataRes.error) {
        setError(dataRes.error);
      } else {
        setProducts(dataRes.data ?? []);
        setTotal(countRes.data?.length ?? 0);
      }
      setLoading(false);
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, search ? 300 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page, activeFilter, buildFilter]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (f: ActiveFilter) => {
    setActiveFilter(f);
    setPage(1);
  };

  const handleToggleActive = async (product: ProductsCollection) => {
    if (!canToggleOOS) return;
    setTogglingId(product.id);
    const newValue = !product.active;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, active: newValue } : p)),
    );

    const res = await updateProduct(product.id, { active: newValue });
    if (res.error) {
      // Revert on failure
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: product.active } : p)),
      );
    }
    setTogglingId(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const FILTERS: { key: ActiveFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'oos', label: 'Out of Stock' },
  ];

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Products</h1>
        {!loading && (
          <span className={styles.count}>{total.toLocaleString()}</span>
        )}
        <div className={styles.controls}>
          <div className={styles.filterGroup}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                id={`products-filter-${f.key}`}
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
              placeholder="Search products…"
              className={styles.searchInput}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Category</th>
              <th className={styles.th}>Brand</th>
              <th className={styles.th}>Form / Pack</th>
              {canToggleOOS && (
                <th className={`${styles.th} ${styles.right}`}>Active</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.stateRow}>
                <td colSpan={canToggleOOS ? 5 : 4}>Loading products…</td>
              </tr>
            ) : error ? (
              <tr className={styles.stateRow}>
                <td colSpan={canToggleOOS ? 5 : 4}>Error: {error}</td>
              </tr>
            ) : products.length === 0 ? (
              <tr className={styles.stateRow}>
                <td colSpan={canToggleOOS ? 5 : 4}>No products found</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className={`${styles.tr} ${p.active === false ? styles.inactive : ''}`}
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
                  <td className={styles.td}>{p.brand ?? '—'}</td>
                  <td className={styles.td}>
                    {[p.form, p.pack].filter(Boolean).join(' / ') || '—'}
                  </td>
                  {canToggleOOS && (
                    <td className={`${styles.td} ${styles.right}`}>
                      <button
                        id={`product-toggle-${p.id}`}
                        className={styles.toggle}
                        onClick={() => handleToggleActive(p)}
                        disabled={togglingId === p.id}
                        aria-label={p.active ? 'Mark out of stock' : 'Mark active'}
                        title={p.active ? 'Mark out of stock' : 'Mark active'}
                      >
                        <span className={styles.toggleLabel}>
                          {p.active ? 'Active' : 'OOS'}
                        </span>
                        <span className={`${styles.toggleTrack} ${p.active ? styles.on : ''}`}>
                          <span className={styles.toggleThumb} />
                        </span>
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && !error && totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className={styles.pageInfo}>
              {page} / {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
