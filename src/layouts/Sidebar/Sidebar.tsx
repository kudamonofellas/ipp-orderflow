/**
 * Sidebar — collapsible left navigation that replaces the horizontal TopNav.
 *
 * Expanded = 260px wide (logo + text labels).
 * Collapsed = 72px wide (logo + icons only).
 * State persisted in `localStorage` key `ipp_sidebar_collapsed`.
 * Pushes the main content area (no overlay) via the SidebarContext.
 */

import { Link } from "react-router-dom";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "../../components/Icon/Icon";
import { AvatarMenu } from "../../components/AvatarMenu/AvatarMenu";
import { Button } from "../../components/Button/Button";
import { useAuth, useCan, useCurrentUserName } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useTheme } from "../../hooks/useTheme";
import { SidebarContext, type SidebarState } from "./sidebar-context";
import { useSidebar } from "./useSidebar";
import { Logo } from "../../components/Logo/Logo";
import { NAV_ITEMS } from "../navItems";
import styles from "./Sidebar.module.css";

const STORAGE_KEY = "ipp_sidebar_collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
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

  const value = useMemo<SidebarState>(
    () => ({ collapsed, toggle }),
    [collapsed, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, role } = useAuth();
  const name = useCurrentUserName();
  const can = useCan();
  const { t } = useLanguage();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.cap || can(item.cap),
  );

  return (
    <aside
      className={[styles.sidebar, collapsed ? styles.collapsed : ""]
        .filter(Boolean)
        .join(" ")}
    >
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
        {visibleNavItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [styles.link, isActive ? styles.linkActive : ""]
                .filter(Boolean)
                .join(" ")
            }
            title={collapsed ? t(label) : undefined}
          >
            <Icon name={icon} size={20} />
            {!collapsed && <span className={styles.linkLabel}>{t(label)}</span>}
          </NavLink>
        ))}
      </nav>
      <div className={styles.separator} />
      <div className={styles.bottomControls}>
        <Button
          type="button"
          variant="tertiary"
          size="md"
          icon={collapsed ? "circleArrowRight" : "circleArrowLeft"}
          style={{
            backgroundColor: "transparent",
            gap: "var(--space-md)",
          }}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : t("Collapse")}
        >
          {!collapsed && <span>{t("Collapse")}</span>}
        </Button>

        <Button
          type="button"
          variant="tertiary"
          size="md"
          icon={theme === "dark" ? "sun" : "moon"}
          style={{
            backgroundColor: "transparent",
            gap: "var(--space-md)",
          }}
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={theme === "dark" ? t("Light mode") : t("Dark mode")}
        >
          {!collapsed && (
            <span>{theme === "dark" ? t("Light mode") : t("Dark mode")}</span>
          )}
        </Button>
      </div>

      <div className={styles.separator} />

      {/* Log out lives in the avatar menu now, alongside Change password —
          it used to be a standalone button in `bottomControls` above. The
          theme toggle stays up there, so this menu opts out of its own. */}
      <div className={styles.bottomSection}>
        <div className={styles.userBlock} title={name || user?.email}>
          <AvatarMenu placement="up" showThemeToggle={false} />
          {!collapsed && (
            <span className={styles.userMeta}>
              <span className={styles.userName}>{name || user?.email}</span>
              <span className={styles.userRole}>{role ?? ""}</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
