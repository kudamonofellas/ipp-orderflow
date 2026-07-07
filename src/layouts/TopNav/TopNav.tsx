import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '../../components/Avatar/Avatar';
import { NotificationsPopover } from '../../components/NotificationsPopover/NotificationsPopover';
import { currentUser } from '../../data/mockDashboard';
import logo from '../../assets/logo.svg';
import styles from './TopNav.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

/** Fixed top navigation bar. Matches the Navigation baseline in ui-registry.md. */
export function TopNav() {
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
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [styles.link, isActive ? styles.linkActive : ''].filter(Boolean).join(' ')
            }
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.actions}>
        <div className={styles.search}>
          <Search size={18} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search"
            className={styles.searchInput}
            aria-label="Search orders and messages"
          />
        </div>

        <NotificationsPopover />

        <button type="button" className={styles.iconButton} aria-label="Settings">
          <Settings size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <div className={styles.user}>
          <Avatar initials={currentUser.initials} label={currentUser.name} />
          <span className={styles.userMeta}>
            <span className={styles.userName}>{currentUser.name}</span>
            <span className={styles.userRole}>{currentUser.role}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
