import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout/AppLayout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Placeholder } from './pages/Placeholder/Placeholder';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Placeholder title="Orders" />} />
          <Route path="customers" element={<Placeholder title="Customers" />} />
          <Route path="reports" element={<Placeholder title="Reports" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
