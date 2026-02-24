import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiSend, FiPackage, FiAlertCircle, FiCheck, FiX, FiTruck, FiClock, FiCheckCircle, FiXCircle, FiTrash2 } from 'react-icons/fi';

function Transfers() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTransferId, setRejectTransferId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    notes: '',
    items: [{ inventory_item_id: '', quantity: '', selectedItem: null }]
  });
  const [requestFormData, setRequestFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    notes: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchTransfers();
    if (user.role === 'admin') {
      fetchPendingApprovals();
    }
    if (user.role === 'branch_manager') {
      fetchInventoryHistory();
    }
    
    // Real-time updates every 5 seconds
    const interval = setInterval(() => {
      fetchTransfers();
      if (user.role === 'admin') {
        fetchPendingApprovals();
      }
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formData.from_location_id) {
      fetchInventory(formData.from_location_id);
    } else {
      setInventory([]);
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
      console.log('Fetched transfers:', response.data); // Debug log
      console.log('In transit transfers:', response.data.filter(t => t.status === 'in_transit')); // Debug log
      setTransfers(response.data);
    } catch (error) {
      console.error('Error fetching transfers:', error);
      console.error('Error details:', error.response?.data);
      // Set empty array on error to prevent crashes
      setTransfers([]);
      if (error.response?.status === 500) {
        alert('Database error: Please check backend logs. The users table may be missing the full_name column.');
      }
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

  const fetchInventoryHistory = async () => {
    try {
      const response = await api.get('/inventory/history');
      setInventoryHistory(response.data);
    } catch (error) {
      console.error('Error fetching inventory history:', error);
    }
  };

  const handleHistoryItemSelect = (e) => {
    const value = e.target.value;
    if (value) {
      const [description, unit] = value.split('|||');
      const item = inventoryHistory.find(h => h.description === description && h.unit === unit);
      if (item) {
        setRequestFormData({
          ...requestFormData,
          description: item.description,
          unit: item.unit,
          unit_cost: item.unit_cost || ''
        });
      }
    } else {
      setRequestFormData({
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        notes: ''
      });
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      // Find warehouse location
      const warehouse = locations.find(loc => loc.type === 'warehouse');
      if (!warehouse) {
        alert('No warehouse found. Please contact admin.');
        return;
      }

      await api.post('/transfers', {
        from_location_id: warehouse.id,
        to_location_id: user.location_id,
        description: requestFormData.description,
        unit: requestFormData.unit,
        quantity: requestFormData.quantity,
        unit_cost: requestFormData.unit_cost,
        notes: requestFormData.notes
      });
      
      setShowRequestForm(false);
      setRequestFormData({
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        notes: ''
      });
      fetchTransfers();
      alert('Request submitted to warehouse! Awaiting approval.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error submitting request');
    } finally {
      setLoading(false);
    }
  };

  const handleItemSelect = (index, itemId) => {
    const newItems = [...formData.items];
    newItems[index].inventory_item_id = itemId;
    
    if (itemId) {
      const item = inventory.find(inv => inv.id === parseInt(itemId));
      newItems[index].selectedItem = item;
      newItems[index].quantity = '';
    } else {
      newItems[index].selectedItem = null;
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventory_item_id: '', quantity: '', selectedItem: null }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItemQuantity = (index, quantity) => {
    const newItems = [...formData.items];
    newItems[index].quantity = quantity;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all items
    for (const item of formData.items) {
      if (!item.selectedItem) {
        alert('Please select an item for all rows');
        return;
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        alert('Please enter valid quantities for all items');
        return;
      }
      if (parseFloat(item.quantity) > parseFloat(item.selectedItem.quantity)) {
        alert(`Insufficient quantity for ${item.selectedItem.description}. Available: ${item.selectedItem.quantity}`);
        return;
      }
    }
    
    try {
      setLoading(true);
      
      // Create transfer for each item (skip individual notifications)
      const createdTransfers = [];
      for (let i = 0; i < formData.items.length; i++) {
        const item = formData.items[i];
        const response = await api.post('/transfers', {
          from_location_id: formData.from_location_id,
          to_location_id: formData.to_location_id,
          description: item.selectedItem.description,
          unit: item.selectedItem.unit,
          quantity: item.quantity,
          unit_cost: item.selectedItem.unit_cost,
          notes: formData.notes,
          skip_notification: true // Always skip individual notifications
        });
        createdTransfers.push(response.data);
      }
      
      // Send ONE batch notification after all transfers created
      if (createdTransfers.length > 0 && createdTransfers[0].status === 'pending') {
        await api.post('/transfers/batch-notify', {
          transfer_ids: createdTransfers.map(t => t.id),
          item_count: createdTransfers.length,
          to_location_id: formData.to_location_id
        });
      }
      
      setShowForm(false);
      setFormData({
        from_location_id: user.location_id || '',
        to_location_id: '',
        notes: '',
        items: [{ inventory_item_id: '', quantity: '', selectedItem: null }]
      });
      fetchTransfers();
      if (user.role === 'admin' || user.role === 'warehouse') {
        fetchPendingApprovals();
      }
      alert(formData.items.length > 1 
        ? `Successfully created ${formData.items.length} transfers!`
        : user.role === 'branch_manager' 
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
      await fetchTransfers();
      await fetchPendingApprovals();
      alert('Transfer approved successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error approving transfer');
    }
  };

  const handleReject = async (id) => {
    setRejectTransferId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectTransferId) return;
    
    try {
      await api.post(`/transfers/${rejectTransferId}/reject`, { 
        rejection_reason: rejectionReason.trim() || null 
      });
      await fetchTransfers();
      await fetchPendingApprovals();
      setShowRejectModal(false);
      setRejectTransferId(null);
      setRejectionReason('');
      alert('Transfer rejected');
    } catch (error) {
      alert(error.response?.data?.error || 'Error rejecting transfer');
    }
  };

  const handleCleanHistory = async () => {
    if (!window.confirm('⚠️ WARNING: This will permanently delete ALL transfer history. This action cannot be undone. Are you sure?')) return;
    
    try {
      setLoading(true);
      const response = await api.delete('/transfers/clean-history');
      await fetchTransfers();
      await fetchPendingApprovals();
      alert(response.data.message || 'Transfer history cleaned successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Error cleaning transfer history');
    } finally {
      setLoading(false);
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
    if (!window.confirm('Confirm that you have received this transfer? Inventory will be added to your location.')) return;
    try {
      await api.post(`/transfers/${id}/deliver`);
      await fetchTransfers();
      alert('Transfer received! Inventory has been added to your location.');
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming receipt');
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
      delivered: { color: '#10b981', icon: <FiCheckCircle size={12} />, text: 'Completed' },
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
    return user.role === 'admin' && transfer.status === 'pending';
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiSend size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>Inventory Transfers</h2>
        </div>
        {user.role === 'admin' && (
          <button
            className="btn btn-danger"
            onClick={handleCleanHistory}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FiTrash2 size={16} />
            Clean History
          </button>
        )}
      </div>

      {/* Pending Approvals Section */}
      {user.role === 'admin' && pendingApprovals.length > 0 && (
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiPackage size={20} />
            {user.role === 'branch_manager' ? 'Transfer Requests' : 'Transfer History'}
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {user.role === 'branch_manager' && (
              <button className="btn btn-success" onClick={() => { setShowRequestForm(!showRequestForm); setShowForm(false); }}>
                <FiPackage size={16} />
                {showRequestForm ? 'Cancel' : 'Request from Warehouse'}
              </button>
            )}
            {(user.role === 'admin' || user.role === 'warehouse' || user.role === 'branch_manager') && (
              <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowRequestForm(false); }}>
                <FiSend size={16} />
                {showForm ? 'Cancel' : (user.role === 'branch_manager' ? 'Transfer to Branch' : 'New Transfer')}
              </button>
            )}
          </div>
        </div>

        {/* Request from Warehouse Form (Branch Managers Only) */}
        {showRequestForm && user.role === 'branch_manager' && (
          <form onSubmit={handleRequestSubmit} style={{ marginBottom: '20px', padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '2px solid var(--primary)' }}>
            <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
              <FiPackage size={18} />
              Request Item from Warehouse
            </h4>
            
            <div className="alert alert-info" style={{ marginBottom: '16px' }}>
              <FiAlertCircle size={16} />
              You can only request items that have been in inventory history. Select from the list below.
            </div>

            <div className="form-group">
              <label>Select Item from History</label>
              <select
                onChange={handleHistoryItemSelect}
                required
              >
                <option value="">-- Select an item --</option>
                {inventoryHistory.map((item, index) => (
                  <option key={index} value={`${item.description}|||${item.unit}`}>
                    {item.description} ({item.unit})
                  </option>
                ))}
              </select>
            </div>

            {requestFormData.description && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      value={requestFormData.description}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      value={requestFormData.unit}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Quantity Needed *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={requestFormData.quantity}
                      onChange={(e) => setRequestFormData({ ...requestFormData, quantity: e.target.value })}
                      required
                      min="0.01"
                    />
                  </div>

                  <div className="form-group">
                    <label>Unit Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      value={requestFormData.unit_cost}
                      onChange={(e) => setRequestFormData({ ...requestFormData, unit_cost: e.target.value })}
                      required
                      min="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea
                    value={requestFormData.notes}
                    onChange={(e) => setRequestFormData({ ...requestFormData, notes: e.target.value })}
                    rows="3"
                    placeholder="Add any special instructions or notes..."
                  />
                </div>

                <button type="submit" className="btn btn-success" disabled={loading}>
                  <FiPackage size={16} />
                  {loading ? 'Submitting...' : 'Submit Request to Warehouse'}
                </button>
              </>
            )}
          </form>
        )}

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
                onChange={(e) => setFormData({ ...formData, from_location_id: e.target.value, items: [{ inventory_item_id: '', quantity: '', selectedItem: null }] })}
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
                {loading ? (
                  <div className="spinner" style={{ width: '24px', height: '24px', margin: '20px 0' }}></div>
                ) : inventory.length === 0 ? (
                  <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
                    <FiAlertCircle size={16} />
                    No inventory items available at this location
                  </div>
                ) : (
                  <>
                    <h5 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiPackage size={16} />
                      Items to Transfer
                    </h5>
                    
                    {formData.items.map((item, index) => (
                      <div key={index} style={{ 
                        padding: '16px', 
                        backgroundColor: 'var(--bg-secondary)', 
                        borderRadius: 'var(--radius)', 
                        marginBottom: '12px',
                        border: '1px solid var(--border)'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Select Item</label>
                            <select
                              value={item.inventory_item_id}
                              onChange={(e) => handleItemSelect(index, e.target.value)}
                              required
                            >
                              <option value="">Select an item</option>
                              {inventory.map((invItem) => (
                                <option key={invItem.id} value={invItem.id}>
                                  {invItem.description} - {formatQuantity(invItem.quantity)} {invItem.unit} @ ₱{formatPrice(invItem.unit_cost)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Quantity</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={item.selectedItem ? item.selectedItem.quantity : undefined}
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, e.target.value)}
                              placeholder={item.selectedItem ? `Max: ${item.selectedItem.quantity}` : 'Select item first'}
                              disabled={!item.selectedItem}
                              required
                            />
                          </div>

                          {formData.items.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => removeItem(index)}
                              style={{ padding: '8px 12px' }}
                            >
                              <FiX size={16} />
                            </button>
                          )}
                        </div>

                        {item.selectedItem && (
                          <div style={{ 
                            marginTop: '12px', 
                            padding: '12px', 
                            backgroundColor: 'rgba(37, 99, 235, 0.05)', 
                            borderRadius: 'var(--radius)', 
                            fontSize: '13px',
                            border: '1px solid rgba(37, 99, 235, 0.2)'
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                              <div>
                                <strong>Available:</strong> <span style={{ color: 'var(--success)' }}>{formatQuantity(item.selectedItem.quantity)} {item.selectedItem.unit}</span>
                              </div>
                              <div>
                                <strong>Unit Cost:</strong> ₱{formatPrice(item.selectedItem.unit_cost)}
                              </div>
                              {item.quantity && (
                                <div>
                                  <strong>Subtotal:</strong> <span style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost))}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {item.selectedItem && item.quantity && parseFloat(item.quantity) > parseFloat(item.selectedItem.quantity) && (
                          <div className="alert alert-error" style={{ marginTop: '8px' }}>
                            <FiAlertCircle size={14} />
                            Quantity exceeds available stock
                          </div>
                        )}
                      </div>
                    ))}

                    <button 
                      type="button" 
                      className="btn" 
                      onClick={addItem}
                      style={{ marginBottom: '16px' }}
                    >
                      <FiPackage size={16} />
                      Add Another Item
                    </button>

                    {formData.items.some(i => i.selectedItem && i.quantity) && (
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                        borderRadius: 'var(--radius)', 
                        marginBottom: '16px',
                        border: '2px solid rgba(16, 185, 129, 0.3)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '16px' }}>Total Transfer Value:</strong>
                          <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--success)' }}>
                            ₱{formatPrice(formData.items.reduce((sum, item) => {
                              if (item.selectedItem && item.quantity) {
                                return sum + (parseFloat(item.quantity) * parseFloat(item.selectedItem.unit_cost));
                              }
                              return sum;
                            }, 0))}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {formData.items.filter(i => i.selectedItem).length} item(s) selected
                        </div>
                      </div>
                    )}

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
                      disabled={loading || formData.items.some(i => !i.selectedItem || !i.quantity)}
                    >
                      {loading ? (
                        <>
                          <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <FiCheck size={16} />
                          {user.role === 'branch_manager' ? 'Submit Request' : `Create ${formData.items.length} Transfer(s)`}
                        </>
                      )}
                    </button>
                  </>
                )}
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
                            Received
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

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiX size={24} color="#ef4444" />
                Reject Transfer
              </h3>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div className="form-group">
              <label>Rejection Reason (Optional)</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection (optional)..."
                rows="4"
                style={{ width: '100%', resize: 'vertical' }}
              />
              <small style={{ color: '#6b7280', marginTop: '4px', display: 'block' }}>
                You can leave this blank if no specific reason is needed
              </small>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmReject}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FiX size={16} />
                Reject Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transfers;
