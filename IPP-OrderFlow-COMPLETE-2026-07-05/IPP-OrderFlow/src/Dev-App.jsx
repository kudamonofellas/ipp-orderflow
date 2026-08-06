import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './lib/store.jsx'
import { can } from './lib/domain.js'
import Layout from './components/Layout.jsx'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import Orders from './screens/Orders.jsx'
import OrderDetail from './screens/OrderDetail.jsx'
import OrderEdit from './screens/OrderEdit.jsx'
import ChannelSelect from './screens/ChannelSelect.jsx'
import Intake from './screens/Intake.jsx'
import Settings from './screens/Settings.jsx'
import Customers from './screens/Customers.jsx'
import CustomerDetail from './screens/CustomerDetail.jsx'
import Products from './screens/Products.jsx'
import ProductDetail from './screens/ProductDetail.jsx'
import Reports from './screens/Reports.jsx'
import CashUp from './screens/CashUp.jsx'
import Deliveries from './screens/Deliveries.jsx'
import PickList from './screens/PickList.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'

// Route-level permission guard — real gating (not just hidden buttons). Lacking the capability
// bounces the user home instead of rendering a screen they shouldn't reach by URL.
function Guarded({ cap, children }) {
  const { user, settings } = useStore()
  return can(user.role, cap, settings) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user } = useStore()
  if (!user) return <><Login /><UpdateBanner /></>
  return (
    <>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/orders/:id/edit" element={<Guarded cap="editOrders"><OrderEdit /></Guarded>} />
        <Route path="/new" element={<Guarded cap="createOrders"><ChannelSelect /></Guarded>} />
        <Route path="/new/intake" element={<Guarded cap="createOrders"><Intake /></Guarded>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/customers" element={<Guarded cap="browseCustomers"><Customers /></Guarded>} />
        <Route path="/customers/:id" element={<Guarded cap="browseCustomers"><CustomerDetail /></Guarded>} />
        <Route path="/products" element={<Guarded cap="browseProducts"><Products /></Guarded>} />
        <Route path="/products/new" element={<Guarded cap="manageProducts"><ProductDetail /></Guarded>} />
        <Route path="/products/:id" element={<Guarded cap="browseProducts"><ProductDetail /></Guarded>} />
        <Route path="/reports" element={<Guarded cap="accessReports"><Reports /></Guarded>} />
        <Route path="/cashup" element={<Guarded cap="reconcileCOD"><CashUp /></Guarded>} />
        <Route path="/deliveries" element={<Deliveries />} />
        <Route path="/picklist" element={<PickList />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
    <UpdateBanner />
    </>
  )
}
