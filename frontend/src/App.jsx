import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Packages from './pages/Packages';
import Vouchers from './pages/Vouchers';
import Users from './pages/Users';
import Network from './pages/Network';
import LiveClients from './pages/LiveClients';
import Reports from './pages/Reports';
import Sms      from './pages/Sms';
import Settings       from './pages/Settings';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"           element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route element={<Layout />}>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/network"         element={<Network />} />
            <Route path="/network/clients" element={<LiveClients />} />
            <Route path="/packages"        element={<Packages />} />
            <Route path="/vouchers"        element={<Vouchers />} />
            <Route path="/users"           element={<Users />} />
            <Route path="/reports"         element={<Reports />} />
            <Route path="/sms"             element={<Sms />} />
            <Route path="/settings"        element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}