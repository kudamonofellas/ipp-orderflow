import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppLayout } from './layouts/AppLayout/AppLayout';
import { SidebarProvider } from './layouts/Sidebar/Sidebar';
import { AuthProvider } from './hooks/RoleContext';
import { ThemeProvider } from './hooks/ThemeProvider';
import { LanguageProvider } from './hooks/LanguageProvider';
import { DialogProvider } from './hooks/DialogProvider';
import { useAuth, useCan } from './hooks/useAuth';
import type { Capability } from './lib/domain';
import { Customers } from './pages/Customers/Customers';
import { CustomerNew } from './pages/CustomerNew/CustomerNew';
import { CustomerDetail } from './pages/CustomerDetail/CustomerDetail';
import { CustomerEdit } from './pages/CustomerEdit/CustomerEdit';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Login } from './pages/Login/Login';
import { Orders } from './pages/Orders/Orders';
import { OrderNew } from './pages/OrderNew/OrderNew';
import { OrderDetail } from './pages/OrderDetail/OrderDetail';
import { OrderEdit } from './pages/OrderEdit/OrderEdit';
import { Products } from './pages/Products/Products';
import { ProductNew } from './pages/ProductNew/ProductNew';
import { ProductDetail } from './pages/ProductDetail/ProductDetail';
import { ProductEdit } from './pages/ProductEdit/ProductEdit';
import { PickList } from './pages/PickList/PickList';
import { CashUp } from './pages/CashUp/CashUp';
import { Deliveries } from './pages/Deliveries/Deliveries';
import { Reports } from './pages/Reports/Reports';
import { Settings } from './pages/Settings/Settings';
import { LearnedMatches } from './pages/LearnedMatches/LearnedMatches';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-muted)' }} />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/**
 * Route-level capability gate — redirects to `/` when the signed-in role
 * lacks `cap`. Auth itself is handled by `ProtectedRoute`, which this always
 * sits inside of; this only adds the capability check on top. Mirrors the
 * prototype's `<Guarded cap="...">` (Dev-App.jsx:25) — prototype-audit.md F-01.
 */
function Guarded({ cap, children }: { cap: Capability; children: ReactNode }) {
  const can = useCan();
  if (!can(cap)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-muted)' }} />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <Login />;
}

export default function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <DialogProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <ProtectedRoute>
                <SidebarProvider>
                  <AppLayout />
                </SidebarProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="/orders/new" element={<OrderNew />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="orders/:id/edit" element={<OrderEdit />} />
            <Route
              path="customers"
              element={
                <Guarded cap="browseCustomers">
                  <Customers />
                </Guarded>
              }
            />
            <Route
              path="customers/new"
              element={
                <Guarded cap="browseCustomers">
                  <CustomerNew />
                </Guarded>
              }
            />
            <Route
              path="customers/:id"
              element={
                <Guarded cap="browseCustomers">
                  <CustomerDetail />
                </Guarded>
              }
            />
            <Route path="customers/:id/edit" element={<CustomerEdit />} />
            <Route
              path="products"
              element={
                <Guarded cap="browseProducts">
                  <Products />
                </Guarded>
              }
            />
            <Route
              path="products/new"
              element={
                <Guarded cap="browseProducts">
                  <ProductNew />
                </Guarded>
              }
            />
            <Route
              path="products/:id"
              element={
                <Guarded cap="browseProducts">
                  <ProductDetail />
                </Guarded>
              }
            />
            <Route path="products/:id/edit" element={<ProductEdit />} />
            <Route
              path="reports"
              element={
                <Guarded cap="accessReports">
                  <Reports />
                </Guarded>
              }
            />
            <Route path="settings" element={<Settings />} />
            <Route
              path="settings/learned-matches"
              element={
                <Guarded cap="manageSettings">
                  <LearnedMatches />
                </Guarded>
              }
            />
            <Route
              path="picklist"
              element={
                <Guarded cap="viewPickList">
                  <PickList />
                </Guarded>
              }
            />
            <Route
              path="deliveries"
              element={
                <Guarded cap="viewDeliveryRun">
                  <Deliveries />
                </Guarded>
              }
            />
            <Route
              path="cashup"
              element={
                <Guarded cap="reconcileCOD">
                  <CashUp />
                </Guarded>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </DialogProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

