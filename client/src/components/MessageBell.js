import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMessageSquare } from 'react-icons/fi';
import api from '../utils/api';

function MessageBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [previousCount, setPreviousCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.get('/messages/unread-count');
      const newCount = response.data.count;
      
      // Play sound if count increased
      if (newCount > previousCount && previousCount > 0) {
        playNotificationSound();
      }
      
      setPreviousCount(newCount);
      setUnreadCount(newCount);
    } catch (error) {
      // Error fetching unread count
    }
  }, [previousCount]);

  useEffect(() => {
    fetchUnreadCount();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore if sound fails
    } catch (error) {
      // Silently fail if audio not available
    }
  };

  const handleClick = () => {
    navigate('/messages');
  };

  return (
    <button
      onClick={handleClick}
      style={{
        position: 'relative',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-primary)',
        transition: 'color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
      title="Messages"
    >
      <FiMessageSquare size={20} />
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            backgroundColor: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            width: unreadCount > 9 ? '20px' : '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: '600',
            border: '2px solid white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default MessageBell;
