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
  FiRefreshCw
} from 'react-icons/fi';

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const location = useLocation();

  const fetchLocationName = useCallback(async () => {
    try {
      const response = await api.get('/locations');
      const location = response.data.find(loc => loc.id === user.location_id);
      if (location) {
        setLocationName(location.name);
      }
    } catch (error) {
      // Error fetching location
    }
  }, [user]);

  const fetchUnreadMessages = useCallback(async () => {
    try {
      const response = await api.get('/messages/unread-count');
      setUnreadMessages(response.data.count);
    } catch (error) {
      // Error fetching unread messages
    }
  }, []);

  useEffect(() => {
    if (user?.location_id) {
      fetchLocationName();
    }
    fetchUnreadMessages();
    
    // Poll for unread messages every 10 seconds
    const interval = setInterval(fetchUnreadMessages, 10000);
    return () => clearInterval(interval);
  }, [user, fetchLocationName, fetchUnreadMessages]);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location]);

  const navItems = [
    { to: '/', icon: FiHome, label: 'Dashboard', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { to: '/inventory', icon: FiPackage, label: 'Inventory', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { to: '/transfers', icon: FiSend, label: 'Transfers', roles: ['admin', 'warehouse', 'branch_manager'] },
    { to: '/reports', icon: FiFileText, label: 'Reports', roles: ['admin', 'branch_manager', 'branch_staff'] },
    { to: '/analytics', icon: FiBarChart2, label: 'Analytics', roles: ['admin', 'branch_manager', 'branch_staff'] },
    { to: '/deliveries', icon: FiTruck, label: 'Deliveries', roles: ['admin', 'warehouse'] },
    { to: '/sales', icon: FiDollarSign, label: 'Sales', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { to: '/messages', icon: FiMessageSquare, label: 'Messages', roles: ['admin', 'warehouse', 'branch_manager', 'branch_staff'] },
    { to: '/admin', icon: FiSettings, label: 'Admin', roles: ['admin'] },
    { to: '/audit', icon: FiShield, label: 'Audit Log', roles: ['admin'] },
    { to: '/unit-conversions', icon: FiRefreshCw, label: 'Unit Conversions', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <>
      {/* Top Header */}
      <div className="top-header">
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
        </button>
        
        <div className="header-logo">
          <FiActivity size={24} />
          <div>
            <div className="header-title">The Health Shop</div>
            <div className="header-subtitle">Inventory System</div>
          </div>
        </div>

        <div className="header-actions">
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">
              {user?.role.replace('_', ' ').toUpperCase()}
              {locationName && <> • {locationName}</>}
            </div>
          </div>
          <NotificationBell />
          <button 
            className="header-btn"
            onClick={() => setShowChangePassword(true)}
            title="Change Password"
          >
            <FiKey size={18} />
          </button>
          <button 
            className="header-btn"
            onClick={logout}
            title="Logout"
          >
            <FiLogOut size={18} />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <nav className="sidebar-nav">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              end={item.to === '/'}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.to === '/messages' && unreadMessages > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '600',
                  minWidth: '20px',
                  textAlign: 'center'
                }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {showChangePassword && (
        <ChangePassword onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

export default Navbar;
