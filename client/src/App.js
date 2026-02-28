import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Transfers from './components/Transfers';
import Reports from './components/Reports';
import Analytics from './components/Analytics';
import Deliveries from './components/Deliveries';
import Admin from './components/Admin';
import AuditLog from './components/AuditLog';
import Messages from './components/Messages';
import Navbar from './components/Navbar';
import { AuthContext } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

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
    return <div>Loading...</div>;
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
            <Route path="/deliveries" element={user ? <Deliveries /> : <Navigate to="/login" />} />
            <Route path="/messages" element={user ? <Messages /> : <Navigate to="/login" />} />
            <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
            <Route path="/audit" element={user?.role === 'admin' ? <AuditLog /> : <Navigate to="/" />} />
          </Routes>
        </Router>
      </NotificationProvider>
    </ToastProvider>
    </AuthContext.Provider>
  );
}

export default App;
