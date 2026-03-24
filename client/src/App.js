import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Transfers from './components/Transfers';
import Reports from './components/Reports';
import Analytics from './components/Analytics';
import Deliveries from './components/Deliveries';
import Discrepancy from './components/Discrepancy';
import Admin from './components/Admin';
import AuditLog from './components/AuditLog';
import Messages from './components/Messages';
import UnitConversions from './components/UnitConversions';
import Sales from './components/Sales';
import Navbar from './components/Navbar';
import { AuthContext } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import api from './utils/api';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      if (token && userData) {
        try {
          // Verify token is still valid
          await api.get('/auth/verify');
          setUser(JSON.parse(userData));
        } catch (error) {
          // Token invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };
    
    initAuth();
  }, []);

  // Handle visibility change - refresh data when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Tab is now visible, trigger a custom event that components can listen to
        window.dispatchEvent(new Event('tab-visible'));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div className="spinner"></div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <ToastProvider>
        <NotificationProvider>
          <Router>
          {user && <Navbar />}
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/inventory" element={user ? <Inventory /> : <Navigate to="/login" />} />
            <Route path="/transfers" element={user ? <Transfers /> : <Navigate to="/login" />} />
            <Route 
              path="/reports" 
              element={
                user && (user.role === 'admin' || user.role === 'branch_manager' || user.role === 'branch_staff') 
                  ? <Reports /> 
                  : <Navigate to="/" />
              } 
            />
            <Route 
              path="/analytics" 
              element={
                user && (user.role === 'admin' || user.role === 'branch_manager' || user.role === 'branch_staff') 
                  ? <Analytics /> 
                  : <Navigate to="/" />
              } 
            />
            <Route 
              path="/deliveries" 
              element={
                user && (user.role === 'admin' || user.role === 'warehouse' || user.role === 'branch_manager')
                  ? <Deliveries /> 
                  : <Navigate to="/" />
              } 
            />
            <Route path="/discrepancy" element={user ? <Discrepancy /> : <Navigate to="/login" />} />
            <Route path="/sales" element={user ? <Sales /> : <Navigate to="/login" />} />
            <Route path="/messages" element={user ? <Messages /> : <Navigate to="/login" />} />
            <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
            <Route path="/audit" element={user?.role === 'admin' ? <AuditLog /> : <Navigate to="/" />} />
            <Route path="/unit-conversions" element={user?.role === 'admin' ? <UnitConversions /> : <Navigate to="/" />} />
          </Routes>
        </Router>
      </NotificationProvider>
    </ToastProvider>
    </AuthContext.Provider>
  );
}

export default App;
