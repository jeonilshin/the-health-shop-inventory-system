import React, { useContext, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ChangePassword from './ChangePassword';
import NotificationBell from './NotificationBell';
import api from '../utils/api';
import { 
  FiHome, 
  FiPackage, 
  FiSend, 
  FiShoppingCart, 
  FiFileText, 
  FiBarChart2,
  FiTruck,
  FiSettings,
  FiKey,
  FiLogOut,
  FiActivity,
  FiShield,
  FiMenu,
  FiX
} from 'react-icons/fi';

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (user?.location_id) {
      fetchLocationName();
    }
  }, [user]);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location]);

  const fetchLocationName = async () => {
    try {
      const response = await api.get('/locations');
      const loc = response.data.find(l => l.id === user.location_id);
      if (loc) {
        setLocationName(loc.name);
      }
    } catch (error) {
      console.error('Error fetching location:', error);
    }
  };

  const navItems = [
    { path: '/', icon: FiHome, label: 'Dashboard', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { path: '/inventory', icon: FiPackage, label: 'Inventory', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { path: '/transfers', icon: FiSend, label: 'Transfers', roles: ['admin', 'warehouse', 'branch_manager'] },
    { path: '/sales', icon: FiShoppingCart, label: 'Sales', roles: ['admin', 'branch_manager'] },
    { path: '/reports', icon: FiFileText, label: 'Reports', roles: ['admin', 'branch_manager', 'branch_staff'] },
    { path: '/analytics', icon: FiBarChart2, label: 'Analytics', roles: ['admin', 'branch_manager', 'branch_staff'] },
    { path: '/deliveries', icon: FiTruck, label: 'Deliveries', roles: ['admin', 'warehouse'] },
    { path: '/admin', icon: FiSettings, label: 'Admin', roles: ['admin'] },
    { path: '/audit', icon: FiShield, label: 'Audit Log', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <>
      {/* Top Header */}
      <div className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
          >
            {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FiActivity size={28} />
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                The Health Shop
              </h1>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>
                Inventory System
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="user-info-desktop">
            <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>
              {user?.full_name}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.85 }}>
              {user?.role.replace('_', ' ').toUpperCase()}
              {locationName && ` • ${locationName}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <NotificationBell />
            <button 
              className="header-btn"
              onClick={() => setShowChangePassword(true)}
              title="Change Password"
            >
              <FiKey size={16} />
            </button>
            <button 
              className="header-btn"
              onClick={logout}
              title="Logout"
            >
              <FiLogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <nav className="sidebar-nav">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <Icon size={20} />
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Info in Sidebar (Mobile) */}
        <div className="sidebar-footer">
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
            {user?.full_name}
          </div>
          <div style={{ fontSize: '10px', opacity: 0.7 }}>
            {user?.role.replace('_', ' ').toUpperCase()}
          </div>
          {locationName && (
            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
              {locationName}
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {showChangePassword && (
        <ChangePassword onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

export default Navbar;
