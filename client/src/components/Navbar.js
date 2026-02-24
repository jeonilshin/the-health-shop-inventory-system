import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  FiShield
} from 'react-icons/fi';

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [locationName, setLocationName] = useState('');

  useEffect(() => {
    if (user?.location_id) {
      fetchLocationName();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchLocationName = async () => {
    try {
      const response = await api.get('/locations');
      const location = response.data.find(loc => loc.id === user.location_id);
      if (location) {
        setLocationName(location.name);
      }
    } catch (error) {
      console.error('Error fetching location:', error);
    }
  };

  return (
    <>
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
          {/* Logo and Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FiActivity size={32} />
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                The Health Shop
              </h1>
              <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
                Inventory System
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            alignItems: 'center',
            flex: 1,
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <Link to="/">
              <FiHome size={16} />
              Dashboard
            </Link>
            <Link to="/inventory">
              <FiPackage size={16} />
              Inventory
            </Link>
            {(user?.role === 'admin' || user?.role === 'warehouse' || user?.role === 'branch_manager') && (
              <Link to="/transfers">
                <FiSend size={16} />
                Transfers
              </Link>
            )}
            {(user?.role === 'admin' || user?.role === 'branch_manager') && (
              <Link to="/sales">
                <FiShoppingCart size={16} />
                Sales
              </Link>
            )}
            {(user?.role === 'admin' || user?.role === 'branch_manager' || user?.role === 'branch_staff') && (
              <>
                <Link to="/reports">
                  <FiFileText size={16} />
                  Reports
                </Link>
                <Link to="/analytics">
                  <FiBarChart2 size={16} />
                  Analytics
                </Link>
              </>
            )}
            {(user?.role === 'admin' || user?.role === 'warehouse') && (
              <Link to="/deliveries">
                <FiTruck size={16} />
                Deliveries
              </Link>
            )}
            {user?.role === 'admin' && (
              <>
                <Link to="/admin" style={{ fontWeight: 'bold' }}>
                  <FiSettings size={16} />
                  Admin
                </Link>
                <Link to="/audit">
                  <FiShield size={16} />
                  Audit
                </Link>
              </>
            )}
          </div>
        </div>

        {/* User Info and Actions */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
          paddingLeft: '20px'
        }}>
          {/* User Info */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>
              {user?.full_name}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              <span>{user?.role.replace('_', ' ').toUpperCase()}</span>
              {locationName && (
                <>
                  <span>•</span>
                  <span style={{ fontWeight: 600 }}>{locationName}</span>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <NotificationBell />
            <button 
              onClick={() => setShowChangePassword(true)}
              title="Change Password"
              style={{ padding: '8px' }}
            >
              <FiKey size={16} />
            </button>
            <button 
              onClick={logout}
              title="Logout"
              style={{ padding: '8px' }}
            >
              <FiLogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {showChangePassword && (
        <ChangePassword onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

export default Navbar;
