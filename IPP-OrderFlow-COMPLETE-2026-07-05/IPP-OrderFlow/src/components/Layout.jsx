import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { LayoutDashboard, ClipboardList, Users, Package, BarChart3, Settings, LogOut, Crown } from 'lucide-react'
import { Logo } from './Logo.jsx'
import { can } from '../lib/domain.js'
import { BUILD_TIME } from '../buildinfo.js'

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/customers', label: 'Customers', icon: Users, cap: 'browseCustomers' },
  { to: '/products', label: 'Products', icon: Package, cap: 'browseProducts' },
  { to: '/reports', label: 'Reports', icon: BarChart3, cap: 'accessReports' },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  const { user, logout, t, settings } = useStore()
  const nav = useNavigate()
  const navItems = NAV.filter((n) => !n.cap || can(user?.role, n.cap, settings))
  return (
    <div className="deskshell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Logo size={26} /> IPP OrderFlow</div>
        <nav className="sidebar-nav">
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>
              <n.icon size={18} /> {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="nav" style={{ cursor: 'default' }}>
            {user?.role === 'Owner' ? <Crown size={16} /> : null} {user?.name} · {t(user?.role)}
          </div>
          <div className="nav" onClick={() => { logout(); nav('/login') }}><LogOut size={16} /> {t('Log out')}</div>
          <div className="tiny muted" style={{ padding: '6px 12px 2px', fontVariantNumeric: 'tabular-nums' }} title={t('The build your browser is running. If a new feature is missing, hard-refresh (Ctrl+Shift+R) and check this changes.')}>{t('build')} {BUILD_TIME}</div>
        </div>
      </aside>

      <div className="content" style={{ flex: 1, minWidth: 0 }}>
        {/* mobile top bar */}
        <div className="mobnav topbar" style={{ margin: '-0px 0 0' }}>
          <span className="title brand"><Logo size={24} /> IPP OrderFlow</span>
          <span className="spacer" />
          <span className="chip">{user?.name} · {t(user?.role)}</span>
          <LogOut size={18} style={{ color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => { logout(); nav('/login') }} />
        </div>
        <Outlet />
      </div>

      {/* mobile bottom nav — the sidebar is hidden < 900px, so this is how phones navigate */}
      <nav className="mobtabs">
        {navItems.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'mobtab' + (isActive ? ' active' : '')}>
            <n.icon size={20} /> <span>{t(n.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
