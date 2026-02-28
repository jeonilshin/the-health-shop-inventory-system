import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiTruck, FiPackage, FiCheck, FiClock, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

function Deliveries() {
  const { user } = useContext(AuthContext);
  const [deliveries, setDeliveries] = useState([]);
  const [awaitingAdmin, setAwaitingAdmin] = useState([]);
  const [incomingDeliveries, setIncomingDeliveries] = useState([]);

  useEffect(() => {
    fetchDeliveries();
    
    // Auto-refresh every 10 seconds (more frequent for real-time feel)
    const interval = setInterval(fetchDeliveries, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      const allDeliveries = response.data;
      
      setDeliveries(allDeliveries);
      
      // Filter awaiting admin confirmation (for admin only)
      if (user.role === 'admin') {
        setAwaitingAdmin(allDeliveries.filter(d => d.status === 'awaiting_admin'));
      }
      
      // Filter incoming deliveries (for branch managers)
      if (user.role === 'branch_manager' || user.role === 'branch_staff') {
        setIncomingDeliveries(allDeliveries.filter(d => 
          d.status === 'admin_confirmed' && d.to_location_id === user.location_id
        ));
      }
    } catch (error) {
      if (error.response?.status === 500) {
        alert('Database error: Please ensure all migrations have been run. Check SETUP_DELIVERY_SYSTEM.md');
      }
    }
  };

  const handleAdminConfirm = async (id) => {
    if (!window.confirm('Confirm this delivery? The branch will be notified and can accept it.')) return;
    try {
      await api.post(`/deliveries/${id}/admin-confirm`);
      alert('Delivery confirmed! Branch has been notified.');
      fetchDeliveries();
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
    }
  };

  const handleBranchAccept = async (id) => {
    if (!window.confirm('Accept this delivery? Items will be added to your inventory.')) return;
    try {
      await api.post(`/deliveries/${id}/accept`);
      alert('Delivery accepted! Items have been added to your inventory.');
      fetchDeliveries();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting delivery');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      awaiting_admin: { color: '#f59e0b', icon: <FiClock size={12} />, text: 'Awaiting Admin' },
      admin_confirmed: { color: '#3b82f6', icon: <FiCheck size={12} />, text: 'Admin Confirmed' },
      delivered: { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Delivered' },
      cancelled: { color: '#6b7280', icon: <FiAlertCircle size={12} />, text: 'Cancelled' }
    };
    
    const badge = badges[status] || badges.awaiting_admin;
    
    return (
      <span className="badge" style={{ 
        backgroundColor: `${badge.color}20`, 
        color: badge.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiTruck size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Delivery Management</h2>
      </div>

      {/* Admin: Awaiting Confirmation Section */}
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
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Items</th>
                <th>Total Value</th>
                <th>Actions</th>
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
                      <FiCheck size={12} />
                      Confirm Delivery
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch: Incoming Deliveries Section */}
      {(user.role === 'branch_manager' || user.role === 'branch_staff') && incomingDeliveries.length > 0 && (
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
                <th>Date</th>
                <th>From</th>
                <th>Items</th>
                <th>Status</th>
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
                        <FiCheckCircle size={12} />
                        Accept Delivery
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All Deliveries */}
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiTruck size={20} />
          {user.role === 'warehouse' ? 'Outgoing Deliveries' : 'Delivery History'}
        </h3>
        
        {deliveries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiTruck />
            </div>
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

export default Deliveries;
