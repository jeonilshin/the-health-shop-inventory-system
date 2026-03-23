import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import {
  FiUser, FiLock, FiLogIn, FiActivity,
  FiEye, FiEyeOff, FiAlertCircle, FiInfo,
  FiPackage, FiTruck, FiBarChart2
} from 'react-icons/fi';

function Login() {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
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

  const inputBase = {
    width: '100%',
    padding: '12px 14px 12px 44px',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '14px',
    color: '#0f172a',
    background: '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
    fontFamily: 'inherit',
  };

  const onFocusStyle = (e) => {
    e.target.style.borderColor = '#2563eb';
    e.target.style.background  = '#ffffff';
    e.target.style.boxShadow   = '0 0 0 3px rgba(37,99,235,0.1)';
  };
  const onBlurStyle = (e) => {
    e.target.style.borderColor = '#e2e8f0';
    e.target.style.background  = '#f8fafc';
    e.target.style.boxShadow   = 'none';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#070d1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      padding: '24px',
    }}>

      {/* ── Ambient glow blobs ──────────────────────────────── */}
      <div style={{
        position: 'absolute', top: '-180px', left: '-180px',
        width: '560px', height: '560px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-160px', right: '-160px',
        width: '480px', height: '480px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.16) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px', height: '800px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* ── Dot grid overlay ────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        pointerEvents: 'none',
      }} />

      {/* ── Login card ──────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '440px',
        background: '#ffffff',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 32px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.3)',
      }}>

        {/* Top accent gradient bar */}
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, #1e40af 0%, #2563eb 30%, #10b981 70%, #059669 100%)',
        }} />

        <div style={{ padding: '40px 40px 32px' }}>

          {/* ── Brand ─────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            {/* Logo icon */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '20px' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '22px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(16,185,129,0.4)',
                margin: '0 auto',
              }}>
                <FiActivity size={32} color="white" strokeWidth={2.2} />
              </div>
              {/* Pulse ring */}
              <div className="login-pulse-ring" />
            </div>

            <div style={{ marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#10b981',
              }}>
                The Health Shop
              </span>
            </div>
            <h2 style={{
              margin: '4px 0 8px', fontSize: '26px', fontWeight: 800,
              color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.2,
            }}>
              Welcome back
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px', lineHeight: 1.5 }}>
              Sign in to access the inventory system
            </p>
          </div>

          {/* ── Form ──────────────────────────────────────── */}
          <form onSubmit={handleSubmit} noValidate>

            {/* Username field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block', marginBottom: '7px',
                fontSize: '12px', fontWeight: 700, color: '#374151',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none',
                }}>
                  <FiUser size={16} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  autoFocus
                  autoComplete="username"
                  style={inputBase}
                  onFocus={onFocusStyle}
                  onBlur={onBlurStyle}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block', marginBottom: '7px',
                fontSize: '12px', fontWeight: 700, color: '#374151',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none',
                }}>
                  <FiLock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={{ ...inputBase, paddingRight: '44px' }}
                  onFocus={onFocusStyle}
                  onBlur={onBlurStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#475569'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '12px 14px',
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                marginBottom: '18px', fontSize: '13px', color: '#dc2626', lineHeight: 1.5,
              }}>
                <FiAlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="login-submit-btn"
              style={{
                width: '100%',
                padding: '13px',
                background: loading
                  ? '#d1fae5'
                  : 'linear-gradient(135deg, #059669 0%, #10b981 40%, #2563eb 100%)',
                color: loading ? '#6b7280' : 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(16,185,129,0.35)',
                transition: 'all 0.2s ease',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.transform   = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow   = '0 8px 28px rgba(16,185,129,0.45)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 20px rgba(16,185,129,0.35)';
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '16px', height: '16px',
                    border: '2.5px solid rgba(107,114,128,0.3)',
                    borderTopColor: '#6b7280',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  {loginTimeout ? 'Still connecting…' : 'Signing in…'}
                </>
              ) : (
                <>
                  <FiLogIn size={16} />
                  Sign In
                </>
              )}
            </button>

            {/* Slow connection warning */}
            {loginTimeout && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '10px 14px',
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
                marginTop: '12px', fontSize: '12px', color: '#92400e', lineHeight: 1.5,
              }}>
                <FiInfo size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                Taking longer than usual — this may be due to server startup. Please wait…
              </div>
            )}
          </form>
        </div>

        {/* ── Stats footer ────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid #f1f5f9',
          padding: '18px 40px 22px',
          display: 'flex',
          justifyContent: 'center',
          gap: '0',
        }}>
          {[
            { icon: <FiTruck size={14} />,     value: '28', label: 'Branches'   },
            { icon: <FiPackage size={14} />,   value: '2',  label: 'Warehouses' },
            { icon: <FiBarChart2 size={14} />, value: '∞',  label: 'Products'   },
          ].map(({ icon, value, label }, i, arr) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: 'center',
                borderRight: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
                padding: '0 8px',
              }}
            >
              <div style={{ color: '#94a3b8', marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>
                {icon}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyframes & responsive ──────────────────────────── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes loginPulse {
          0%   { transform: scale(1);    opacity: 0.5; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .login-pulse-ring {
          position: absolute;
          inset: -6px;
          border-radius: 26px;
          border: 2px solid rgba(16,185,129,0.4);
          animation: loginPulse 2s ease-out infinite;
          pointer-events: none;
        }
        @media (max-width: 480px) {
          .login-submit-btn { font-size: 14px !important; }
        }
      `}</style>
    </div>
  );
}

export default Login;
