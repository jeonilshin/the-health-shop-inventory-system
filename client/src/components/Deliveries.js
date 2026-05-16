import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import DiscrepancyModal from './DiscrepancyModal';
import AutocompleteSearch from './AutocompleteSearch';
import {
  FiTruck, FiPackage, FiCheck, FiClock, FiAlertCircle,
  FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiX, FiInfo, FiXCircle, FiChevronDown
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
  const [discModal, setDiscModal]         = useState({ open: false, type: null, delivery: null });
  const [rejectState, setRejectState]     = useState({ id: null, note: '' });
  const [issueMenuDeliveryId, setIssueMenuDeliveryId] = useState(null); // which delivery has the sub-menu open

  // ── history visibility ──
  const [showDiscHistory, setShowDiscHistory] = useState(false);
  
  // ── warehouse delivery creation ──
  const [showCreateDelivery, setShowCreateDelivery] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [locations, setLocations] = useState([]);
  const [requestFormData, setRequestFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    notes: ''
  });
  const [deliveryFormData, setDeliveryFormData] = useState({
    from_location_id: '',
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    notes: '',
    available_quantity: null,
    cost_batch_id: ''
  });
  const [costBatches, setCostBatches] = useState([]);

  useEffect(() => {
    fetchLocations();
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

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
          (d.status === 'admin_confirmed' || d.status === 'in_transit' || d.status === 'pending_manager_confirmation') &&
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
      const response = await api.post(`/deliveries/${id}/accept`);
      alert(response.data.message || 'Delivery accepted! Items have been added to your inventory.');
      // Force a fresh fetch
      await fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error accepting delivery');
    }
  };

  const handleManagerConfirm = async (id) => {
    if (!window.confirm('Confirm this staff-accepted delivery? Items will be added to inventory.')) return;
    try {
      const response = await api.post(`/deliveries/${id}/manager-confirm`);
      alert(response.data.message || 'Delivery confirmed! Items have been added to inventory.');
      await fetchAll();
    } catch (error) {
      alert(error.response?.data?.error || 'Error confirming delivery');
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

  const openIssueModal = (delivery, issueType) => {
    const hasItems = delivery.items?.length > 0 && delivery.items[0]?.description;
    if (!hasItems) {
      alert('No item data available for this delivery.');
      return;
    }
    setIssueMenuDeliveryId(null);
    setDiscModal({ open: true, type: issueType, delivery });
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const getStatusBadge = (status) => {
    const badges = {
      pending:         { color: '#9ca3af', icon: <FiClock size={12} />,       text: 'Pending' },
      awaiting_admin:  { color: '#f59e0b', icon: <FiClock size={12} />,       text: 'Awaiting Admin' },
      admin_confirmed: { color: '#3b82f6', icon: <FiCheck size={12} />,       text: 'Admin Confirmed' },
      in_transit:      { color: '#8b5cf6', icon: <FiTruck size={12} />,       text: 'Shipped' },
      pending_manager_confirmation: { color: '#f59e0b', icon: <FiClock size={12} />, text: 'Awaiting Manager' },
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
      pending:   { color: '#f59e0b', text: 'Pending Review' },
      approved:  { color: '#10b981', text: 'Approved' },
      rejected:  { color: '#ef4444', text: 'Rejected' },
      completed: { color: '#6b7280', text: 'Completed' }
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

  const getDiscTypeBadge = (type) => {
    const map = {
      shortage: { bg: '#fef3c7', color: '#92400e', icon: <FiAlertTriangle size={11} />, label: 'Shortage' },
      return:   { bg: '#ede9fe', color: '#5b21b6', icon: <FiRefreshCw     size={11} />, label: 'Return'   },
      damage:   { bg: '#fee2e2', color: '#b91c1c', icon: <FiXCircle        size={11} />, label: 'Damage'   },
    };
    const b = map[type] || map.shortage;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: b.bg, color: b.color }}>
        {b.icon}{b.label}
      </span>
    );
  };

  const canReportIssue = (delivery) =>
    delivery.status === 'delivered' &&
    (user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin');

  const isBranch = user.role === 'branch_manager' || user.role === 'branch_staff';

  const [openReturnId, setOpenReturnId] = useState(null);

  // Returns all approved/completed return discrepancies for a delivery.
  // Standalone returns (no delivery_id) are matched by branch + warehouse + item description
  // because the "Request Return" form never links to a specific delivery.
  const getApprovedReturns = (delivery) =>
    discrepancies.filter(d => {
      if (d.type !== 'return') return false;
      if (d.status !== 'approved' && d.status !== 'completed') return false;
      if (d.delivery_id && d.delivery_id === delivery.id) return true;
      if (!d.delivery_id &&
          d.branch_location_id === delivery.to_location_id &&
          d.warehouse_location_id === delivery.from_location_id &&
          delivery.items?.some(item =>
            item.description?.toLowerCase().trim() === d.item_description?.toLowerCase().trim()
          )
      ) return true;
      return false;
    });

  return (
    <div className="container">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiTruck size={32} color="#2563eb" />
          <h2 style={{ margin: 0 }}>Warehouse Deliveries</h2>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Branch: Request from Warehouse */}
          {(user.role === 'branch_manager' || user.role === 'branch_staff') && (
            <>
              <button
                className="btn btn-success"
                onClick={() => setShowRequestForm(!showRequestForm)}
              >
                <FiPackage size={16} />
                {showRequestForm ? 'Cancel' : 'Request from Warehouse'}
              </button>
              <button
                className="btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: '#8b5cf6', color: '#fff', border: 'none'
                }}
                onClick={() => setDiscModal({ open: true, type: 'return', delivery: null })}
              >
                <FiRefreshCw size={14} />
                Request Return
              </button>
            </>
          )}
          
          {/* Warehouse/Admin: Create Delivery */}
          {(user.role === 'admin' || user.role === 'warehouse') && (
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateDelivery(!showCreateDelivery)}
            >
              <FiTruck size={16} />
              {showCreateDelivery ? 'Cancel' : 'New Delivery'}
            </button>
          )}
        </div>
      </div>

      {/* Info Alert */}
      <div className="alert alert-info" style={{ marginBottom: '24px' }}>
        <FiAlertCircle size={16} />
        <div>
          <strong>Warehouse Deliveries</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            This page is for warehouse deliveries to branches. For branch-to-branch transfers, go to the <strong>Transfers</strong> page.
          </p>
        </div>
      </div>

      {/* ── Request from Warehouse Form (Branch) ──────────────────────────── */}
      {showRequestForm && (user.role === 'branch_manager' || user.role === 'branch_staff') && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '16px' }}>
            <FiPackage size={20} />
            Request from Warehouse
          </h3>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiInfo size={16} />
            Submit a request to the warehouse. They will review and create a delivery if approved.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const description = formData.get('description');
            const unit = formData.get('unit');
            const quantity = formData.get('quantity');
            const unitCost = formData.get('unit_cost');
            const notes = formData.get('notes');

            if (!description || !unit || !quantity || !unitCost) {
              alert('Please fill in all required fields');
              return;
            }

            try {
              // Find warehouse location
              const warehouse = locations.find(loc => loc.type === 'warehouse');
              if (!warehouse) {
                alert('No warehouse found. Please contact admin.');
                return;
              }

              await api.post('/deliveries', {
                from_location_id: warehouse.id,
                to_location_id: user.location_id,
                description,
                unit,
                quantity: parseFloat(quantity),
                unit_cost: parseFloat(unitCost),
                notes: notes || null
              });
              alert('Request submitted to warehouse!');
              setShowRequestForm(false);
              setRequestFormData({
                description: '',
                unit: '',
                quantity: '',
                unit_cost: '',
                notes: ''
              });
              e.target.reset();
              fetchAll();
            } catch (error) {
              alert(error.response?.data?.error || 'Error submitting request');
            }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Item Description *</label>
                <input 
                  type="text" 
                  name="description" 
                  required 
                  placeholder="Enter item description"
                  value={requestFormData.description}
                  onChange={(e) => setRequestFormData({...requestFormData, description: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Unit *</label>
                <input 
                  type="text" 
                  name="unit" 
                  required 
                  placeholder="e.g., PC, BOX, BOT"
                  value={requestFormData.unit}
                  onChange={(e) => setRequestFormData({...requestFormData, unit: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input 
                  type="number" 
                  name="quantity" 
                  step="0.01" 
                  min="0.01" 
                  required 
                  placeholder="0.00"
                  value={requestFormData.quantity}
                  onChange={(e) => setRequestFormData({...requestFormData, quantity: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Unit Cost *</label>
                <input 
                  type="number" 
                  name="unit_cost" 
                  step="0.01" 
                  min="0.01" 
                  required 
                  placeholder="0.00"
                  value={requestFormData.unit_cost}
                  onChange={(e) => setRequestFormData({...requestFormData, unit_cost: e.target.value})}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Notes (Optional)</label>
              <textarea 
                name="notes" 
                rows="3" 
                placeholder="Add any notes about this request..."
                value={requestFormData.notes}
                onChange={(e) => setRequestFormData({...requestFormData, notes: e.target.value})}
              ></textarea>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-success">
                <FiCheck size={16} />
                Submit Request
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowRequestForm(false);
                setRequestFormData({
                  description: '',
                  unit: '',
                  quantity: '',
                  unit_cost: '',
                  notes: ''
                });
              }}>
                <FiX size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── New Delivery Form (Warehouse/Admin) ──────────────────────────── */}
      {showCreateDelivery && (user.role === 'admin' || user.role === 'warehouse') && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #2563eb' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', marginBottom: '16px' }}>
            <FiTruck size={20} />
            Create New Delivery
          </h3>
          <div className="alert alert-info" style={{ marginBottom: '16px' }}>
            <FiInfo size={16} />
            Create a delivery from warehouse to branch. This will notify the branch when ready.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const fromLocationId = formData.get('from_location_id');
            const toLocationId = formData.get('to_location_id');
            const quantity = formData.get('quantity');
            const unitCost = formData.get('unit_cost');
            const notes = formData.get('notes');

            if (!fromLocationId || !toLocationId || !deliveryFormData.description || !deliveryFormData.unit || !quantity || !unitCost) {
              alert('Please fill in all required fields');
              return;
            }

            try {
              await api.post('/deliveries', {
                from_location_id: parseInt(fromLocationId),
                to_location_id: parseInt(toLocationId),
                description: deliveryFormData.description,
                unit: deliveryFormData.unit,
                quantity: parseFloat(quantity),
                unit_cost: parseFloat(unitCost),
                notes: notes || null
              });
              alert('Delivery created successfully!');
              setShowCreateDelivery(false);
              setDeliveryFormData({
                from_location_id: '',
                description: '',
                unit: '',
                quantity: '',
                unit_cost: '',
                notes: '',
                available_quantity: null,
                cost_batch_id: ''
              });
              setCostBatches([]);
              e.target.reset();
              fetchAll();
            } catch (error) {
              alert(error.response?.data?.error || 'Error creating delivery');
            }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>From Warehouse *</label>
                <select 
                  name="from_location_id" 
                  required
                  defaultValue={user.role === 'warehouse' ? user.location_id : ''}
                  disabled={user.role === 'warehouse'}
                >
                  <option value="">Select warehouse</option>
                  {locations.filter(loc => loc.type === 'warehouse').map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To Branch *</label>
                <select name="to_location_id" required>
                  <option value="">Select branch</option>
                  {locations.filter(loc => loc.type === 'branch').map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Search Item *</label>
                <AutocompleteSearch
                  placeholder="Search for product..."
                  locationId={user.role === 'warehouse' ? user.location_id : (deliveryFormData.from_location_id || undefined)}
                  onSelect={async (item) => {
                    // Get the from_location_id from the form
                    const formElement = document.querySelector('form');
                    const fromLocationId = formElement?.querySelector('[name="from_location_id"]')?.value;
                    
                    let availableQty = null;
                    let batches = [];
                    
                    // Fetch available quantity and cost batches if warehouse is selected
                    if (fromLocationId) {
                      try {
                        // Fetch inventory — sum across all batch rows for this item,
                        // since inventory stores one row per cost batch (depleted
                        // batches stay as 0-qty rows and would mislead a .find()).
                        const response = await api.get(`/inventory/location/${fromLocationId}`);
                        availableQty = response.data
                          .filter(inv => inv.description === item.description && inv.unit === item.unit)
                          .reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);
                        
                        // Fetch cost batches
                        const batchResponse = await api.get(`/inventory/cost-batches/${fromLocationId}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`);
                        batches = batchResponse.data;
                        setCostBatches(batches);
                      } catch (error) {
                        console.error('Error fetching inventory:', error);
                      }
                    }
                    
                    setDeliveryFormData({
                      ...deliveryFormData,
                      from_location_id: fromLocationId,
                      description: item.description,
                      unit: item.unit,
                      unit_cost: item.unit_cost || '',
                      available_quantity: availableQty,
                      cost_batch_id: ''
                    });
                  }}
                />
                {deliveryFormData.description && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                    borderRadius: 'var(--radius)',
                    fontSize: '13px',
                    color: 'var(--primary)',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <div>Selected: <strong>{deliveryFormData.description}</strong> ({deliveryFormData.unit})</div>
                    {deliveryFormData.available_quantity !== null && (
                      <div style={{ 
                        marginTop: '4px', 
                        fontSize: '12px',
                        color: deliveryFormData.available_quantity > 0 ? '#10b981' : '#ef4444',
                        fontWeight: 600
                      }}>
                        Available in warehouse: {formatQuantity(deliveryFormData.available_quantity)} {deliveryFormData.unit}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {deliveryFormData.description && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Item Description</label>
                    <input 
                      type="text" 
                      value={deliveryFormData.description}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input 
                      type="text" 
                      value={deliveryFormData.unit}
                      disabled
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    />
                  </div>
                </div>

                {/* Batch Selection */}
                {costBatches.length > 0 && (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Select Batch *</label>
                    <select
                      value={deliveryFormData.cost_batch_id}
                      onChange={(e) => {
                        const selectedBatch = costBatches.find(b => b.cost_batch_id === e.target.value);
                        setDeliveryFormData({
                          ...deliveryFormData,
                          cost_batch_id: e.target.value,
                          unit_cost: selectedBatch ? selectedBatch.unit_cost : deliveryFormData.unit_cost
                        });
                      }}
                      required
                    >
                      <option value="">Select batch...</option>
                      {costBatches.map((batch, batchIndex) => (
                        <option key={batch.cost_batch_id} value={batch.cost_batch_id}>
                          {batch.batch_number || `BATCH-${batchIndex + 1}`} - Qty: {formatQuantity(batch.quantity)} - 
                          Cost: ₱{formatPrice(batch.unit_cost)} - 
                          Exp: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}
                        </option>
                      ))}
                    </select>
                    {deliveryFormData.cost_batch_id && (
                      <div style={{ 
                        marginTop: '8px', 
                        padding: '8px', 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                        borderRadius: 'var(--radius)',
                        fontSize: '12px',
                        color: 'var(--primary)',
                        border: '1px solid rgba(59, 130, 246, 0.2)'
                      }}>
                        {(() => {
                          const selectedBatch = costBatches.find(b => b.cost_batch_id === deliveryFormData.cost_batch_id);
                          return selectedBatch ? (
                            <div>
                              <strong>Batch Details:</strong> {selectedBatch.batch_number || 'N/A'} | 
                              Available: {formatQuantity(selectedBatch.quantity)} {deliveryFormData.unit} | 
                              Expires: {selectedBatch.expiry_date ? new Date(selectedBatch.expiry_date).toLocaleDateString() : 'N/A'}
                            </div>
                          ) : '';
                        })()}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input 
                      type="number" 
                      name="quantity" 
                      step="0.01" 
                      min="0.01" 
                      max={(() => {
                        if (deliveryFormData.cost_batch_id) {
                          const batch = costBatches.find(b => b.cost_batch_id === deliveryFormData.cost_batch_id);
                          return batch ? batch.quantity : undefined;
                        }
                        return deliveryFormData.available_quantity || undefined;
                      })()}
                      required 
                      placeholder={(() => {
                        if (!deliveryFormData.cost_batch_id && costBatches.length > 0) return 'Select batch first';
                        if (deliveryFormData.cost_batch_id) {
                          const batch = costBatches.find(b => b.cost_batch_id === deliveryFormData.cost_batch_id);
                          return batch ? `Max: ${batch.quantity}` : '0.00';
                        }
                        return '0.00';
                      })()}
                      value={deliveryFormData.quantity}
                      onChange={(e) => {
                        const qty = parseFloat(e.target.value);
                        let maxQty = deliveryFormData.available_quantity;
                        
                        if (deliveryFormData.cost_batch_id) {
                          const batch = costBatches.find(b => b.cost_batch_id === deliveryFormData.cost_batch_id);
                          maxQty = batch ? parseFloat(batch.quantity) : maxQty;
                        }
                        
                        if (maxQty !== null && qty > maxQty) {
                          alert(`Cannot exceed available quantity: ${formatQuantity(maxQty)} ${deliveryFormData.unit}`);
                          return;
                        }
                        setDeliveryFormData({...deliveryFormData, quantity: e.target.value});
                      }}
                      disabled={costBatches.length > 0 && !deliveryFormData.cost_batch_id}
                    />
                    {deliveryFormData.available_quantity !== null && deliveryFormData.available_quantity === 0 && (
                      <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
                        ⚠️ No stock available in warehouse
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Unit Cost *</label>
                    <input 
                      type="number" 
                      name="unit_cost" 
                      step="0.01" 
                      min="0.01" 
                      required 
                      placeholder="0.00"
                      value={deliveryFormData.unit_cost}
                      onChange={(e) => setDeliveryFormData({...deliveryFormData, unit_cost: e.target.value})}
                      disabled={costBatches.length > 0 && !deliveryFormData.cost_batch_id}
                    />
                  </div>
                </div>
              </>
            )}
            {deliveryFormData.description && (
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Notes (Optional)</label>
                <textarea 
                  name="notes" 
                  rows="3" 
                  placeholder="Add any notes about this delivery..."
                  value={deliveryFormData.notes}
                  onChange={(e) => setDeliveryFormData({...deliveryFormData, notes: e.target.value})}
                ></textarea>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-success" disabled={!deliveryFormData.description}>
                <FiCheck size={16} />
                Create Delivery
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowCreateDelivery(false);
                setDeliveryFormData({
                  from_location_id: '',
                  description: '',
                  unit: '',
                  quantity: '',
                  unit_cost: '',
                  notes: '',
                  available_quantity: null,
                  cost_batch_id: ''
                });
                setCostBatches([]);
              }}>
                <FiX size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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
            Shortage: Adds missing qty to warehouse + corrects branch inventory. Damage: Removes damaged qty from branch. Return: Removes from branch, adds to warehouse.
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
                      <td>{getDiscTypeBadge(disc.type)}</td>
                      <td>
                        <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{disc.branch_name || disc.warehouse_name}</td>
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
                {(user.role === 'branch_manager' || user.role === 'branch_staff') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {incomingDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    {new Date(delivery.delivery_date || delivery.created_at).toLocaleDateString()}
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      ID: {delivery.id}
                    </div>
                  </td>
                  <td>{delivery.from_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '12px', marginBottom: '5px' }}>
                        <strong>{item.description}</strong> - {formatQuantity(item.quantity)} {item.unit}
                      </div>
                    ))}
                  </td>
                  <td>{getStatusBadge(delivery.status)}</td>
                  {(user.role === 'branch_manager' || user.role === 'branch_staff') && (
                    <td>
                      {delivery.status === 'pending_manager_confirmation' ? (
                        user.role === 'branch_manager' ? (
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 12px', fontSize: '12px' }}
                            onClick={() => handleManagerConfirm(delivery.id)}
                          >
                            <FiCheckCircle size={12} /> Confirm Delivery
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Awaiting manager confirmation
                          </span>
                        )
                      ) : (
                        <button
                          className="btn btn-success"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => handleBranchAccept(delivery.id)}
                        >
                          <FiCheckCircle size={12} /> Accept Delivery
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
                  {(user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin') && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => {
                  const approvedReturns = getApprovedReturns(delivery);
                  return (
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
                    <td>
                      {approvedReturns.length > 0 ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <span
                            onClick={() => setOpenReturnId(openReturnId === delivery.id ? null : delivery.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              backgroundColor: '#fff7ed', color: '#ea580c',
                              padding: '2px 10px', borderRadius: '12px',
                              fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer', border: '1px solid #fb923c',
                              userSelect: 'none'
                            }}
                          >
                            <FiRefreshCw size={12} /> Returned ({approvedReturns.length})
                          </span>
                          {openReturnId === delivery.id && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 200,
                              background: 'var(--bg-card, #fff)',
                              border: '1px solid #fb923c',
                              borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
                              minWidth: '240px', padding: '10px 12px', marginTop: '4px'
                            }}>
                              {approvedReturns.map((r, i) => (
                                <div key={r.id} style={{
                                  paddingBottom: i < approvedReturns.length - 1 ? '8px' : 0,
                                  marginBottom: i < approvedReturns.length - 1 ? '8px' : 0,
                                  borderBottom: i < approvedReturns.length - 1 ? '1px solid #fed7aa' : 'none'
                                }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#ea580c' }}>
                                    {r.item_description} — {formatQuantity(r.received_quantity)} {r.unit}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>
                                    Note: {r.note}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : getStatusBadge(delivery.status)}
                    </td>
                    <td>{delivery.created_by_name}</td>
                    {user.role === 'admin' && (
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {delivery.admin_confirmed_by_name || '-'}
                      </td>
                    )}
                    {(user.role === 'branch_manager' || user.role === 'branch_staff' || user.role === 'admin') && (
                      <td>
                        {canReportIssue(delivery) && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              className="btn"
                              style={{
                                padding: '4px 10px', fontSize: '12px',
                                background: '#fef3c7', color: '#92400e',
                                border: '1px solid #f59e0b',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                whiteSpace: 'nowrap'
                              }}
                              onClick={() => setIssueMenuDeliveryId(
                                issueMenuDeliveryId === delivery.id ? null : delivery.id
                              )}
                            >
                              <FiAlertTriangle size={11} /> Report Issue <FiChevronDown size={11} />
                            </button>
                            {issueMenuDeliveryId === delivery.id && (
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                                background: 'var(--bg-card, #fff)',
                                border: '1px solid var(--border-color, #e5e7eb)',
                                borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                minWidth: '170px', overflow: 'hidden', marginTop: '2px'
                              }}>
                                <button
                                  style={{
                                    width: '100%', padding: '10px 14px', textAlign: 'left',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '13px', fontWeight: 600, color: '#92400e',
                                    borderBottom: '1px solid var(--border-color, #f3f4f6)'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  onClick={() => openIssueModal(delivery, 'shortage')}
                                >
                                  <FiAlertTriangle size={13} /> Shortage
                                  <span style={{ fontSize: '11px', color: '#a16207', fontWeight: 400, marginLeft: 'auto' }}>received less</span>
                                </button>
                                <button
                                  style={{
                                    width: '100%', padding: '10px 14px', textAlign: 'left',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '13px', fontWeight: 600, color: '#b91c1c'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  onClick={() => openIssueModal(delivery, 'damage')}
                                >
                                  <FiXCircle size={13} /> Damaged Goods
                                  <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 400, marginLeft: 'auto' }}>write-off</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
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
                        <td>{getDiscTypeBadge(disc.type)}</td>
                        <td>
                          <strong style={{ fontSize: '13px' }}>{disc.item_description}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{disc.unit}</div>
                        </td>
                        {user.role === 'admin' && (
                          <td style={{ fontSize: '13px' }}>{disc.branch_name || disc.warehouse_name}</td>
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
            const msgs = {
              shortage: 'Shortage report submitted! Admin will review shortly.',
              damage:   'Damage report submitted! Admin will review shortly.',
              return:   'Return request submitted! Admin will review shortly.'
            };
            alert(msgs[discModal.type] || 'Submitted! Admin will review shortly.');
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

export default Deliveries;
