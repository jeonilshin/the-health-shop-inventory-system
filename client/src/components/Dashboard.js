import { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { formatQuantity, formatPrice, formatCompactNumber, formatCompactPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import {
  FiPackage,
  FiAlertTriangle,
  FiTrendingUp,
  FiShoppingCart,
  FiArrowRight,
  FiPlus,
  FiActivity,
  FiClock,
  FiRefreshCw,
  FiBarChart2,
  FiCheckCircle,
} from 'react-icons/fi';

/* ── Skeleton components ── */
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      border: '1px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: '32px', width: '60%', marginBottom: '8px', borderRadius: '6px' }} />
        <div className="skeleton skeleton-text" style={{ width: '70%' }} />
      </div>
      <div className="skeleton" style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
    </div>
  );
}

function SkeletonTable({ rows = 4 }) {
  return (
    <div>
      <div className="skeleton" style={{ height: '40px', marginBottom: '4px', borderRadius: '6px' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: '48px', marginBottom: '4px', borderRadius: '6px', opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

function Dashboard() {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [outOfStock, setOutOfStock] = useState([]);
  const [expiringItems, setExpiringItems] = useState([]);
  const [stats, setStats] = useState({
    totalValue: 0,
    totalItems: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    expiringCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [summaryRes, lowStockRes, expiringRes] = await Promise.all([
        api.get('/reports/inventory-summary'),
        api.get('/reports/low-stock?threshold=10'),
        api.get('/inventory/expiring/30').catch(() => ({ data: [] })),
        api.get('/export/analytics').catch(() => ({ data: {} })),
      ]);

      const isBranch = user.role === 'branch_manager' || user.role === 'branch_staff';

      const filteredSummary = isBranch
        ? summaryRes.data.filter(i => i.location_id === user.location_id)
        : summaryRes.data;

      const filteredLowStock = isBranch
        ? lowStockRes.data.filter(i => i.location_id === user.location_id)
        : lowStockRes.data;

      const filteredExpiring = isBranch
        ? expiringRes.data.filter(i => i.location_id === user.location_id)
        : expiringRes.data;

      const outOfStockItems = filteredLowStock.filter(i => parseFloat(i.quantity) === 0);
      const lowStockItems   = filteredLowStock.filter(i => parseFloat(i.quantity) > 0);

      setSummary(filteredSummary);
      setLowStock(lowStockItems);
      setOutOfStock(outOfStockItems);
      setExpiringItems(filteredExpiring);

      const totalValue = filteredSummary.reduce((s, i) => s + parseFloat(i.total_value || 0), 0);
      const totalItems = filteredSummary.reduce((s, i) => s + parseInt(i.total_items || 0), 0);

      setStats({
        totalValue,
        totalItems,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        expiringCount: filteredExpiring.length,
      });

      setLastUpdated(new Date());
    } catch {
      // silently handle – individual components show empty states
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh when tab regains focus
  useEffect(() => {
    const handler = () => fetchData(true);
    window.addEventListener('tab-visible', handler);
    return () => window.removeEventListener('tab-visible', handler);
  }, [fetchData]);

  const statCards = [
    user?.role === 'admin' && {
      value: `₱${formatCompactPrice(stats.totalValue)}`,
      label: 'Total Inventory Value',
      title: `₱${formatPrice(stats.totalValue)}`,
      icon: FiTrendingUp,
      color: '#2563eb',
      bg: 'rgba(37,99,235,0.1)',
    },
    {
      value: formatCompactNumber(stats.totalItems),
      label: 'Total Products',
      title: stats.totalItems.toLocaleString(),
      icon: FiPackage,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
    },
    {
      value: formatCompactNumber(stats.lowStockCount),
      label: 'Low Stock Items',
      title: stats.lowStockCount.toLocaleString(),
      icon: FiAlertTriangle,
      color: stats.lowStockCount > 0 ? '#f59e0b' : '#10b981',
      bg: stats.lowStockCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
      valueColor: stats.lowStockCount > 0 ? '#f59e0b' : undefined,
    },
    {
      value: formatCompactNumber(stats.outOfStockCount),
      label: 'Out of Stock',
      title: stats.outOfStockCount.toLocaleString(),
      icon: FiAlertTriangle,
      color: stats.outOfStockCount > 0 ? '#ef4444' : '#10b981',
      bg: stats.outOfStockCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
      valueColor: stats.outOfStockCount > 0 ? '#ef4444' : undefined,
    },
    {
      value: formatCompactNumber(stats.expiringCount),
      label: 'Expiring Within 30 Days',
      title: stats.expiringCount.toLocaleString(),
      icon: FiClock,
      color: stats.expiringCount > 0 ? '#f59e0b' : '#10b981',
      bg: stats.expiringCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
      valueColor: stats.expiringCount > 0 ? '#f59e0b' : undefined,
    },
  ].filter(Boolean);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="container">
        {/* Header skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <div className="skeleton skeleton-title" style={{ width: '160px', marginBottom: '8px' }} />
            <div className="skeleton skeleton-text" style={{ width: '220px' }} />
          </div>
          <div className="skeleton" style={{ width: '100px', height: '36px', borderRadius: 'var(--radius)' }} />
        </div>
        {/* Stat cards skeleton */}
        <div className="stats-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        {/* Cards skeleton */}
        <div className="card">
          <div className="skeleton skeleton-title" style={{ width: '160px', marginBottom: '16px' }} />
          <SkeletonTable rows={3} />
        </div>
        <div className="card">
          <div className="skeleton skeleton-title" style={{ width: '200px', marginBottom: '16px' }} />
          <SkeletonTable rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <FiActivity size={28} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.625rem' }}>Dashboard</h2>
          </div>
          <p className="page-subtitle">
            Welcome back, <strong>{user?.full_name}</strong>
            {(user?.role === 'branch_manager' || user?.role === 'branch_staff') && summary.length > 0 && (
              <span style={{ marginLeft: '8px', color: 'var(--primary)', fontWeight: 600 }}>
                · {summary[0]?.location_name}
              </span>
            )}
            {lastUpdated && (
              <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                · Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          style={{ gap: '6px', minWidth: '100px' }}
        >
          <FiRefreshCw size={14} style={{ animation: refreshing ? 'spin 0.65s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isLong = (card.value || '').length > 7;
          return (
            <div
              key={card.label}
              className="stat-card"
              style={{ borderTop: `3px solid ${card.color}` }}
            >
              <div className="stat-card-header">
                <div className="stat-card-content">
                  <div
                    className={`stat-card-value${isLong ? ' long-number' : ''}`}
                    style={card.valueColor ? { color: card.valueColor } : undefined}
                    title={card.title}
                  >
                    {card.value}
                  </div>
                  <div className="stat-card-label">{card.label}</div>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: card.bg, color: card.color }}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alerts Row ── */}
      {(stats.outOfStockCount > 0 || stats.lowStockCount > 0 || stats.expiringCount > 0) && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {stats.outOfStockCount > 0 && (
            <div className="alert alert-error" style={{ margin: 0, flex: '1 1 200px' }}>
              <FiAlertTriangle size={15} />
              <span><strong>{stats.outOfStockCount}</strong> item{stats.outOfStockCount !== 1 ? 's' : ''} out of stock — immediate action needed</span>
            </div>
          )}
          {stats.lowStockCount > 0 && (
            <div className="alert alert-warning" style={{ margin: 0, flex: '1 1 200px' }}>
              <FiAlertTriangle size={15} />
              <span><strong>{stats.lowStockCount}</strong> item{stats.lowStockCount !== 1 ? 's' : ''} running low on stock</span>
            </div>
          )}
          {stats.expiringCount > 0 && (
            <div className="alert alert-warning" style={{ margin: 0, flex: '1 1 200px' }}>
              <FiClock size={15} />
              <span><strong>{stats.expiringCount}</strong> item{stats.expiringCount !== 1 ? 's' : ''} expiring within 30 days</span>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <FiActivity size={18} color="var(--primary)" />
            Quick Actions
          </h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {(user?.role === 'admin' || user?.role === 'warehouse') && (
            <Link to="/inventory" className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 16px' }}>
              <FiPlus size={15} /> Add Inventory
            </Link>
          )}
          {(user?.role === 'branch_manager' || user?.role === 'branch_staff') && (
            <Link to="/inventory" className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 16px' }}>
              <FiPackage size={15} /> View Inventory
            </Link>
          )}
          {(user?.role === 'admin' || user?.role === 'warehouse' || user?.role === 'branch_manager') && (
            <Link to="/transfers" className="btn btn-success" style={{ justifyContent: 'center', padding: '10px 16px' }}>
              <FiArrowRight size={15} /> Create Transfer
            </Link>
          )}
          {(user?.role === 'admin' || user?.role === 'branch_manager') && (
            <Link to="/sales" className="btn" style={{ justifyContent: 'center', padding: '10px 16px', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', borderColor: 'transparent', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}>
              <FiShoppingCart size={15} /> Record Sale
            </Link>
          )}
          {(user?.role === 'admin' || user?.role === 'branch_manager' || user?.role === 'branch_staff') && (
            <Link to="/analytics" className="btn" style={{ justifyContent: 'center', padding: '10px 16px' }}>
              <FiBarChart2 size={15} /> Analytics
            </Link>
          )}
        </div>
      </div>

      {/* ── Inventory by Location ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <FiPackage size={18} color="var(--primary)" />
            Inventory by Location
          </h3>
          {summary.length > 0 && (
            <span className="badge badge-neutral">
              {summary.length} location{summary.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {summary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FiPackage /></div>
            <h3>No Inventory Data</h3>
            <p>Start by adding inventory items to your locations.</p>
            <Link to="/inventory" className="btn btn-primary">
              <FiPlus size={15} /> Add First Item
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Items</th>
                  <th style={{ textAlign: 'right' }}>Total Qty</th>
                  {user?.role === 'admin' && <th style={{ textAlign: 'right' }}>Total Value</th>}
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
                    <td style={{ textAlign: 'right' }}>{(item.total_items || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{formatQuantity(item.total_quantity || 0)}</td>
                    {user?.role === 'admin' && (
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        ₱{formatPrice(item.total_value || 0)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Low Stock Alert ── */}
      {lowStock.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--warning-dark)' }}>
              <FiAlertTriangle size={18} />
              Low Stock Alert
              <span className="badge badge-warning" style={{ marginLeft: '4px' }}>
                {lowStock.length}
              </span>
            </h3>
            {lowStock.length > 5 && (
              <Link to="/inventory" className="btn btn-sm">View All <FiArrowRight size={12} /></Link>
            )}
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Batch</th>
                  <th style={{ textAlign: 'right' }}>Qty Left</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="badge badge-primary" style={{ fontSize: '10px' }}>{item.location_name}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.description}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{item.unit}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.batch_number || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-warning">{formatQuantity(item.quantity)}</span>
                    </td>
                    <td>
                      <Link to="/transfers" className="btn btn-sm btn-primary">
                        <FiArrowRight size={12} /> Transfer
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Out of Stock Alert ── */}
      {outOfStock.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--danger-dark)' }}>
              <FiAlertTriangle size={18} />
              Out of Stock — Urgent
              <span className="badge badge-danger" style={{ marginLeft: '4px' }}>
                {outOfStock.length}
              </span>
            </h3>
            {outOfStock.length > 6 && (
              <Link to="/inventory" className="btn btn-sm btn-danger">
                View All {outOfStock.length}
              </Link>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {outOfStock.slice(0, 6).map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '14px',
                  border: '1.5px solid #fee2e2',
                  borderRadius: 'var(--radius-md)',
                  background: 'white',
                  transition: 'border-color 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#fee2e2'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }} className="truncate">
                      {item.description}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.unit}{item.batch_number ? ` · ${item.batch_number}` : ''}
                    </div>
                  </div>
                  <span className="badge badge-danger" style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>OUT</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #fee2e2' }}>
                  <span className="badge badge-primary" style={{ fontSize: '10px' }}>{item.location_name}</span>
                  <Link to="/transfers" className="btn btn-sm btn-danger">
                    <FiArrowRight size={11} /> Restock
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Expiring Items ── */}
      {expiringItems.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: 'var(--warning-dark)' }}>
              <FiClock size={18} />
              Expiring Soon
              <span className="badge badge-warning" style={{ marginLeft: '4px' }}>
                {expiringItems.length}
              </span>
            </h3>
            {expiringItems.length > 5 && (
              <Link to="/inventory" className="btn btn-sm">View All <FiArrowRight size={12} /></Link>
            )}
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Batch</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expiringItems.slice(0, 5).map((item) => {
                  const expiry = new Date(item.expiry_date);
                  const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
                  const isExpired = daysLeft < 0;
                  const isCritical = !isExpired && daysLeft <= 7;

                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="badge badge-primary" style={{ fontSize: '10px' }}>{item.location_name}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.description}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.batch_number || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{formatQuantity(item.quantity)} {item.unit}</td>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {expiry.toLocaleDateString()}
                      </td>
                      <td>
                        <span className={`badge ${isExpired || isCritical ? 'badge-danger' : 'badge-warning'}`}>
                          {isExpired ? 'EXPIRED' : daysLeft === 0 ? 'TODAY' : `${daysLeft}d left`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── All clear ── */}
      {!loading && stats.lowStockCount === 0 && stats.outOfStockCount === 0 && stats.expiringCount === 0 && summary.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--secondary-dark)' }}>
            <FiCheckCircle size={22} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>All inventory is healthy</div>
              <div style={{ fontSize: '13px', opacity: 0.8 }}>No low stock, out of stock, or expiring items to report.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
