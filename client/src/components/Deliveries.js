import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import DiscrepancyModal from './DiscrepancyModal';
import {
  FiTruck, FiPackage, FiCheck, FiClock, FiAlertCircle,
  FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiX, FiInfo
} from 'react-icons/fi';

function Deliveries() {
  const { user } = useContext(AuthContext);

  // ── deliveries ──
  const [deliveries, setDeliveries]                 = useState([]);
  const [awaitingAdmin, setAwaitingAdmin]           = useState([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState([]);

  // ── discrepancies ──
  const [discrepancies, setDiscrepancies] = useState([]);
  const [pendingDiscs, setPendingDiscs]   = useState([]);

  // ── modals / inline reject ──
  const [discModal, setDiscModal]     = useState({ open: false, type: null, delivery: null });
  const [rejectState, setRejectState] = useState({ id: null, note: '' });

  // ── history visibility ──
  const [showDiscHistory, setShowDiscHistory] = useState(false);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    await Promise.all([fetchDeliveries(), fetchDiscrepancies()]);
  };

  const fetchDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      const all = response.data;
      setDeliveries(all);

      if (user.role === 'admin') {
        setAwaitingAdmin(all.filter(d => d.status === 'awaiting_admin'));
      }
      if (user.role === 'branch_manager' || user.role === 'branch_staff') {
        setIncomingDeliveries(all.filter(d =>
          (d.status === 'admin_confirmed' || d.status === 'in_transit') &&
          d.to_location_id === user.location_id
        ));
      }
    } catch (error) {
      if (error.response?.status === 500) {
        alert('Database error: Please ensure all migrations have been run. Check SETUP_DELIVERY_SYSTEM.md');
      }
    }
  };

  const fetchDiscrepancies = async () => {
    try {
      const res = await api.get('/delivery-discrepancies');
      const all = res.data;
      setDiscrepancies(all);
      if (user.role === 'admin') {
        setPendingDiscs(all.filter(d => d.status === 'pending'));
      }
    } catch {
      // migration may not have run yet — silently skip
    }
  };

  // ── delivery actions ─────────────────────────────────────────────────────
  const handleAdminConfirm = async (id) => {
    if (!window.confirm('Confirm this delivery? The branch will be notified and can accept it.')) return;
    try {
      await api.post(`/deliveries/${id}/admin-confirm`);
      alert('Delivery confirmed! Branch has been notified.');
      fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
    }
  };

  const handleBranchAccept = async (id) => {
    if (!window.confirm('Accept this delivery? Items will be added to your inventory.')) return;
    try {
      await api.post(`/deliveries/${id}/accept`);
      alert('Delivery accepted! Items have been added to your inventory.');
      fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting delivery');
    }
  };

  // ── discrepancy actions ──────────────────────────────────────────────────
  const handleApprove = async (id) => {
    if (!window.confirm('Approve this request? Inventory will be automatically adjusted.')) return;
    try {
      const res = await api.put(`/delivery-discrepancies/${id}/approve`);
      alert(res.data.message);
      fetchAll();
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
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Error rejecting request');
    }
  };

  const openShortageModal = (delivery) => {
    const hasItems = delivery.items?.length > 0 && delivery.items[0]?.description;
    if (!hasItems) {
      alert('No item data available for this delivery.');
      return;
    }
    setDiscModal({ open: true, type: 'shortage', delivery });
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const getStatusBadge = (status) => {
    const badges = {
      pending:         { color: '#9ca3af', icon: <FiClock size={12} />,       text: 'Pending' },
      awaiting_admin:  { color: '#f59e0b', icon: <FiClock size={12} />,       text: 'Awaiting Admin' },
      admin_confirmed: { color: '#3b82f6', icon: <FiCheck size={12} />,       text: 'Admin Confirmed' },
      in_transit:      { color: '#8b5cf6', icon: <FiTruck size={12} />,       text: 'Shipped' },
      delivered:       { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Delivered' },
      cancelled:       { color: '#6b7280', icon: <FiAlertCircle size={12} />, text: 'Cancelled' }
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className="badge" style={{
        backgroundColor: `${badge.color}20`, color: badge.color,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
      }}>
        {badge.icon}{badge.text}
      </span>
    );
  };

  const getDiscStatusBadge = (status) => {
    const map = {
      pending:  { color: '#f59e0b', text: 'Pending Review' },
      approved: { color: '#10b981', text: 'Approved' },
      rejected: { color: '#ef4444', text: 'Rejected' }
    };
    const b = map[status] || map.pending;
    return (
      <span className="badge" style={{
        backgroundColor: `${b.color}20`, color: b.color,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
      }}>
        {b.text}
      </span>
    );
  };

  const canReportShortage = (delivery) =>
    delivery.status === 'delivered' &&
    (user.role === 'branch_manager' || user.role === 'admin');

  const isBranch = user.role === 'branch_manager' || user.role === 'branch_staff';

  return (
    <div className="container">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiTruck size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>Delivery Management</h2>
        </div>

        {user.role === 'branch_manager' && (
          <button
            className="btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              backgroundColor: '#8b5cf6', color: '#fff', border: 'none'
            }}
            onClick={() => setDiscModal({ open: true, type: 'return', delivery: null })}
          >
            <FiRefreshCw size={14} />
            Request Return to Warehouse
          </button>
        )}
      </div>

      {/* ── Admin: Awaiting Confirmation ─────────────────────────────────── */}
      {user.role === 'admin' && awaitingAdmin.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <FiClock size={20} />
            Deliveries Awaiting Your Confirmation ({awaitingAdmin.length})
          </h3>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These deliveries have been shipped and need your confirmation before branches can receive them
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>To</th><th>Items</th><th>Total Value</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {awaitingAdmin.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}</td>
                  <td>{delivery.from_location_name}</td>
                  <td>{delivery.to_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '12px', marginBottom: '5px' }}>
                        <strong>{item.description}</strong> - {formatQuantity(item.quantity)} {item.unit}
                      </div>
                    ))}
                  </td>
                  <td style={{ fontWeight: 600 }}>₱{formatPrice(delivery.total_value)}</td>
                  <td>
                    <button
                      className="btn btn-success"
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                      onClick={() => handleAdminConfirm(delivery.id)}
                    >
                      <FiCheck size={12} /> Confirm Delivery
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Admin: Pending Discrepancy / Return Requests ─────────────────── */}
      {user.role === 'admin' && pendingDiscs.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
            <FiAlertTriangle size={20} />
            Pending Discrepancy / Return Requests ({pendingDiscs.length})
          </h3>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px',
            padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#991b1b'
          }}>
            <FiInfo size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            Shortage: Adds missing quantity back to warehouse (branch inventory unchanged). Return: Removes from branch and adds to warehouse.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Branch</th>
                  <th>Expected</th>
                  <th>Received / Return Qty</th>
                  <th>To Adjust</th>
                  <th>Note</th>
                  <th>Reported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDiscs.map((disc) => {
                  const adjQty = disc.type === 'shortage'
                    ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                    : parseFloat(disc.received_quantity);

                  return (
                    <tr key={disc.id}>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                          background: disc.type === 'shortage' ? '#fef3c7' : '#ede9fe',
                          color:      disc.type === 'shortage' ? '#92400e'  : '#5b21b6'
                        }}>
                          {disc.type === 'shortage'
                            ? <FiAlertTriangle size={11} />
                            : <FiRefreshCw size={11} />}
                          {disc.type === 'shortage' ? 'Shortage' : 'Return'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{disc.branch_name}</td>
                      <td style={{ fontSize: '13px' }}>
                        {disc.type === 'shortage'
                          ? `${formatQuantity(disc.expected_quantity)} ${disc.unit}`
                          : '—'}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {formatQuantity(disc.received_quantity)} {disc.unit}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '14px' }}>
                          {formatQuantity(adjQty)} {disc.unit}
                        </span>
                      </td>
                      <td style={{ maxWidth: '180px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {disc.note}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(disc.reported_at).toLocaleDateString()}
                        <br />
                        <span style={{ fontSize: '11px' }}>{disc.reported_by_name}</span>
                      </td>
                      <td>
                        {rejectState.id === disc.id ? (
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
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Branch: Incoming Deliveries ──────────────────────────────────── */}
      {isBranch && incomingDeliveries.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #3b82f6', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
            <FiPackage size={20} />
            Incoming Deliveries ({incomingDeliveries.length})
          </h3>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These items are ready for delivery. Accept them to add to your inventory.
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>Items</th><th>Status</th>
                {user.role === 'branch_manager' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {incomingDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}</td>
                  <td>{delivery.from_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '12px', marginBottom: '5px' }}>
                        <strong>{item.description}</strong> - {formatQuantity(item.quantity)} {item.unit}
                      </div>
                    ))}
                  </td>
                  <td>{getStatusBadge(delivery.status)}</td>
                  {user.role === 'branch_manager' && (
                    <td>
                      <button
                        className="btn btn-success"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleBranchAccept(delivery.id)}
                      >
                        <FiCheckCircle size={12} /> Accept Delivery
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delivery History ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiTruck size={20} />
          {user.role === 'warehouse' ? 'Outgoing Deliveries' : 'Delivery History'}
        </h3>

        {deliveries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FiTruck /></div>
            <h3>No Deliveries Yet</h3>
            <p>Deliveries are automatically created when transfers are shipped</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Items</th>
                  {user.role === 'admin' && <th>Total Value</th>}
                  <th>Status</th>
                  <th>Created By</th>
                  {user.role === 'admin' && <th>Confirmed By</th>}
                  {(user.role === 'branch_manager' || user.role === 'admin') && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}</td>
                    <td>{delivery.from_location_name}</td>
                    <td>{delivery.to_location_name}</td>
                    <td>
                      {delivery.items && delivery.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '12px', marginBottom: '5px' }}>
                          <strong>{item.description}</strong> - {formatQuantity(item.quantity)} {item.unit}
                        </div>
                      ))}
                    </td>
                    {user.role === 'admin' && (
                      <td style={{ fontWeight: 600 }}>₱{formatPrice(delivery.total_value)}</td>
                    )}
                    <td>{getStatusBadge(delivery.status)}</td>
                    <td>{delivery.created_by_name}</td>
                    {user.role === 'admin' && (
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {delivery.admin_confirmed_by_name || '-'}
                      </td>
                    )}
                    {(user.role === 'branch_manager' || user.role === 'admin') && (
                      <td>
                        {canReportShortage(delivery) && (
                          <button
                            className="btn"
                            style={{
                              padding: '4px 10px', fontSize: '12px',
                              background: '#fef3c7', color: '#92400e',
                              border: '1px solid #f59e0b',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              whiteSpace: 'nowrap'
                            }}
                            onClick={() => openShortageModal(delivery)}
                          >
                            <FiAlertTriangle size={11} /> Report Shortage
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Shortage & Return History ─────────────────────────────────────── */}
      {discrepancies.length > 0 && (
        <div className="card">
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowDiscHistory(h => !h)}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FiAlertTriangle size={20} color="#f59e0b" />
              Shortage &amp; Return History
              <span style={{
                background: '#f3f4f6', borderRadius: '12px',
                padding: '2px 8px', fontSize: '13px', fontWeight: 600, color: '#374151'
              }}>
                {discrepancies.length}
              </span>
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {showDiscHistory ? 'Hide ▲' : 'Show ▼'}
            </span>
          </div>

          {showDiscHistory && (
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    {user.role === 'admin' && <th>Branch</th>}
                    <th>Expected</th>
                    <th>Received / Return</th>
                    <th>Adjustment</th>
                    <th>Note</th>
                    <th>Status</th>
                    <th>Admin Note</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map((disc) => {
                    const adjQty = disc.type === 'shortage'
                      ? parseFloat(disc.expected_quantity) - parseFloat(disc.received_quantity)
                      : parseFloat(disc.received_quantity);

                    return (
                      <tr key={disc.id}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                            background: disc.type === 'shortage' ? '#fef3c7' : '#ede9fe',
                            color:      disc.type === 'shortage' ? '#92400e'  : '#5b21b6'
                          }}>
                            {disc.type === 'shortage'
                              ? <FiAlertTriangle size={11} />
                              : <FiRefreshCw size={11} />}
                            {disc.type === 'shortage' ? 'Shortage' : 'Return'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                        </td>
                        {user.role === 'admin' && (
                          <td style={{ fontSize: '13px' }}>{disc.branch_name}</td>
                        )}
                        <td style={{ fontSize: '13px' }}>
                          {disc.type === 'shortage'
                            ? `${formatQuantity(disc.expected_quantity)} ${disc.unit}`
                            : '—'}
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          {formatQuantity(disc.received_quantity)} {disc.unit}
                        </td>
                        <td style={{ fontWeight: 700, color: '#374151', fontSize: '14px' }}>
                          {formatQuantity(adjQty)} {disc.unit}
                        </td>
                        <td style={{ maxWidth: '180px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {disc.note}
                        </td>
                        <td>{getDiscStatusBadge(disc.status)}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '160px' }}>
                          {disc.admin_note || '—'}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(disc.reported_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Discrepancy / Return Modal ───────────────────────────────────── */}
      {discModal.open && (
        <DiscrepancyModal
          type={discModal.type}
          delivery={discModal.delivery}
          onClose={() => setDiscModal({ open: false, type: null, delivery: null })}
          onSuccess={() => {
            setDiscModal({ open: false, type: null, delivery: null });
            alert(discModal.type === 'shortage'
              ? 'Shortage report submitted! Admin will review shortly.'
              : 'Return request submitted! Admin will review shortly.');
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

export default Deliveries;
