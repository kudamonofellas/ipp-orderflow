/**
 * Sidebar — collapsible left navigation that replaces the horizontal TopNav.
 *
 * Expanded = 260px wide (logo + text labels).
 * Collapsed = 72px wide (logo + icons only).
 * State persisted in `localStorage` key `ipp_sidebar_collapsed`.
 * Pushes the main content area (no overlay) via the SidebarContext.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { Avatar } from '../../components/Avatar/Avatar';
import { Button } from '../../components/Button/Button';
import { useAuth, useCurrentUserName } from '../../hooks/useAuth';
import { SidebarContext, type SidebarState } from './sidebar-context';
import { useSidebar } from './useSidebar';
import logo from '../../assets/logo.svg';
import styles from './Sidebar.module.css';

const STORAGE_KEY = 'ipp_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/orders', label: 'Orders', icon: 'orders' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/products', label: 'Products', icon: 'products' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore (private mode etc.)
      }
      return next;
    });
  }, []);

  const value = useMemo<SidebarState>(() => ({ collapsed, toggle }), [collapsed, toggle]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
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
    <aside className={[styles.sidebar, collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}>
      <div className={styles.logoSection}>
        <img src={logo} alt="" className={styles.logo} aria-hidden="true" />
        {!collapsed && (
          <span className={styles.brandName}>
            Inti Pangan
            <br />
            Perkasa
          </span>
        )}
      </div>

      <nav className={styles.nav} aria-label="Primary">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [styles.link, isActive ? styles.linkActive : ''].filter(Boolean).join(' ')
            }
            title={collapsed ? label : undefined}
          >
            <Icon name={icon} size={20} />
            {!collapsed && <span className={styles.linkLabel}>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        className={styles.collapseBtn}
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
      </button>
      <Button
        variant="ghost"
        size="md"
        onClick={handleLogout}
        aria-label="Sign out"
        title="Sign out"
        className={styles.logoutBtn}
      >
        <Icon name="logout" size={18} />
        {!collapsed && <span>Sign out</span>}
      </Button>

      <div className={styles.separator} />

      <div className={styles.bottomSection}>
        <div className={styles.userBlock} title={name || user?.email}>
          <Avatar initials={initials || '??'} label={name || (user?.email ?? '')} />
          {!collapsed && (
            <span className={styles.userMeta}>
              <span className={styles.userName}>{name || user?.email}</span>
              <span className={styles.userRole}>{role ?? ''}</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
