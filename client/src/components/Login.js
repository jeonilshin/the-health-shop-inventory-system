import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import { FiUser, FiLock, FiLogIn, FiActivity, FiEye, FiEyeOff, FiAlertCircle, FiInfo } from 'react-icons/fi';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginTimeout, setLoginTimeout] = useState(false);
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setLoginTimeout(false);

    const timeoutId = setTimeout(() => setLoginTimeout(true), 8000);

    try {
      const response = await api.post('/auth/login', { username, password }, { timeout: 30000 });
      clearTimeout(timeoutId);
      login(response.data.token, response.data.user);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Connection timed out. Please check your network and try again.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
      setLoginTimeout(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 35%, #2563eb 65%, #3b82f6 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative background circles */}
      <div style={{
        position: 'absolute', top: '-120px', right: '-120px',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-80px', left: '-80px',
        width: '300px', height: '300px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '30%',
        width: '160px', height: '160px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.03)', pointerEvents: 'none',
      }} />

      {/* Left branding panel (hidden on mobile) */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '60px',
        color: 'white',
        maxWidth: '480px',
      }} className="login-branding">
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '14px',
          padding: '10px 18px',
        }}>
          <FiActivity size={22} />
          <span style={{ fontWeight: 700, fontSize: '16px' }}>The Health Shop</span>
        </div>

        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '16px', letterSpacing: '-0.02em' }}>
          Inventory<br />Management<br />System
        </h1>
        <p style={{ fontSize: '16px', opacity: 0.8, lineHeight: 1.7, maxWidth: '320px' }}>
          Track stock levels, manage transfers, record sales, and keep your branches running smoothly.
        </p>

        <div style={{ display: 'flex', gap: '32px', marginTop: '48px', opacity: 0.75 }}>
          {[['28', 'Branches'], ['2', 'Warehouses'], ['∞', 'Products']].map(([n, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: '100%',
        maxWidth: '460px',
        padding: '32px 24px',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '380px',
          background: 'white',
          borderRadius: '20px',
          padding: '40px 36px',
          boxShadow: '0 32px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '60px',
              height: '60px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
              marginBottom: '16px',
              boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
            }}>
              <FiActivity size={28} color="white" />
            </div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Welcome back
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: 600,
                color: '#374151',
                fontSize: '13px',
              }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '11px', top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af', display: 'flex', alignItems: 'center',
                  pointerEvents: 'none',
                }}>
                  <FiUser size={15} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoFocus
                  autoComplete="username"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#111827',
                    background: '#f9fafb',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: 600,
                color: '#374151',
                fontSize: '13px',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '11px', top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af', display: 'flex', alignItems: 'center',
                  pointerEvents: 'none',
                }}>
                  <FiLock size={15} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 36px',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#111827',
                    background: '#f9fafb',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: '#9ca3af',
                    display: 'flex', alignItems: 'center',
                    padding: '4px',
                    borderRadius: '6px',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#374151'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderLeft: '3px solid #ef4444',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991b1b',
              }}>
                <FiAlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.18s ease',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(37,99,235,0.3)',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.4)'; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 16px rgba(37,99,235,0.3)'; }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '15px', height: '15px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.65s linear infinite',
                  }} />
                  {loginTimeout ? 'Still connecting...' : 'Signing in...'}
                </>
              ) : (
                <>
                  <FiLogIn size={15} />
                  Sign In
                </>
              )}
            </button>

            {/* Timeout warning */}
            {loginTimeout && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 14px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderLeft: '3px solid #f59e0b',
                borderRadius: '8px',
                marginTop: '12px',
                fontSize: '12px',
                color: '#92400e',
              }}>
                <FiInfo size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                Taking longer than usual — this may be due to server startup or network conditions.
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Responsive styles via a style tag */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .login-branding { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default Login;
