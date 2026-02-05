import React, { useState } from 'react';
import api from '../utils/api';

function ChangePassword({ onClose }) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    try {
      await api.post('/auth/change-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword
      });
      setSuccess(true);
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        if (onClose) onClose();
      }, 2000);
    } catch (error) {
      setError(error.response?.data?.error || 'Error changing password');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(5px)',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        animation: 'slideUp 0.3s ease'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            margin: '0 auto 15px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px'
          }}>
            🔐
          </div>
          <h3 style={{ margin: 0 }}>Change Password</h3>
          <p style={{ color: '#718096', fontSize: '14px', marginTop: '8px' }}>
            Update your account password
          </p>
        </div>
        
        {error && (
          <div className="error" style={{ marginBottom: '20px' }}>
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="success" style={{ marginBottom: '20px' }}>
            ✅ Password changed successfully!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              placeholder="Enter current password"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              placeholder="Enter new password"
              required
              minLength="6"
            />
            <small>Minimum 6 characters</small>
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
              required
              minLength="6"
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              🔄 Change Password
            </button>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{
                flex: 1,
                background: '#e2e8f0',
                color: '#2d3748'
              }}
            >
              ❌ Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;
