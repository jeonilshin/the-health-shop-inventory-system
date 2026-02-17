import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import { 
  FiFileText, 
  FiDollarSign, 
  FiPackage,
  FiTrendingUp,
  FiMapPin
} from 'react-icons/fi';

function Reports() {
  const { user } = useContext(AuthContext);
  const [salesSummary, setSalesSummary] = useState([]);
  const [inventorySummary, setInventorySummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const [salesRes, inventoryRes] = await Promise.all([
        api.get('/reports/sales-summary'),
        api.get('/reports/inventory-summary')
      ]);
      
      // Filter by location for branch managers
      const filteredSales = (user.role === 'branch_manager' || user.role === 'branch_staff')
        ? (salesRes.data || []).filter(item => item.location_id === user.location_id)
        : (salesRes.data || []);
        
      const filteredInventory = (user.role === 'branch_manager' || user.role === 'branch_staff')
        ? (inventoryRes.data || []).filter(item => item.location_id === user.location_id)
        : (inventoryRes.data || []);
      
      setSalesSummary(filteredSales);
      setInventorySummary(filteredInventory);
    } catch (error) {
      console.error('Error fetching reports:', error);
      setError(error.response?.data?.error || 'Error loading reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <FiFileText size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>Reports</h2>
        </div>
        <div className="alert alert-error">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiFileText size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Reports</h2>
      </div>
      
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiDollarSign size={20} color="#10b981" />
          Sales Summary by Branch
        </h3>
        {salesSummary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiTrendingUp />
            </div>
            <h3>No Sales Data</h3>
            <p>No sales data available yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Transactions</th>
                  <th>Items Sold</th>
                  {user.role === 'admin' && (
                    <>
                      <th>Revenue</th>
                      <th>Cost</th>
                      <th>Profit</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {salesSummary.map((item) => (
                  <tr key={item.location_id}>
                    <td style={{ fontWeight: 600 }}>{item.location_name}</td>
                    <td>{item.total_transactions || 0}</td>
                    <td>{formatQuantity(item.total_items_sold || 0)}</td>
                    {user.role === 'admin' && (
                      <>
                        <td style={{ fontWeight: 600 }}>₱{formatPrice(item.total_revenue || 0)}</td>
                        <td>₱{formatPrice(item.total_cost || 0)}</td>
                        <td style={{ color: parseFloat(item.total_profit || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                          ₱{formatPrice(item.total_profit || 0)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiPackage size={20} color="#3b82f6" />
          Inventory Summary by Location
        </h3>
        {inventorySummary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiMapPin />
            </div>
            <h3>No Inventory Data</h3>
            <p>No locations created yet. Go to Admin Dashboard to create locations.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Total Items</th>
                  <th>Total Quantity</th>
                  {user.role === 'admin' && <th>Total Value</th>}
                </tr>
              </thead>
              <tbody>
                {inventorySummary.map((item) => (
                  <tr key={item.location_id}>
                    <td style={{ fontWeight: 600 }}>{item.location_name}</td>
                    <td>
                      <span className={`badge ${item.location_type === 'warehouse' ? 'badge-primary' : 'badge-success'}`}>
                        {item.location_type}
                      </span>
                    </td>
                    <td>{item.total_items || 0}</td>
                    <td>{formatQuantity(item.total_quantity || 0)}</td>
                    {user.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(item.total_value || 0)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
