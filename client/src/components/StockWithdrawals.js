import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity } from '../utils/formatNumber';
import {
  FiLogOut, FiFilter, FiCalendar, FiDownload, FiTrash2, FiUser, FiMapPin, FiPackage
} from 'react-icons/fi';

const TYPE_BADGE = {
  employee_purchase: { bg: '#fef3c7', color: '#92400e', label: 'Employee Purchase' },
  principal:         { bg: '#ede9fe', color: '#5b21b6', label: 'Principal / Owner' },
  outside_party:     { bg: '#fee2e2', color: '#b91c1c', label: 'Outside Party (DFA)' }
};

function getSevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function StockWithdrawals() {
  const { user } = useContext(AuthContext);
  const [list, setList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: getSevenDaysAgo(),
    endDate:   new Date().toISOString().split('T')[0],
    type:      'all',
    locationId: 'all'
  });

  useEffect(() => {
    fetchLocations();
    fetchList();
    const onTab = () => fetchList();
    window.addEventListener('tab-visible', onTab);
    return () => window.removeEventListener('tab-visible', onTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations');
      setLocations(res.data);
    } catch { /* ignore */ }
  };

  const fetchList = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate)   params.append('endDate', filters.endDate);
      if (filters.type !== 'all')       params.append('type', filters.type);
      if (filters.locationId !== 'all') params.append('locationId', filters.locationId);
      const res = await api.get(`/stock-withdrawals?${params.toString()}`);
      setList(res.data);
    } catch (err) {
      console.error('Error fetching withdrawals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Reverse this pull-out?\n\n${row.quantity} ${row.unit} of "${row.item_description}" will be added back to inventory at ${row.location_name}.\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/stock-withdrawals/${row.id}`);
      fetchList();
    } catch (err) {
      alert(err.response?.data?.error || 'Error reversing withdrawal');
    }
  };

  const handleDownload = () => {
    const headers = ['Date', 'Type', 'Item', 'Unit', 'Quantity', 'Location', 'Pulled Out By', 'Recipient', 'Notes'];
    const rows = list.map(r => [
      new Date(r.withdrawn_at).toLocaleString(),
      TYPE_BADGE[r.withdrawal_type]?.label || r.withdrawal_type,
      r.item_description,
      r.unit,
      r.quantity,
      r.location_name,
      r.withdrawn_by_full_name || r.withdrawn_by_name || '',
      r.recipient_name,
      (r.notes || '').replace(/\r?\n/g, ' ')
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_withdrawals_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalQty = list.reduce((s, r) => s + parseFloat(r.quantity || 0), 0);

  if (loading) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
          <p>Loading stock withdrawals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiLogOut size={32} color="#b91c1c" />
          <div>
            <h2 style={{ margin: 0 }}>Stock Withdrawals</h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              Every pull-out from a branch or warehouse — employee purchases, principal/owner pull-outs and outside-party hand-offs.
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Pull-outs in range</div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{list.length}</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Items Pulled</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#b91c1c' }}>{Math.round(totalQty)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiFilter size={16} color="#6b7280" />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Filters:</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiCalendar size={14} color="#6b7280" />
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
              style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-input)' }}
            />
            <span style={{ fontSize: '13px', color: '#6b7280' }}>→</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
              style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-input)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280' }}>Type:</label>
            <select
              value={filters.type}
              onChange={e => setFilters({ ...filters, type: e.target.value })}
              style={{ padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-input)' }}
            >
              <option value="all">All Types</option>
              <option value="employee_purchase">Employee Purchase</option>
              <option value="principal">Principal / Owner</option>
              <option value="outside_party">Outside Party (DFA)</option>
            </select>
          </div>

          {(user.role === 'admin' || user.role === 'audit') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: '#6b7280' }}>Location:</label>
              <select
                value={filters.locationId}
                onChange={e => setFilters({ ...filters, locationId: e.target.value })}
                style={{ padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-input)' }}
              >
                <option value="all">All Locations</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={handleDownload}
              disabled={list.length === 0}
              className="btn"
              style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', opacity: list.length === 0 ? 0.5 : 1 }}
            >
              <FiDownload size={13} /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <FiPackage size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <div>No stock withdrawals match the current filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th><FiMapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Location</th>
                  <th><FiUser size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Pulled out by</th>
                  <th>Recipient</th>
                  <th>Notes</th>
                  {user.role === 'admin' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {list.map(row => {
                  const badge = TYPE_BADGE[row.withdrawal_type] || { bg: '#f3f4f6', color: '#374151', label: row.withdrawal_type };
                  return (
                    <tr key={row.id}>
                      <td style={{ fontSize: '12px' }}>
                        <div>{new Date(row.withdrawn_at).toLocaleDateString()}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{new Date(row.withdrawn_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px',
                          borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: badge.bg, color: badge.color, whiteSpace: 'nowrap'
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.item_description}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.unit}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatQuantity(row.quantity)}</td>
                      <td>
                        <span className={`badge ${row.location_type === 'warehouse' ? 'badge-primary' : 'badge-info'}`}>
                          {row.location_name}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{row.withdrawn_by_full_name || row.withdrawn_by_name || '—'}</td>
                      <td style={{ fontSize: '12px', fontWeight: 500 }}>{row.recipient_name}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '220px' }}>{row.notes || '—'}</td>
                      {user.role === 'admin' && (
                        <td>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleDelete(row)}
                            title="Reverse withdrawal — restores stock"
                          >
                            <FiTrash2 size={12} /> Reverse
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default StockWithdrawals;
