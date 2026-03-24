import React, { useContext, useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ChangePassword from './ChangePassword';
import NotificationBell from './NotificationBell';
import api from '../utils/api';
import {
  FiHome,
  FiPackage,
  FiSend,
  FiFileText,
  FiBarChart2,
  FiTruck,
  FiDollarSign,
  FiMessageSquare,
  FiSettings,
  FiKey,
  FiLogOut,
  FiActivity,
  FiShield,
  FiMenu,
  FiX,
  FiRefreshCw,
  FiAlertTriangle,
} from 'react-icons/fi';

/* Generate initials from a full name */
function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');
}

/* Role → display label */
function formatRole(role = '') {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* Role → color for avatar background */
function avatarColor(role = '') {
  const map = {
    admin: 'rgba(239,68,68,0.25)',
    warehouse: 'rgba(59,130,246,0.25)',
    branch_manager: 'rgba(16,185,129,0.25)',
    branch_staff: 'rgba(245,158,11,0.25)',
  };
  return map[role] || 'rgba(255,255,255,0.2)';
}

const NAV_ITEMS = [
  { to: '/',                icon: FiHome,        label: 'Dashboard',       roles: ['admin','warehouse','branch_manager','branch_staff'] },
  { to: '/sales',           icon: FiDollarSign,  label: 'Sales',           roles: ['admin','warehouse','branch_manager','branch_staff'] },
  { to: '/inventory',       icon: FiPackage,     label: 'Inventory',       roles: ['admin','warehouse','branch_manager','branch_staff'] },
  { to: '/transfers',       icon: FiSend,        label: 'Transfers',       roles: ['admin','warehouse','branch_manager'] },
  { to: '/reports',         icon: FiFileText,    label: 'Reports',         roles: ['admin','branch_manager','branch_staff'] },
  { to: '/analytics',       icon: FiBarChart2,   label: 'Analytics',       roles: ['admin','branch_manager','branch_staff'] },
  { to: '/deliveries',      icon: FiTruck,       label: 'Deliveries',      roles: ['admin','warehouse','branch_manager'] },
  { to: '/discrepancy',     icon: FiAlertTriangle, label: 'Discrepancy',   roles: ['admin','branch_manager','branch_staff'] },
  { to: '/messages',        icon: FiMessageSquare, label: 'Messages',      roles: ['admin','warehouse','branch_manager','branch_staff'] },
  { to: '/admin',           icon: FiSettings,    label: 'Admin',           roles: ['admin'] },
  { to: '/audit',           icon: FiShield,      label: 'Audit Log',       roles: ['admin'] },
  { to: '/unit-conversions',icon: FiRefreshCw,   label: 'Unit Conversions',roles: ['admin'] },
];

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [counts, setCounts] = useState({
    messages: 0,
    transfers: 0,
    deliveries: 0,
    discrepancies: 0
  });
  const location = useLocation();

  const fetchLocationName = useCallback(async () => {
    try {
      const res = await api.get('/locations');
      const loc = res.data.find(l => l.id === user.location_id);
      if (loc) setLocationName(loc.name);
    } catch { /* ignore */ }
  }, [user]);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await api.get('/counts');
      setCounts(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (user?.location_id) fetchLocationName();
    fetchCounts();
    // Poll counts every 5 seconds for real-time updates
    const interval = setInterval(fetchCounts, 5000);
    return () => clearInterval(interval);
  }, [user, fetchLocationName, fetchCounts]);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location]);

  const filteredItems = NAV_ITEMS.filter(item => item.roles.includes(user?.role));
  const initials = getInitials(user?.full_name);

  return (
    <>
      {/* ── Top Header ── */}
      <div className="top-header">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {sidebarOpen ? <FiX size={19} /> : <FiMenu size={19} />}
        </button>

        <div className="header-logo">
          <div className="header-logo-icon">
            <FiActivity size={20} color="white" />
          </div>
          <div>
            <div className="header-title">
              The Health Shop
              <span className="header-version">v0.0.7</span>
            </div>
            <div className="header-subtitle">Inventory System</div>
          </div>
        </div>

        <div className="header-actions">
          {/* User info (desktop only — hidden via CSS on mobile) */}
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">
              {formatRole(user?.role)}
              {locationName && <> · {locationName}</>}
            </div>
          </div>

          {/* Avatar */}
          <div
            className="user-avatar"
            title={`${user?.full_name} — ${formatRole(user?.role)}`}
            style={{ background: avatarColor(user?.role) }}
          >
            {initials || '?'}
          </div>

          <NotificationBell />

          <button
            className="header-btn"
            onClick={() => setShowChangePassword(true)}
            title="Change Password"
          >
            <FiKey size={17} />
          </button>

          <button
            className="header-btn danger"
            onClick={logout}
            title="Logout"
          >
            <FiLogOut size={17} />
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`} aria-label="Main navigation">
        <nav className="sidebar-nav">
          {filteredItems.map((item) => {
            // Determine badge count for this item
            let badgeCount = 0;
            if (item.to === '/messages') badgeCount = counts.messages;
            else if (item.to === '/transfers' && user.role === 'admin') badgeCount = counts.transfers;
            else if (item.to === '/deliveries') badgeCount = counts.deliveries;
            else if (item.to === '/discrepancy' && user.role === 'admin') badgeCount = counts.discrepancies;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                end={item.to === '/'}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span className="sidebar-link-badge">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {showChangePassword && (
        <ChangePassword onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

export default Navbar;
