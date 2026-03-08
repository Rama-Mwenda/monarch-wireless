import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Packages from './pages/Packages';
import Vouchers from './pages/Vouchers';
import Users from './pages/Users';
import LiveClients from './pages/LiveClients';
import Settings from './pages/Settings';
import Sms from './pages/Sms';
import HostDashboard from './pages/HostDashboard';
import HostPricing from './pages/HostPricing';
import Network from './pages/Network';
import Reports from './pages/Reports';

// Wraps Layout — redirects if role not allowed
function LayoutGuard({ allow }) {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/login" replace />;
  if (!allow.includes(admin.role)) {
    // Send each role to their correct home rather than login
    if (admin.role === 'site_manager') return <Navigate to="/host" replace />;
    if (admin.role === 'viewer')       return <Navigate to="/overview" replace />;
    return <Navigate to="/" replace />;
  }
  return <Layout />;
}

function RootRedirect() {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.role === 'site_manager') return <Navigate to="/host" replace />;
  if (admin.role === 'viewer')       return <Navigate to="/overview" replace />;
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Super admin routes — path prefix "/" */}
          <Route element={<LayoutGuard allow={['super_admin']} />}>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/network"   element={<Network />} />
            <Route path="/packages"  element={<Packages />} />
            <Route path="/vouchers"  element={<Vouchers />} />
            <Route path="/users"     element={<Users />} />
            <Route path="/reports"   element={<Reports />} />
            <Route path="/sms"       element={<Sms />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="/clients"   element={<LiveClients />} />
          </Route>

          {/* Viewer routes — use /overview prefix to avoid path collision with super_admin */}
          <Route element={<LayoutGuard allow={['viewer']} />}>
            <Route path="/overview"          element={<Dashboard />} />
            <Route path="/overview/network"  element={<Network />} />
            <Route path="/overview/packages" element={<Packages readOnly />} />
            <Route path="/overview/reports"  element={<Reports />} />
            <Route path="/overview/settings" element={<Settings />} />
          </Route>

          {/* Host (site_manager) routes */}
          <Route element={<LayoutGuard allow={['site_manager']} />}>
            <Route path="/host"          element={<HostDashboard />} />
            <Route path="/host/pricing"  element={<HostPricing />} />
            <Route path="/host/clients"  element={<LiveClients />} />
            <Route path="/host/vouchers" element={<Vouchers />} />
            <Route path="/host/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}