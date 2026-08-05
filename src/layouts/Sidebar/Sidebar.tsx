/**
 * Sidebar — collapsible left navigation that replaces the horizontal TopNav.
 *
 * Expanded = 260px wide (logo + text labels).
 * Collapsed = 72px wide (logo + icons only).
 * State persisted in `localStorage` key `ipp_sidebar_collapsed`.
 * Pushes the main content area (no overlay) via the SidebarContext.
 */

import { Link } from 'react-router-dom';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon/Icon';
import type { IconName } from '../../components/Icon/icons';
import { Avatar } from '../../components/Avatar/Avatar';
import { Button } from '../../components/Button/Button';
import { getInitials } from '../../lib/initials';
import { useAuth, useCurrentUserName } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { SidebarContext, type SidebarState } from './sidebar-context';
import { useSidebar } from './useSidebar';
import { Logo } from '../../components/Logo/Logo';
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
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const name = useCurrentUserName();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className={[styles.sidebar, collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}>
      <Link
        to="/"
        className={styles.logoSection}
        aria-label="Inti Pangan Perkasa - Home"
      >
        <Logo className={styles.logo} />
        {!collapsed && (
          <span className={styles.brandName}>
            Inti Pangan
            <br />
            Perkasa
          </span>
        )}
      </Link>

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
      <Button
        type="button"
        variant="tertiary"
        size="md"
        icon={collapsed ? 'chevronRight' : 'chevronLeft'}
        iconOnly
        style={{
          backgroundColor: "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "var(--space-sm) auto",
        }}
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      />
      <Button
        type="button"
        variant="tertiary"
        size="md"
        icon={theme === 'dark' ? 'sun' : 'moon'}
        iconOnly
        style={{
          backgroundColor: "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "var(--space-sm) auto",
        }}
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      />
      <Button
        variant="tertiary"
        size="md"
        onClick={handleLogout}
        icon="logout"
        style={{
          backgroundColor: "transparent",
          width: "100%",
        }}
        aria-label="Sign out"
        title="Sign out"
        className={styles.logoutBtn}
      >
        {!collapsed && <span>Sign out</span>}
      </Button>

      <div className={styles.separator} />

      <div className={styles.bottomSection}>
        <div className={styles.userBlock} title={name || user?.email}>
          <Avatar
          initials={getInitials(name) || '??'}
          label={name || (user?.email ?? '')}
          size="md"
           />
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
