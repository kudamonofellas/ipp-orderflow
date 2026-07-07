import { Outlet } from 'react-router-dom';
import { TopNav } from '../TopNav/TopNav';
import styles from './AppLayout.module.css';

/** App shell: fixed top nav + routed content area. */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
