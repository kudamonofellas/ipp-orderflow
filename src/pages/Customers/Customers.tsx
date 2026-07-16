import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { readCustomers } from '../../lib/directus';
import type { CustomersCollection } from '../../types/directus';
import styles from './Customers.module.css';

const PAGE_SIZE = 20;

/** Customers list page: searchable table of all customer records. */
export function Customers() {
  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const load = async () => {
      const filter: Record<string, unknown> = {};
      if (search.trim()) {
        filter['_or'] = [
          { name: { _icontains: search.trim() } },
          { company_name: { _icontains: search.trim() } },
          { contact: { _icontains: search.trim() } },
          { area: { _icontains: search.trim() } },
        ];
      }

      const [dataRes, countRes] = await Promise.all([
        readCustomers({
          filter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          sort: ['name'],
          fields: ['id', 'name', 'company_name', 'channel', 'contact', 'area', 'pay_method', 'term_days'],
        }),
        readCustomers({
          filter,
          limit: -1,
          fields: ['id'],
        }),
      ]);

      if (dataRes.error) {
        setError(dataRes.error);
      } else {
        setCustomers(dataRes.data ?? []);
        setTotal(countRes.data?.length ?? 0);
      }
      setLoading(false);
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, search ? 300 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page]);

  // Reset to page 1 when search changes
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Customers</h1>
        {!loading && (
          <span className={styles.count}>{total.toLocaleString()}</span>
        )}
        <div className={styles.controls}>
          <div className={styles.search}>
            <Icon name="search" size={16} className={styles.searchIcon} />
            <input
              id="customers-search"
              type="search"
              placeholder="Search name, company, area…"
              className={styles.searchInput}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Name / Company</th>
              <th className={styles.th}>Channel</th>
              <th className={styles.th}>Contact</th>
              <th className={styles.th}>Area</th>
              <th className={styles.th}>Payment</th>
              <th className={styles.th}>Term</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>Loading customers…</td>
              </tr>
            ) : error ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>Error: {error}</td>
              </tr>
            ) : customers.length === 0 ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>No customers found</td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className={styles.tr}>
                  <td className={styles.td}>
                    <div className={styles.nameCell}>
                      <span className={styles.name}>{c.name}</span>
                      {c.company_name && (
                        <span className={styles.company}>{c.company_name}</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.td}>
                    {c.channel ? (
                      <span
                        className={styles.channelPill}
                        data-channel={c.channel}
                      >
                        {c.channel}
                      </span>
                    ) : (
                      <span className={styles.channelPill}>—</span>
                    )}
                  </td>
                  <td className={styles.td}>{c.contact ?? '—'}</td>
                  <td className={styles.td}>{c.area ?? '—'}</td>
                  <td className={styles.td}>{c.pay_method ?? '—'}</td>
                  <td className={styles.td}>
                    {c.term_days != null ? `${c.term_days}d` : '—'}
                  </td>
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
