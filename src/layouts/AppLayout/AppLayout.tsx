import { Outlet } from 'react-router-dom';
import { PullToRefresh } from '../../components/PullToRefresh/PullToRefresh';
import { Sidebar } from '../Sidebar/Sidebar';
import { BottomNav } from '../BottomNav/BottomNav';
import styles from './AppLayout.module.css';

/** App shell: collapsible sidebar + routed content area that pushes with it.
 *  Below the mobile breakpoint, the Sidebar hides and `BottomNav` (a fixed
 *  bar) takes over navigation instead — both are always mounted, switched
 *  purely by CSS media query (see AppLayout.module.css), so there's no
 *  layout flash or JS viewport check to keep in sync with the breakpoint. */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <PullToRefresh />
      <Sidebar />
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
