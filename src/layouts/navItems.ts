/**
 * Shared primary-nav definition — the Sidebar (desktop) and BottomNav
 * (mobile) both render this exact same set, kept in one place so they can
 * never drift out of sync.
 */
import type { IconName } from "../components/Icon/icons";
import type { Capability } from "../lib/domain";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Hides the link entirely for a role lacking this capability — matches
   *  the prototype's Dev-Layout.jsx behavior (Sidebar/tab nav hides
   *  Customers/Products/Reports by capability). Omit for always-visible links. */
  cap?: Capability;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/orders", label: "Orders", icon: "orders" },
  {
    to: "/customers",
    label: "Customers",
    icon: "customers",
    cap: "browseCustomers",
  },
  {
    to: "/products",
    label: "Products",
    icon: "products",
    cap: "browseProducts",
  },
  { to: "/reports", label: "Reports", icon: "reports", cap: "accessReports" },
  { to: "/settings", label: "Settings", icon: "settings" },
];
