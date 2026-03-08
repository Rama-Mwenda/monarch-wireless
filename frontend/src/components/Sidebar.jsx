import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Wifi, Package, Users, TrendingUp,
  Ticket, BarChart2, LogOut, Settings as SettingsIcon, MessageSquare, X
} from 'lucide-react';
import styles from './Sidebar.module.css';

// Nav items by role
const superAdminNav = [
  { to: '/',          icon: LayoutDashboard, label: 'Overview'  },
  { to: '/network',   icon: Wifi,            label: 'Network'   },
  { to: '/packages',  icon: Package,         label: 'Packages'  },
  { to: '/vouchers',  icon: Ticket,          label: 'Vouchers'  },
  { to: '/users',     icon: Users,           label: 'Users'     },
  { to: '/reports',   icon: BarChart2,       label: 'Reports'   },
  { to: '/sms',       icon: MessageSquare,   label: 'SMS'       },
  { to: '/settings',  icon: SettingsIcon,    label: 'Settings'  },
];

const viewerNav = [
  { to: '/overview',          icon: LayoutDashboard, label: 'Overview' },
  { to: '/overview/network',  icon: Wifi,            label: 'Network'  },
  { to: '/overview/reports',  icon: BarChart2,       label: 'Reports'  },
  { to: '/overview/packages', icon: Package,         label: 'Packages' },
  { to: '/overview/settings', icon: SettingsIcon,    label: 'Settings' },
];

const hostNav = [
  { to: '/host',          icon: LayoutDashboard, label: 'My Revenue' },
  { to: '/host/pricing',  icon: Package,         label: 'Pricing'    },
  { to: '/host/clients',  icon: Users,           label: 'Clients'    },
  { to: '/host/vouchers', icon: Ticket,          label: 'Vouchers'   },
  { to: '/host/settings', icon: SettingsIcon,    label: 'Settings'   },
];

export default function Sidebar({ open, onClose }) {
  const { admin, logout } = useAuth();
  const isHost   = admin?.role === 'site_manager';
  const isViewer = admin?.role === 'viewer';
  const nav = isHost ? hostNav : isViewer ? viewerNav : superAdminNav;
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className={styles.overlay} onClick={onClose} />}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>M</div>
          <div className={styles.logoText}>
            <span className={styles.logoName}>Monarch</span>
            <span className={styles.logoSub}>Wireless</span>
          </div>
          {/* Close button — mobile only */}
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {nav.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              {React.createElement(icon, { size: 16, strokeWidth: 1.8 })}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.bottom}>
          <div className={styles.adminBadge}>
            <div className={styles.adminAvatar}>
              {admin?.username?.[0]?.toUpperCase()}
            </div>
            <div className={styles.adminInfo}>
              <div className={styles.adminName}>{admin?.username}</div>
              <div className={styles.adminRole}>{admin?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <button className={styles.logout} onClick={handleLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}