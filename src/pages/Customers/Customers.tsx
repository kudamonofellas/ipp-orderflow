import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button/Button';
import { Icon } from '../../components/Icon/Icon';
import { Card } from '../../components/Card/Card';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { Avatar } from '../../components/Avatar/Avatar';
import { getInitials } from '../../lib/initials';
import { readCustomers, aggregateCustomers } from '../../lib/directus';
import type { CustomersCollection } from '../../types/directus';
import styles from './Customers.module.css';


const PAGE_SIZE = 20;

/** Customers list page: searchable table of all customer records. */
export function Customers() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();
  const canManage = auth.can('manage_customers');
  const canView = auth.can('browseCustomers');

  // Defence-in-depth: the route is already wrapped in <Guarded cap="browseCustomers">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate('/', { replace: true });
  }, [canView, navigate]);

  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

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
        aggregateCustomers({
          aggregate: { count: '*' },
          ...(Object.keys(filter).length ? { query: { filter } } : {}),
        }),
      ]);

      if (dataRes.error) {
        setError(dataRes.error);
      } else {
        setCustomers(dataRes.data ?? []);
        if (countRes.error) {
          // Count failed independently of the data fetch — don't block the
          // list from rendering, but don't silently claim a total of 0 either.
          console.warn('Failed to fetch customer count:', countRes.error);
          setTotal(dataRes.data?.length ?? 0);
        } else {
          const countValue = Number(countRes.data?.[0]?.count ?? 0);
          setTotal(Number.isNaN(countValue) ? 0 : countValue);
        }
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
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('Customers')}</h1>
        {!loading && (
          <span className={styles.count}>{total.toLocaleString()}</span>
        )}
        <div className={styles.controls}>
          <div className={styles.search}>
            <Icon name="search" size={16} className={styles.searchIcon} />
            <input
              id="customers-search"
              type="search"
              placeholder={t('Search name, company, area…')}
              className={styles.searchInput}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <Button
              type="button"
              variant="primary"
              icon="add"
              onClick={() => navigate('/customers/new')}
            >
              {t('New Customer')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>{t('Name / Company')}</th>
              <th className={styles.th}>{t('Channel')}</th>
              <th className={styles.th}>{t('Contact')}</th>
              <th className={styles.th}>{t('Area')}</th>
              <th className={styles.th}>{t('Payment')}</th>
              <th className={styles.th}>{t('Term')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>{t('Loading customers…')}</td>
              </tr>
            ) : error ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>Error: {error}</td>
              </tr>
            ) : customers.length === 0 ? (
              <tr className={styles.stateRow}>
                <td colSpan={6}>{t('No customers found')}</td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  className={`${styles.orderRow} ${styles.clickable}`}
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <td className={styles.td}>
                    <div className={styles.nameCell}>
                      
                        <Avatar
                          initials={getInitials(c.name) || '??'}
                          label={c.name || ''}
                          size="md"
                        />
                      
                      <span style={{ display: 'flex', flexDirection: 'column' }}>

                      <span className={styles.name}>{c.name}</span>
                      {c.company_name && (
                        <span className={styles.company}>{c.company_name}</span>
                      )}
                      </span>
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

        <footer className={styles.pagination}>
          <span className={styles.pageInfo}>
            {t('Showing')} {rangeStart}–{rangeEnd} {t('of')} {total}
          </span>
          <div className={styles.pageControls}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              icon="chevronLeft"
              onClick={() => setPage?.(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label={t('Previous page')}
            >
              <Icon name="chevronLeft" size={16} />
            </Button>
            <span className={styles.pageIndicator}>
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              icon="chevronRight"
              onClick={() => setPage?.(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label={t('Next page')}
            >
              <Icon name="chevronRight" size={16} />
            </Button>
          </div>
        </footer>


      </Card>
    </main>
  );
}

