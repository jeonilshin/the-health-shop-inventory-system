import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import { 
  FiBarChart2, 
  FiTrendingUp, 
  FiDollarSign, 
  FiShoppingCart, 
  FiAlertTriangle,
  FiAward,
  FiMapPin,
  FiCalendar,
  FiPackage
} from 'react-icons/fi';

function Analytics() {
  const { user } = useContext(AuthContext);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/export/analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
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

  if (!analytics) {
    return (
      <div className="container">
        <div className="alert alert-error">Failed to load analytics</div>
      </div>
    );
  }

  const { summary, top_products, sales_by_location, daily_sales } = analytics;

  // Filter sales by location for branch managers
  const filteredSalesByLocation = (user.role === 'branch_manager' || user.role === 'branch_staff')
    ? sales_by_location.filter(loc => loc.location_id === user.location_id)
    : sales_by_location;

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiBarChart2 size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        {user.role === 'admin' && (
          <>
            <div className="stat-card">
              <div className="stat-card-header">
                <div>
                  <div className="stat-card-label">INVENTORY VALUE</div>
                  <div className="stat-card-value">₱{formatPrice(summary.inventory_value)}</div>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                  <FiPackage />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div>
                  <div className="stat-card-label">SALES (30 DAYS)</div>
                  <div className="stat-card-value">₱{formatPrice(summary.total_sales)}</div>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  <FiShoppingCart />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div>
                  <div className="stat-card-label">PROFIT (30 DAYS)</div>
                  <div className="stat-card-value">₱{formatPrice(summary.total_profit)}</div>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                  <FiDollarSign />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="stat-card">
          <div className="stat-card-header">
            <div>
              <div className="stat-card-label">TRANSACTIONS</div>
              <div className="stat-card-value">{summary.total_transactions}</div>
            </div>
            <div className="stat-card-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
              <FiTrendingUp />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div>
              <div className="stat-card-label">LOW STOCK ITEMS</div>
              <div className="stat-card-value" style={{ color: summary.low_stock_count > 0 ? '#ef4444' : 'inherit' }}>
                {summary.low_stock_count}
              </div>
            </div>
            <div className="stat-card-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              <FiAlertTriangle />
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', 
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Top Products */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAward size={20} color="#f59e0b" />
            Top Selling Products (30 Days)
          </h3>
          {top_products.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiAward />
              </div>
              <p>No sales data yet</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sold</th>
                    {user.role === 'admin' && <th>Revenue</th>}
                  </tr>
                </thead>
                <tbody>
                  {top_products.map((product, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 600 }}>{product.description}</td>
                      <td>{formatQuantity(product.total_sold)}</td>
                      {user.role === 'admin' && (
                        <td style={{ fontWeight: 600 }}>₱{formatPrice(product.revenue)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sales by Location */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiMapPin size={20} color="#10b981" />
            Sales by Location (30 Days)
          </h3>
          {filteredSalesByLocation.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiMapPin />
              </div>
              <p>No sales data yet</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Transactions</th>
                    {user.role === 'admin' && <th>Revenue</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredSalesByLocation.map((location, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 600 }}>{location.location}</td>
                      <td>{location.transactions}</td>
                      {user.role === 'admin' && (
                        <td style={{ fontWeight: 600 }}>₱{formatPrice(location.revenue)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Daily Sales Trend */}
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiCalendar size={20} color="#3b82f6" />
          Daily Sales Trend (Last 7 Days)
        </h3>
        {daily_sales.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiCalendar />
            </div>
            <p>No sales data yet</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transactions</th>
                  {user.role === 'admin' && <th>Revenue</th>}
                </tr>
              </thead>
              <tbody>
                {daily_sales.map((day, index) => (
                  <tr key={index}>
                    <td>{new Date(day.date).toLocaleDateString()}</td>
                    <td>{day.transactions}</td>
                    {user.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(day.revenue)}</td>
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

export default Analytics;
