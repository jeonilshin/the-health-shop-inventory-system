import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity } from '../utils/formatNumber';
import {
  FiRefreshCw, FiAlertTriangle, FiPackage, FiCalendar, FiFilter, FiCheckCircle, FiX
} from 'react-icons/fi';

function Discrepancy() {
  const { user } = useContext(AuthContext);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all'); // 'all', 'shortage', 'return'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [rejectState, setRejectState] = useState({ id: null, note: '' });

  useEffect(() => {
    fetchDiscrepancies();
  }, []);

  const fetchDiscrepancies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/delivery-discrepancies');
      setDiscrepancies(res.data);
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this request? Inventory will be automatically adjusted.')) return;
    try {
      const res = await api.put(`/delivery-discrepancies/${id}/approve`);
      alert(res.data.message);
      fetchDiscrepancies();
    } catch (err) {
      alert(err.response?.data?.error || 'Error approving request');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectState.note.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    try {
      await api.put(`/delivery-discrepancies/${rejectState.id}/reject`, {
        admin_note: rejectState.note.trim()
      });
      setRejectState({ id: null, note: '' });
      fetchDiscrepancies();
    } catch (err) {
      alert(err.response?.data?.error || 'Error rejecting request');
    }
  };

  // Filter discrepancies
  const filteredDiscrepancies = discrepancies.filter(disc => {
    if (filterType !== 'all' && disc.type !== filterType) return false;
    if (filterStatus !== 'all' && disc.status !== filterStatus) return false;
    return true;
  });

  // Group by date
  const groupedByDate = filteredDiscrepancies.reduce((acc, disc) => {
    const date = new Date(disc.reported_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(disc);
    return acc;
  }, {});

  // Sort dates in descending order
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    return new Date(b) - new Date(a);
  });

  const getStatusBadge = (status) => {
    const map = {
      pending:  { color: '#f59e0b', text: 'Pending' },
      approved: { color: '#10b981', text: 'Approved' },
      rejected: { color: '#ef4444', text: 'Rejected' }
    };
    const b = map[status] || map.pending;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: `${b.color}20`,
        color: b.color
      }}>
        {b.text}
      </span>
    );
  };

  const getTypeBadge = (type) => {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: type === 'shortage' ? '#fef3c7' : '#ede9fe',
        color: type === 'shortage' ? '#92400e' : '#5b21b6'
      }}>
        {type === 'shortage' ? <FiAlertTriangle size={11} /> : <FiRefreshCw size={11} />}
        {type === 'shortage' ? 'Shortage' : 'Return'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
          <p>Loading discrepancies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiPackage size={32} color="#8b5cf6" />
          <div>
            <h2 style={{ margin: 0 }}>Discrepancy Records</h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              Track shortage reports and return requests
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiFilter size={16} color="#6b7280" />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>Filters:</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280' }}>Type:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '13px',
                background: 'var(--bg-input)'
              }}
            >
              <option value="all">All Types</option>
              <option value="shortage">Shortage Only</option>
              <option value="return">Return Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280' }}>Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '13px',
                background: 'var(--bg-input)'
              }}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
            Showing {filteredDiscrepancies.length} of {discrepancies.length} records
          </div>
        </div>
      </div>

      {/* Grouped Discrepancies */}
      {filteredDiscrepancies.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><FiPackage /></div>
            <h3>No Discrepancy Records</h3>
            <p>
              {filterType !== 'all' || filterStatus !== 'all'
                ? 'No records match your current filters'
                : 'No shortage reports or return requests have been filed yet'}
            </p>
          </div>
        </div>
      ) : (
        sortedDates.map(date => (
          <div key={date} className="card" style={{ marginBottom: '24px' }}>
            {/* Date Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '2px solid var(--border-color)'
            }}>
              <FiCalendar size={18} color="#8b5cf6" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#374151' }}>
                {date}
              </h3>
              <span style={{
                backgroundColor: '#f3f4f6',
                color: '#6b7280',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600
              }}>
                {groupedByDate[date].length} {groupedByDate[date].length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Items for this date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groupedByDate[date].map(disc => {
                const adjustQty = disc.type === 'shortage'
                  ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                  : parseFloat(disc.received_quantity);

                return (
                  <div
                    key={disc.id}
                    style={{
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: disc.status === 'pending' ? '#fffbeb' : 'var(--bg-card)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: user.role === 'admin' ? '1fr 2fr 1fr 1fr 1fr' : '1fr 2fr 1fr 1fr',
                      gap: '16px',
                      alignItems: 'center'
                    }}>
                      {/* Type Badge */}
                      <div>
                        {getTypeBadge(disc.type)}
                      </div>

                      {/* Item Details */}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                          {disc.item_description}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {disc.type === 'shortage' ? (
                            <>
                              Expected: {formatQuantity(disc.expected_quantity)} {disc.unit} • 
                              Received: {formatQuantity(disc.received_quantity)} {disc.unit}
                            </>
                          ) : (
                            <>
                              Return Quantity: {formatQuantity(disc.received_quantity)} {disc.unit}
                            </>
                          )}
                        </div>
                        {disc.note && (
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            marginTop: '6px',
                            fontStyle: 'italic'
                          }}>
                            Note: {disc.note}
                          </div>
                        )}
                      </div>

                      {/* Branch (Admin only) */}
                      {user.role === 'admin' && (
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            {disc.branch_name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {disc.reported_by_name}
                          </div>
                        </div>
                      )}

                      {/* Adjustment Amount */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                          {disc.type === 'shortage' ? 'Missing' : 'Returned'}
                        </div>
                        <div style={{
                          fontWeight: 700,
                          fontSize: '16px',
                          color: disc.status === 'approved' ? '#10b981' : '#374151'
                        }}>
                          {formatQuantity(adjustQty)}× {disc.unit}
                        </div>
                      </div>

                      {/* Status / Actions */}
                      <div style={{ textAlign: 'right' }}>
                        {disc.status === 'pending' && user.role === 'admin' ? (
                          // Admin actions for pending items
                          rejectState.id === disc.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                              <textarea
                                rows={2}
                                placeholder="Rejection reason (required)"
                                value={rejectState.note}
                                onChange={e => setRejectState(s => ({ ...s, note: e.target.value }))}
                                style={{
                                  width: '100%', padding: '6px 8px', fontSize: '12px',
                                  border: '1px solid #d1d5db', borderRadius: '6px',
                                  resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                                }}
                              />
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="btn"
                                  style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                                  onClick={handleRejectSubmit}
                                >
                                  Confirm Reject
                                </button>
                                <button
                                  className="btn"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={() => setRejectState({ id: null, note: '' })}
                                >
                                  <FiX size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <button
                                className="btn btn-success"
                                style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                                onClick={() => handleApprove(disc.id)}
                              >
                                <FiCheckCircle size={12} /> Approve
                              </button>
                              <button
                                className="btn"
                                style={{
                                  padding: '4px 10px', fontSize: '12px',
                                  background: '#fee2e2', color: '#b91c1c',
                                  border: '1px solid #fca5a5', whiteSpace: 'nowrap'
                                }}
                                onClick={() => setRejectState({ id: disc.id, note: '' })}
                              >
                                <FiX size={12} /> Reject
                              </button>
                            </div>
                          )
                        ) : (
                          // Status badge for non-pending or non-admin
                          <>
                            {getStatusBadge(disc.status)}
                            {disc.admin_note && (
                              <div style={{
                                fontSize: '11px',
                                color: '#6b7280',
                                marginTop: '6px',
                                fontStyle: 'italic'
                              }}>
                                Admin: {disc.admin_note}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default Discrepancy;
