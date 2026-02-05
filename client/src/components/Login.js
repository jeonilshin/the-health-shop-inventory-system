import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { username, password });
      login(response.data.token, response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '450px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
            color: 'white',
            fontWeight: 'bold',
            boxShadow: '0 10px 30px rgba(102, 126, 234, 0.4)'
          }}>
            🏥
          </div>
          <h2 style={{ marginBottom: '10px', fontSize: '28px' }}>The Health Shop</h2>
          <p style={{ color: '#718096', fontSize: '14px' }}>Inventory Management System</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          {error && <div className="error">❌ {error}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '20px', padding: '14px' }}
            disabled={loading}
          >
            {loading ? (
              <span>
                <span className="spinner" style={{
                  width: '16px',
                  height: '16px',
                  borderWidth: '2px',
                  display: 'inline-block',
                  verticalAlign: 'middle',
                  marginRight: '8px'
                }}></span>
                Logging in...
              </span>
            ) : (
              '🔐 Login'
            )}
          </button>
        </form>

        <div style={{
          marginTop: '30px',
          padding: '20px',
          background: '#f7fafc',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#718096'
        }}>
          <p style={{ marginBottom: '8px' }}><strong>Default Credentials:</strong></p>
          <p>Username: <code style={{ background: 'white', padding: '2px 6px', borderRadius: '4px' }}>admin</code></p>
          <p>Password: <code style={{ background: 'white', padding: '2px 6px', borderRadius: '4px' }}>admin123</code></p>
        </div>
      </div>
    </div>
  );
}

export default Login;
