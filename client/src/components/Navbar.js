import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function Navbar() {
  const { user, logout } = useContext(AuthContext);

  return (
    <nav className="navbar">
      <div>
        <h1>The Health Shop Inventory System</h1>
        <div style={{ fontSize: '12px', marginTop: '5px' }}>
          {user?.full_name} ({user?.role})
        </div>
      </div>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>Dashboard</Link>
        <Link to="/inventory" style={{ color: 'white', textDecoration: 'none' }}>Inventory</Link>
        {(user?.role === 'admin' || user?.role === 'warehouse' || user?.role === 'branch_manager') && (
          <Link to="/transfers" style={{ color: 'white', textDecoration: 'none' }}>Transfers</Link>
        )}
        {(user?.role === 'admin' || user?.role === 'branch_manager') && (
          <Link to="/sales" style={{ color: 'white', textDecoration: 'none' }}>Sales</Link>
        )}
        <Link to="/reports" style={{ color: 'white', textDecoration: 'none' }}>Reports</Link>
        {user?.role === 'admin' && (
          <Link to="/admin" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>Admin</Link>
        )}
        <button onClick={logout}>Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;
