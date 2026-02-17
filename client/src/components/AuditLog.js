import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { 
  FiShield, 
  FiFilter, 
  FiDownload, 
  FiUser,
  FiClock,
  FiActivity,
  FiDatabase
} from 'react-icons/fi';

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    table_name: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0
  });

  useEffect(() => {
    fetchLogs();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.offset]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...filters,
        limit: pagination.limit,
        offset: pagination.offset
      });
      
      // Remove empty filters
      Object.keys(filters).forEach(key => {
        if (!filters[key]) params.delete(key);
      });

      const response = await api.get(`/audit?${params}`);
      setLogs(response.data.logs);
      setPagination(prev => ({ ...prev, total: response.data.total }));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/audit/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching audit stats:', error);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ['Date/Time', 'User', 'Action', 'Table', 'Record ID', 'Details'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.full_name || log.username,
        log.action,
        log.table_name,
        log.record_id || '-',
        JSON.stringify(log.new_values || {})
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const clearFilters = () => {
    setFilters({
      user_id: '',
      action: '',
      table_name: '',
      start_date: '',
      end_date: ''
    });
  };

  const nextPage = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const prevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  const getActionColor = (action) => {
    if (action.includes('CREATE')) return '#10b981';
    if (action.includes('UPDATE')) return '#3b82f6';
    if (action.includes('DELETE')) return '#ef4444';
    if (action.includes('LOGIN')) return '#8b5cf6';
    return 'var(--text-primary)';
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiShield size={32} color="#8b5cf6" />
        <h2 style={{ margin: 0 }}>Audit Log</h2>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-card-header">
              <div>
                <div className="stat-card-value">{stats.stats.total_logs}</div>
                <div className="stat-card-label">Total Logs</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <FiActivity />
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div>
                <div className="stat-card-value">{stats.stats.last_24h}</div>
                <div className="stat-card-label">Last 24 Hours</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <FiClock />
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div>
                <div className="stat-card-value">{stats.stats.unique_users}</div>
                <div className="stat-card-label">Active Users</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FiUser />
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div>
                <div className="stat-card-value">{stats.stats.creates}</div>
                <div className="stat-card-label">Creates</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FiDatabase />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FiFilter size={20} />
            Filters
          </h3>
          <button className="btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Action</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Table</label>
            <select
              value={filters.table_name}
              onChange={(e) => handleFilterChange('table_name', e.target.value)}
            >
              <option value="">All Tables</option>
              <option value="inventory">Inventory</option>
              <option value="transfers">Transfers</option>
              <option value="sales">Sales</option>
              <option value="users">Users</option>
              <option value="locations">Locations</option>
              <option value="deliveries">Deliveries</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Activity Log</h3>
          <button className="btn" onClick={handleExport} disabled={logs.length === 0}>
            <FiDownload size={16} />
            Export CSV
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiActivity />
            </div>
            <h3>No Audit Logs</h3>
            <p>No activity logs found for the selected filters</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Table</th>
                    <th>Record ID</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {log.full_name || log.username}
                      </td>
                      <td>
                        <span style={{ 
                          color: getActionColor(log.action),
                          fontWeight: 600,
                          fontSize: '12px'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {log.table_name}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {log.record_id || '-'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginTop: '20px',
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius)'
            }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} logs
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn" 
                  onClick={prevPage}
                  disabled={pagination.offset === 0}
                >
                  Previous
                </button>
                <button 
                  className="btn" 
                  onClick={nextPage}
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AuditLog;
