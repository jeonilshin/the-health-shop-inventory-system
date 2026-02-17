import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiSend, FiPackage, FiAlertCircle, FiCheck, FiX, FiTruck, FiClock, FiCheckCircle, FiXCircle } from 'react-icons/fi';

function Transfers() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    inventory_item_id: '',
    quantity: '',
    notes: ''
  });
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchTransfers();
    if (user.role === 'admin' || user.role === 'warehouse') {
      fetchPendingApprovals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formData.from_location_id) {
      fetchInventory(formData.from_location_id);
    } else {
      setInventory([]);
      setSelectedItem(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.from_location_id]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
      
      if (user.location_id) {
        setFormData(prev => ({ ...prev, from_location_id: user.location_id }));
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchInventory = async (locationId) => {
    try {
      setLoading(true);
      const response = await api.get(`/inventory/location/${locationId}`);
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransfers = async () => {
    try {
      const response = await api.get('/transfers');
      setTransfers(response.data);
    } catch (error) {
      console.error('Error fetching transfers:', error);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      const response = await api.get('/transfers/pending');
      setPendingApprovals(response.data);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
    }
  };

  const handleItemSelect = (e) => {
    const itemId = e.target.value;
    setFormData({ ...formData, inventory_item_id: itemId, quantity: '' });
    
    if (itemId) {
      const item = inventory.find(inv => inv.id === parseInt(itemId));
      setSelectedItem(item);
    } else {
      setSelectedItem(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedItem) {
      alert('Please select an item');
      return;
    }
    
    if (parseFloat(formData.quantity) > parseFloat(selectedItem.quantity)) {
      alert(`Insufficient quantity. Available: ${selectedItem.quantity}`);
      return;
    }
    
    try {
      setLoading(true);
      await api.post('/transfers', {
        from_location_id: formData.from_location_id,
        to_location_id: formData.to_location_id,
        description: selectedItem.description,
        unit: selectedItem.unit,
        quantity: formData.quantity,
        unit_cost: selectedItem.unit_cost,
        notes: formData.notes
      });
      
      setShowForm(false);
      setFormData({
        from_location_id: user.location_id || '',
        to_location_id: '',
        inventory_item_id: '',
        quantity: '',
        notes: ''
      });
      setSelectedItem(null);
      fetchTransfers();
      if (user.role === 'admin' || user.role === 'warehouse') {
        fetchPendingApprovals();
      }
      alert(user.role === 'branch_manager' 
        ? 'Transfer request submitted! Awaiting approval from warehouse.' 
        : 'Transfer created successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error creating transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this transfer request?')) return;
    try {
      await api.post(`/transfers/${id}/approve`);
      fetchTransfers();
      fetchPendingApprovals();
      alert('Transfer approved!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error approving transfer');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      await api.post(`/transfers/${id}/reject`, { rejection_reason: reason });
      fetchTransfers();
      fetchPendingApprovals();
      alert('Transfer rejected');
    } catch (error) {
      alert(error.response?.data?.error || 'Error rejecting transfer');
    }
  };

  const handleShip = async (id) => {
    if (!window.confirm('Mark this transfer as shipped? Inventory will be deducted from source.')) return;
    try {
      await api.post(`/transfers/${id}/ship`);
      fetchTransfers();
      alert('Transfer marked as shipped! Inventory has been deducted.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error shipping transfer');
    }
  };

  const handleDeliver = async (id) => {
    if (!window.confirm('Confirm delivery arrival? Inventory will be added to your location.')) return;
    try {
      await api.post(`/transfers/${id}/deliver`);
      fetchTransfers();
      alert('Delivery confirmed! Inventory has been added to your location.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this transfer?')) return;
    try {
      await api.post(`/transfers/${id}/cancel`);
      fetchTransfers();
      if (user.role === 'admin' || user.role === 'warehouse') {
        fetchPendingApprovals();
      }
      alert('Transfer cancelled');
    } catch (error) {
      alert(error.response?.data?.error || 'Error cancelling transfer');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: '#f59e0b', icon: <FiClock size={12} />, text: 'Pending' },
      approved: { color: '#3b82f6', icon: <FiCheck size={12} />, text: 'Approved' },
      in_transit: { color: '#8b5cf6', icon: <FiTruck size={12} />, text: 'In Transit' },
      delivered: { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Delivered' },
      rejected: { color: '#ef4444', icon: <FiXCircle size={12} />, text: 'Rejected' },
      cancelled: { color: '#6b7280', icon: <FiX size={12} />, text: 'Cancelled' }
    };
    
    const badge = badges[status] || badges.pending;
    
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

  const canApprove = (transfer) => {
    return (user.role === 'admin' || user.role === 'warehouse') && 
           transfer.status === 'pending';
  };

  const canShip = (transfer) => {
    return (user.role === 'admin' || user.role === 'warehouse') && 
           transfer.status === 'approved';
  };

  const canDeliver = (transfer) => {
    return (user.role === 'admin' || user.role === 'branch_manager') && 
           transfer.status === 'in_transit' &&
           (user.role === 'admin' || transfer.to_location_id === user.location_id);
  };

  const canCancel = (transfer) => {
    return (transfer.status === 'pending' || transfer.status === 'approved') &&
           (user.role === 'admin' || transfer.transferred_by === user.id);
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiSend size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Inventory Transfers</h2>
      </div>

      {/* Pending Approvals Section */}
      {(user.role === 'admin' || user.role === 'warehouse') && pendingApprovals.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <FiClock size={20} />
            Pending Approvals ({pendingApprovals.length})
          </h3>
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <FiAlertCircle size={16} />
            These transfer requests need your approval
          </div>
          <table>
            <thead>
              <tr>
                <th>Requested By</th>
                <th>From</th>
                <th>To</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map((transfer) => (
                <tr key={transfer.id}>
                  <td>{transfer.transferred_by_name}</td>
                  <td>{transfer.from_location_name}</td>
                  <td>{transfer.to_location_name}</td>
                  <td style={{ fontWeight: 600 }}>{transfer.description}</td>
                  <td>{formatQuantity(transfer.quantity)} {transfer.unit}</td>
                  <td>₱{formatPrice(parseFloat(transfer.quantity) * parseFloat(transfer.unit_cost))}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        className="btn btn-success"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleApprove(transfer.id)}
                      >
                        <FiCheck size={12} />
                        Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        onClick={() => handleReject(transfer.id)}
                      >
                        <FiX size={12} />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiPackage size={20} />
            {user.role === 'branch_manager' ? 'Transfer Requests' : 'Transfer History'}
          </h3>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <FiSend size={16} />
            {showForm ? 'Cancel' : (user.role === 'branch_manager' ? 'Request Transfer' : 'New Transfer')}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)' }}>
            <h4 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiSend size={18} />
              {user.role === 'branch_manager' ? 'Request Transfer' : 'Create Transfer'}
            </h4>
            
            <div className="form-group">
              <label>From Location (Source)</label>
              <select
                value={formData.from_location_id}
                onChange={(e) => setFormData({ ...formData, from_location_id: e.target.value, inventory_item_id: '', quantity: '' })}
                disabled={user.role !== 'admin' && user.location_id}
                required
              >
                <option value="">Select source location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>To Location (Destination)</label>
              <select
                value={formData.to_location_id}
                onChange={(e) => setFormData({ ...formData, to_location_id: e.target.value })}
                required
              >
                <option value="">Select destination location</option>
                {locations.filter(loc => loc.id !== parseInt(formData.from_location_id)).map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            </div>

            {formData.from_location_id && (
              <>
                <div className="form-group">
                  <label>Select Item from Inventory</label>
                  {loading ? (
                    <div className="spinner" style={{ width: '24px', height: '24px', margin: '10px 0' }}></div>
                  ) : inventory.length === 0 ? (
                    <div className="alert alert-warning">
                      <FiAlertCircle size={16} />
                      No inventory items available at this location
                    </div>
                  ) : (
                    <select
                      value={formData.inventory_item_id}
                      onChange={handleItemSelect}
                      required
                    >
                      <option value="">Select an item</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.description} - {formatQuantity(item.quantity)} {item.unit} available @ ₱{formatPrice(item.unit_cost)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedItem && (
                  <div style={{ 
                    padding: '16px', 
                    backgroundColor: 'rgba(37, 99, 235, 0.05)', 
                    borderRadius: 'var(--radius)', 
                    marginBottom: '16px',
                    border: '1px solid rgba(37, 99, 235, 0.2)'
                  }}>
                    <h5 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>Selected Item Details:</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                      <div>
                        <strong>Description:</strong> {selectedItem.description}
                      </div>
                      <div>
                        <strong>Unit:</strong> {selectedItem.unit}
                      </div>
                      <div>
                        <strong>Available Quantity:</strong> <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{formatQuantity(selectedItem.quantity)}</span>
                      </div>
                      <div>
                        <strong>Unit Cost:</strong> ₱{formatPrice(selectedItem.unit_cost)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Quantity to Transfer</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedItem ? selectedItem.quantity : undefined}
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder={selectedItem ? `Max: ${selectedItem.quantity}` : 'Select an item first'}
                    disabled={!selectedItem}
                    required
                  />
                  {selectedItem && formData.quantity && parseFloat(formData.quantity) > parseFloat(selectedItem.quantity) && (
                    <div className="alert alert-error" style={{ marginTop: '8px' }}>
                      <FiAlertCircle size={14} />
                      Quantity exceeds available stock ({selectedItem.quantity})
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows="3"
                    placeholder="Add any notes about this transfer..."
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-success" 
                  disabled={loading || !selectedItem || !formData.quantity || parseFloat(formData.quantity) > parseFloat(selectedItem?.quantity || 0)}
                >
                  {loading ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <FiCheck size={16} />
                      {user.role === 'branch_manager' ? 'Submit Request' : 'Create Transfer'}
                    </>
                  )}
                </button>
              </>
            )}
          </form>
        )}

        {transfers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiSend />
            </div>
            <h3>No Transfers Yet</h3>
            <p>Start transferring inventory between locations</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Value</th>
                  <th>Requested By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>{new Date(transfer.transfer_date).toLocaleDateString()}</td>
                    <td>{getStatusBadge(transfer.status)}</td>
                    <td>{transfer.from_location_name}</td>
                    <td>{transfer.to_location_name}</td>
                    <td style={{ fontWeight: 600 }}>{transfer.description}</td>
                    <td>{formatQuantity(transfer.quantity)} {transfer.unit}</td>
                    <td style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(transfer.quantity) * parseFloat(transfer.unit_cost))}</td>
                    <td>{transfer.transferred_by_name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {canApprove(transfer) && (
                          <>
                            <button
                              className="btn btn-success"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => handleApprove(transfer.id)}
                            >
                              <FiCheck size={12} />
                              Approve
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => handleReject(transfer.id)}
                            >
                              <FiX size={12} />
                              Reject
                            </button>
                          </>
                        )}
                        {canShip(transfer) && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#8b5cf6', color: 'white' }}
                            onClick={() => handleShip(transfer.id)}
                          >
                            <FiTruck size={12} />
                            Ship
                          </button>
                        )}
                        {canDeliver(transfer) && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleDeliver(transfer.id)}
                          >
                            <FiCheckCircle size={12} />
                            Confirm Arrival
                          </button>
                        )}
                        {canCancel(transfer) && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6b7280', color: 'white' }}
                            onClick={() => handleCancel(transfer.id)}
                          >
                            <FiX size={12} />
                            Cancel
                          </button>
                        )}
                        {transfer.status === 'rejected' && transfer.rejection_reason && (
                          <span style={{ fontSize: '11px', color: '#ef4444', fontStyle: 'italic' }}>
                            Reason: {transfer.rejection_reason}
                          </span>
                        )}
                      </div>
                    </td>
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

export default Transfers;
