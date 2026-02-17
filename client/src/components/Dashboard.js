import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import { 
  FiPackage, 
  FiAlertTriangle, 
  FiTrendingUp, 
  FiShoppingCart,
  FiArrowRight,
  FiPlus,
  FiActivity,
  FiClock
} from 'react-icons/fi';

function Dashboard() {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expiringItems, setExpiringItems] = useState([]);
  const [stats, setStats] = useState({
    totalValue: 0,
    totalItems: 0,
    lowStockCount: 0,
    expiringCount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, lowStockRes, expiringRes] = await Promise.all([
        api.get('/reports/inventory-summary'),
        api.get('/reports/low-stock?threshold=10'),
        api.get('/inventory/expiring/30').catch(() => ({ data: [] })),
        api.get('/export/analytics').catch(() => ({ data: {} }))
      ]);
      
      // Filter by location for branch managers
      const filteredSummary = (user.role === 'branch_manager' || user.role === 'branch_staff')
        ? summaryRes.data.filter(item => item.location_id === user.location_id)
        : summaryRes.data;
        
      const filteredLowStock = (user.role === 'branch_manager' || user.role === 'branch_staff')
        ? lowStockRes.data.filter(item => item.location_id === user.location_id)
        : lowStockRes.data;
        
      const filteredExpiring = (user.role === 'branch_manager' || user.role === 'branch_staff')
        ? expiringRes.data.filter(item => item.location_id === user.location_id)
        : expiringRes.data;
      
      setSummary(filteredSummary);
      setLowStock(filteredLowStock);
      setExpiringItems(filteredExpiring);
      
      // Calculate stats
      const totalValue = filteredSummary.reduce((sum, item) => sum + parseFloat(item.total_value || 0), 0);
      const totalItems = filteredSummary.reduce((sum, item) => sum + parseInt(item.total_items || 0), 0);
      
      setStats({
        totalValue,
        totalItems,
        lowStockCount: filteredLowStock.length,
        expiringCount: filteredExpiring.length
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiActivity size={32} color="#2563eb" />
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Welcome back, {user?.full_name}
            {(user?.role === 'branch_manager' || user?.role === 'branch_staff') && summary.length > 0 && (
              <span style={{ marginLeft: '8px', fontWeight: 600, color: 'var(--primary)' }}>
                • {summary[0]?.location_name}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        {user?.role === 'admin' && (
          <div className="stat-card">
            <div className="stat-card-header">
              <div>
                <div className="stat-card-value">₱{formatPrice(stats.totalValue)}</div>
                <div className="stat-card-label">Total Inventory Value</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                <FiTrendingUp />
              </div>
            </div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-card-header">
            <div>
              <div className="stat-card-value">{stats.totalItems}</div>
              <div className="stat-card-label">Total Products</div>
            </div>
            <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <FiPackage />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div>
              <div className="stat-card-value" style={{ color: stats.lowStockCount > 0 ? '#ef4444' : 'inherit' }}>
                {stats.lowStockCount}
              </div>
              <div className="stat-card-label">Low Stock Items</div>
            </div>
            <div className="stat-card-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              <FiAlertTriangle />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div>
              <div className="stat-card-value" style={{ color: stats.expiringCount > 0 ? '#f59e0b' : 'inherit' }}>
                {stats.expiringCount}
              </div>
              <div className="stat-card-label">Expiring Soon</div>
            </div>
            <div className="stat-card-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <FiClock />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiActivity size={20} />
          Quick Actions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <Link to="/inventory" className="btn btn-primary" style={{ justifyContent: 'center' }}>
            <FiPlus size={16} />
            Add Inventory
          </Link>
          {(user?.role === 'admin' || user?.role === 'warehouse' || user?.role === 'branch_manager') && (
            <Link to="/transfers" className="btn btn-success" style={{ justifyContent: 'center' }}>
              <FiArrowRight size={16} />
              Create Transfer
            </Link>
          )}
          {(user?.role === 'admin' || user?.role === 'branch_manager') && (
            <Link to="/sales" className="btn" style={{ justifyContent: 'center', backgroundColor: '#10b981', color: 'white' }}>
              <FiShoppingCart size={16} />
              Record Sale
            </Link>
          )}
          {(user?.role === 'admin' || user?.role === 'branch_manager' || user?.role === 'branch_staff') && (
            <Link to="/analytics" className="btn" style={{ justifyContent: 'center' }}>
              <FiTrendingUp size={16} />
              View Analytics
            </Link>
          )}
        </div>
      </div>

      {/* Inventory Summary */}
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiPackage size={20} />
          Inventory by Location
        </h3>
        {summary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiPackage />
            </div>
            <h3>No Inventory Data</h3>
            <p>Start by adding inventory items to your locations</p>
            <Link to="/inventory" className="btn btn-primary">
              <FiPlus size={16} />
              Add First Item
            </Link>
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
                  {user?.role === 'admin' && <th>Total Value</th>}
                </tr>
              </thead>
              <tbody>
                {summary.map((item) => (
                  <tr key={item.location_id}>
                    <td style={{ fontWeight: 600 }}>{item.location_name}</td>
                    <td>
                      <span className={`badge ${item.location_type === 'warehouse' ? 'badge-primary' : 'badge-success'}`}>
                        {item.location_type}
                      </span>
                    </td>
                    <td>{item.total_items || 0}</td>
                    <td>{formatQuantity(item.total_quantity || 0)}</td>
                    {user?.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(item.total_value || 0)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
            <FiAlertTriangle size={20} />
            Low Stock Alert ({lowStock.length} items)
          </h3>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiAlertTriangle size={16} />
            These items are running low and may need restocking soon.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>{item.location_name}</td>
                    <td style={{ fontWeight: 600 }}>{item.description}</td>
                    <td>{item.unit}</td>
                    <td>
                      <span className="badge badge-danger">
                        {formatQuantity(item.quantity)}
                      </span>
                    </td>
                    <td>
                      <Link 
                        to="/transfers" 
                        className="btn btn-primary" 
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                      >
                        <FiArrowRight size={12} />
                        Transfer
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lowStock.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Link to="/inventory" className="btn">
                View All Low Stock Items
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Expiring Items Alert */}
      {expiringItems.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <FiClock size={20} />
            Expiring Soon ({expiringItems.length} items)
          </h3>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiClock size={16} />
            These items will expire within 30 days. Take action to prevent waste.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Batch</th>
                  <th>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                </tr>
              </thead>
              <tbody>
                {expiringItems.slice(0, 10).map((item) => {
                  const expiryDate = new Date(item.expiry_date);
                  const today = new Date();
                  const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                  const isExpired = daysLeft < 0;
                  
                  return (
                    <tr key={item.id}>
                      <td>{item.location_name}</td>
                      <td style={{ fontWeight: 600 }}>{item.description}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {item.batch_number || '-'}
                      </td>
                      <td>{formatQuantity(item.quantity)} {item.unit}</td>
                      <td style={{ fontSize: '12px' }}>
                        {expiryDate.toLocaleDateString()}
                      </td>
                      <td>
                        <span className={`badge ${isExpired ? 'badge-danger' : daysLeft <= 7 ? 'badge-danger' : 'badge-warning'}`}>
                          {isExpired ? 'EXPIRED' : `${daysLeft} days`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {expiringItems.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Link to="/inventory" className="btn">
                View All Expiring Items
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
