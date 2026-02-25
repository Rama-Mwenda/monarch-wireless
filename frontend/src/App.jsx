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
import Sms from './pages/Sms';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/network"         element={<Network />} />
            <Route path="/network/clients" element={<LiveClients />} />
            <Route path="/packages"        element={<Packages />} />
            <Route path="/vouchers"        element={<Vouchers />} />
            <Route path="/users"           element={<Users />} />
            <Route path="/reports"         element={<Reports />} />
            <Route path="/sms"             element={<Sms />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}