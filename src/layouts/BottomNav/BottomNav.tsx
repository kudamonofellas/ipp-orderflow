/**
 * BottomNav — mobile replacement for the desktop Sidebar. Fixed to the
 * bottom of the viewport, icon-only, same nav set as the Sidebar
 * (`NAV_ITEMS`) so the two stay in sync automatically. Shown/hidden purely
 * via CSS media query (`AppLayout.module.css`) — both are always mounted,
 * so there's no layout-shift flash on resize and no JS viewport detection
 * to keep in sync with the breakpoint.
 */

import { NavLink } from "react-router-dom";
import { Icon } from "../../components/Icon/Icon";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { NAV_ITEMS } from "../navItems";
import styles from "./BottomNav.module.css";

export function BottomNav() {
  const can = useCan();
  const { t } = useLanguage();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.cap || can(item.cap),
  );

  return (
    <nav className={styles.bottomNav} aria-label="Primary">
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
          aria-label={t(label)}
          title={t(label)}
        >
          <Icon name={icon} size={22} />
        </NavLink>
      ))}
    </nav>
  );
}
