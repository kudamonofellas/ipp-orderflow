import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { Avatar } from '../../components/Avatar/Avatar';
import { NotificationsPopover } from '../../components/NotificationsPopover/NotificationsPopover';
import { useAuth, useCurrentUserName } from '../../hooks/useAuth';
import logo from '../../assets/logo.svg';
import styles from './TopNav.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/orders', label: 'Orders', icon: 'orders' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
];

/** Fixed top navigation bar. Matches the Navigation baseline in ui-registry.md. */
export function TopNav() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const name = useCurrentUserName();
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className={styles.nav}>
      <div className={styles.brand}>
        <img src={logo} alt="" className={styles.logo} aria-hidden="true" />
        <span className={styles.brandName}>
          Inti Pangan
          <br />
          Perkasa
        </span>
      </div>

      <nav className={styles.links} aria-label="Primary">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [styles.link, isActive ? styles.linkActive : ''].filter(Boolean).join(' ')
            }
          >
            <Icon name={icon} size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.actions}>
        <div className={styles.search}>
          <Icon name="search" size={18} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search"
            className={styles.searchInput}
            aria-label="Search orders and messages"
          />
        </div>

        <NotificationsPopover />

        <button type="button" className={styles.iconButton} aria-label="Settings">
          <Icon name="settings" size={20} />
        </button>

        <div className={styles.user}>
          <Avatar initials={initials || '??'} label={name || (user?.email ?? '')} />
          <span className={styles.userMeta}>
            <span className={styles.userName}>{name || user?.email}</span>
            <span className={styles.userRole}>{role ?? ''}</span>
          </span>
        </div>

        <button
          type="button"
          className={styles.iconButton}
          aria-label="Sign out"
          title="Sign out"
          onClick={handleLogout}
        >
          <Icon name="logout" size={20} />
        </button>
      </div>
    </header>
  );
}
