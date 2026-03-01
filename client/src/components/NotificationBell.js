import { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationContext } from '../context/NotificationContext';
import { FiBell, FiCheck, FiTruck, FiCheckCircle, FiPackage, FiClock, FiAlertCircle } from 'react-icons/fi';

function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useContext(NotificationContext);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      // Force refresh after navigation
      setTimeout(() => window.location.reload(), 100);
    }
    setShowDropdown(false);
  };

  const getNotificationIcon = (type) => {
    const iconMap = {
      delivery_awaiting_admin: { Icon: FiTruck, color: '#f59e0b' },
      delivery_confirmed: { Icon: FiCheckCircle, color: '#10b981' },
      delivery_incoming: { Icon: FiPackage, color: '#3b82f6' },
      delivery_completed: { Icon: FiCheckCircle, color: '#10b981' },
      transfer_pending: { Icon: FiClock, color: '#f59e0b' },
      transfer_approved: { Icon: FiCheckCircle, color: '#10b981' },
    };
    const config = iconMap[type] || { Icon: FiAlertCircle, color: '#6b7280' };
    return <config.Icon size={24} color={config.color} />;
  };

  const formatTime = (timestamp) => {
    // Parse timestamp - PostgreSQL returns timestamps in ISO format
    const date = new Date(timestamp);
    const now = new Date();
    
    // Calculate difference in milliseconds
    const diffMs = now.getTime() - date.getTime();
    const diff = Math.floor(diffMs / 1000); // Convert to seconds

    if (diff < 0 || diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FiBell size={20} color="white" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            backgroundColor: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--primary)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          width: '380px',
          maxHeight: '500px',
          backgroundColor: 'white',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          zIndex: 1000,
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f9fafb',
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <FiCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#9ca3af',
              }}>
                <FiBell size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ margin: 0 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    backgroundColor: notification.read ? 'white' : '#eff6ff',
                    transition: 'background-color 0.2s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = notification.read ? 'white' : '#eff6ff'}
                >
                  {!notification.read && (
                    <div style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#2563eb',
                    }} />
                  )}
                  <div style={{ display: 'flex', gap: '12px', paddingLeft: !notification.read ? '16px' : 0 }}>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', paddingTop: '2px' }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: 600, 
                        fontSize: '14px', 
                        marginBottom: '4px',
                        color: '#1f2937',
                      }}>
                        {notification.title}
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#4b5563',
                        marginBottom: '6px',
                        lineHeight: '1.4',
                      }}>
                        {notification.message}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#9ca3af',
                      }}>
                        {formatTime(notification.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
