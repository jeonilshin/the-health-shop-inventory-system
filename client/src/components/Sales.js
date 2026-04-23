import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice, formatQuantity } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import { FiShoppingCart, FiPlus, FiTrash2, FiDollarSign, FiCalendar, FiEdit2, FiX, FiCheck, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import ConfirmModal from './ConfirmModal';

function Sales() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [sales, setSales] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showConfirm1, setShowConfirm1] = useState(false);
  const [showConfirm2, setShowConfirm2] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── cancellation state ──
  const [cancelModal, setCancelModal] = useState({ open: false, sale: null });
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [pendingCancellations, setPendingCancellations] = useState([]);
  const [rejectCancelState, setRejectCancelState] = useState({ id: null, note: '' });
  
  // Calculate date 7 days ago
  const getSevenDaysAgo = () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  };
  
  const [filters, setFilters] = useState({
    startDate: getSevenDaysAgo(),
    endDate: new Date().toISOString().split('T')[0],
    locationId: 'all'
  });
  
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    location_id: user.location_id || '',
    item_description: '',
    item_unit: '',
    cost_batch_id: '',
    quantity_sold: '',
    unit_price: '',
    payment_method: 'cash',
    customer_name: '',
    notes: '',
    discount_type: 'none',
    custom_discount_percent: '',
    discount_reason: ''
  });

  // Batch options for the selected item (multi-expiry)
  const [itemBatches, setItemBatches] = useState([]);
  // User-chosen per-batch allocations: [{ cost_batch_id, quantity }]
  const [batchSelections, setBatchSelections] = useState([]);

  // True when the selected item has more than one batch with an expiry date
  const hasMultipleExpiries = itemBatches.filter(b => b.expiry_date).length > 1;

  useEffect(() => {
    fetchLocations();
    fetchSales();
    if (user.role === 'admin' || user.role === 'branch_manager') fetchPendingCancellations();

    const handleTabVisible = () => {
      fetchSales();
      if (user.role === 'admin' || user.role === 'branch_manager') fetchPendingCancellations();
    };

    window.addEventListener('tab-visible', handleTabVisible);
    return () => window.removeEventListener('tab-visible', handleTabVisible);
    // eslint-disable-next-line
  }, [filters]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      let availableLocations = response.data;
      
      // For branch managers, get their managed branches
      if (user.role === 'branch_manager') {
        try {
          const managerBranchesRes = await api.get(`/users/${user.id}/branches`);
          const managerBranchIds = managerBranchesRes.data.map(b => b.location_id);
          
          // Include primary location and managed branches
          const allManagerLocationIds = [...new Set([user.location_id, ...managerBranchIds])];
          availableLocations = response.data.filter(loc => allManagerLocationIds.includes(loc.id));
        } catch (error) {
          // Fallback to primary location if can't fetch managed branches
          availableLocations = response.data.filter(loc => loc.id === user.location_id);
        }
      }
      
      setLocations(availableLocations);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.locationId && filters.locationId !== 'all') params.append('locationId', filters.locationId);

      const response = await api.get(`/sales-transactions?${params.toString()}`);
      setSales(response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchPendingCancellations = async () => {
    try {
      console.log('[Sales] Fetching pending cancellations for role:', user.role);
      const res = await api.get('/sales-transactions/pending-cancellations');
      console.log('[Sales] Pending cancellations received:', res.data.length);
      setPendingCancellations(res.data);
    } catch (error) {
      console.error('Error fetching pending cancellations:', error);
      console.error('Error response:', error.response?.data);
    }
  };

  const handleCancelSale = async () => {
    if (!cancelReason.trim()) {
      alert('Please provide a reason for cancelling this sale.');
      return;
    }
    setCancelLoading(true);
    try {
      await api.post(`/sales-transactions/${cancelModal.sale.id}/cancel`, { reason: cancelReason.trim() });
      setCancelModal({ open: false, sale: null });
      setCancelReason('');
      alert('Sale cancelled and inventory restored. Admin has been notified.');
      fetchSales();
    } catch (err) {
      alert(err.response?.data?.error || 'Error cancelling sale');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleApproveCancellation = async (id) => {
    if (!window.confirm('Approve this cancellation? The inventory was already restored.')) return;
    try {
      await api.put(`/sales-transactions/${id}/cancel/approve`);
      fetchPendingCancellations();
      fetchSales();
    } catch (err) {
      alert(err.response?.data?.error || 'Error approving cancellation');
    }
  };

  const handleRejectCancellation = async () => {
    if (!rejectCancelState.note.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    try {
      await api.put(`/sales-transactions/${rejectCancelState.id}/cancel/reject`, {
        admin_note: rejectCancelState.note.trim()
      });
      setRejectCancelState({ id: null, note: '' });
      fetchPendingCancellations();
      fetchSales();
    } catch (err) {
      alert(err.response?.data?.error || 'Error rejecting cancellation');
    }
  };

  const handleItemSelect = async (item) => {
    setFormData({
      ...formData,
      item_description: item.description,
      item_unit: item.unit,
      unit_price: item.suggested_selling_price || item.unit_cost,
      cost_batch_id: '',
      quantity_sold: ''
    });

    const batches = Array.isArray(item.batches) ? item.batches : [];
    setItemBatches(batches);
    // If multiple expiries, start with a single empty batch allocation row
    const expiryBatches = batches.filter(b => b.expiry_date);
    if (expiryBatches.length > 1) {
      setBatchSelections([{ cost_batch_id: '', quantity: '' }]);
    } else {
      setBatchSelections([]);
    }
  };

  const getBatchTotal = () => batchSelections.reduce(
    (sum, b) => sum + (parseFloat(b.quantity) || 0), 0
  );

  const handleSubmit = (e) => {
    e.preventDefault();

    if (hasMultipleExpiries) {
      // Validate batch selections
      if (batchSelections.length === 0 || batchSelections.some(b => !b.cost_batch_id || !b.quantity)) {
        alert('Please choose batch(es) and quantity for each.');
        return;
      }
      // Ensure no duplicate batch ids
      const ids = batchSelections.map(b => String(b.cost_batch_id));
      if (new Set(ids).size !== ids.length) {
        alert('Each batch can only be selected once.');
        return;
      }
      // Validate each selected batch quantity does not exceed its available stock
      for (const sel of batchSelections) {
        const batch = itemBatches.find(b => String(b.id) === String(sel.cost_batch_id));
        if (!batch) continue;
        if (parseFloat(sel.quantity) > parseFloat(batch.quantity)) {
          alert(`Only ${batch.quantity} available for the selected batch (Exp ${batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}).`);
          return;
        }
      }
    }

    setShowConfirm1(true);
  };

  const executeSale = async () => {
    setConfirmLoading(true);
    try {
      const payload = { ...formData };
      if (hasMultipleExpiries) {
        payload.batch_selections = batchSelections.map(b => ({
          cost_batch_id: parseInt(b.cost_batch_id, 10),
          quantity: parseFloat(b.quantity)
        }));
        // Sync quantity_sold to the sum of batch selections
        payload.quantity_sold = getBatchTotal();
      }
      console.log('Submitting sale with data:', payload);
      await api.post('/sales-transactions', payload);
      setShowConfirm2(false);
      setShowConfirm1(false);
      setShowForm(false);
      resetForm();
      fetchSales();
      alert('Sale recorded successfully!');
    } catch (error) {
      console.error('Sale submission error:', error.response?.data || error);
      setShowConfirm2(false);
      alert(error.response?.data?.error || 'Error recording sale');
    } finally {
      setConfirmLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      transaction_date: new Date().toISOString().split('T')[0],
      location_id: user.location_id || '',
      item_description: '',
      item_unit: '',
      cost_batch_id: '',
      quantity_sold: '',
      unit_price: '',
      payment_method: 'cash',
      customer_name: '',
      notes: '',
      discount_type: 'none',
      custom_discount_percent: '',
      discount_reason: ''
    });
    setItemBatches([]);
    setBatchSelections([]);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will restore the item to inventory.')) return;
    try {
      await api.delete(`/sales-transactions/${id}`);
      alert('Sale deleted and inventory restored!');
      fetchSales();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting sale');
    }
  };

  const handleEdit = (sale) => {
    setEditingId(sale.id);
    setEditData({
      transaction_date: sale.transaction_date.split('T')[0],
      quantity_sold: parseInt(sale.quantity_sold),
      unit_price: sale.unit_price,
      payment_method: sale.payment_method,
      customer_name: sale.customer_name || '',
      notes: sale.notes || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/sales-transactions/${id}`, editData);
      alert('Sale updated successfully!');
      setEditingId(null);
      setEditData({});
      fetchSales();
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating sale');
    }
  };

  const totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);
  const totalItems = sales.reduce((sum, sale) => sum + parseFloat(sale.quantity_sold || 0), 0);

  const canRecordSales = ['admin', 'warehouse', 'branch_manager', 'branch_staff'].includes(user.role);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const locationName = filters.locationId === 'all' ? 'All Locations' : locations.find(l => l.id === parseInt(filters.locationId))?.name || 'Unknown';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; margin-bottom: 10px; }
          .info { text-align: center; margin-bottom: 20px; color: #666; }
          .summary { display: flex; justify-content: space-around; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 20px; font-weight: bold; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #2563eb; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .total-row { font-weight: bold; background-color: #e3f2fd !important; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Sales Report</h1>
        <div class="info">
          <div><strong>Location:</strong> ${locationName}</div>
          <div><strong>Period:</strong> ${filters.startDate} to ${filters.endDate}</div>
          <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
        </div>
        
        <div class="summary">
          ${user.role === 'admin' ? `
            <div class="summary-item">
              <div class="summary-label">Total Sales</div>
              <div class="summary-value">₱${formatPrice(totalSales)}</div>
            </div>
          ` : ''}
          <div class="summary-item">
            <div class="summary-label">Items Sold</div>
            <div class="summary-value">${Math.round(totalItems)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Transactions</div>
            <div class="summary-value">${sales.length}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date</th>
              ${user.role === 'admin' ? '<th>Branch</th>' : ''}
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Discount</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Sold By</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(sale => `
              <tr>
                <td>${new Date(sale.transaction_date).toLocaleDateString()}</td>
                ${user.role === 'admin' ? `<td>${sale.location_name || ''}</td>` : ''}
                <td>${sale.item_description} (${sale.item_unit})</td>
                <td>${formatQuantity(sale.quantity_sold)}</td>
                <td>₱${formatPrice(sale.unit_price)}</td>
                <td>${sale.discount_amount > 0 ? `₱${formatPrice(sale.discount_amount)}` : '-'}</td>
                <td>₱${formatPrice(sale.total_amount)}</td>
                <td>${sale.payment_method}</td>
                <td>${sale.user_name || ''}</td>
              </tr>
            `).join('')}
            ${user.role === 'admin' ? `
              <tr class="total-row">
                <td colspan="${user.role === 'admin' ? '6' : '5'}" style="text-align: right;">TOTAL:</td>
                <td>₱${formatPrice(totalSales)}</td>
                <td colspan="2"></td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">Print Report</button>
          <button onclick="window.close()" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; margin-left: 10px;">Close</button>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isBranchUser = user.role === 'branch_manager' || user.role === 'branch_staff';

  return (
    <div className="container">
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiShoppingCart size={32} color="#2563eb" />
          <div>
            <h2 style={{ margin: 0 }}>Sales Recording</h2>
            {(user?.role === 'branch_manager' || user?.role === 'branch_staff') && user?.location_name && (
              <div style={{ 
                fontSize: '14px', 
                color: 'var(--text-secondary)',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span className="badge badge-info" style={{ fontSize: '11px' }}>
                  {locations.find(loc => loc.id === parseInt(user.location_id))?.type || 'branch'}
                </span>
                {locations.find(loc => loc.id === parseInt(user.location_id))?.name || user.location_name}
              </div>
            )}
          </div>
        </div>
        
        {canRecordSales && (
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(!showForm)}
            style={{ whiteSpace: 'nowrap' }}
          >
            <FiPlus size={16} />
            {showForm ? 'Cancel' : 'Record Sale'}
          </button>
        )}
      </div>

      {/* ── Admin/Manager: Pending Sale Cancellation Requests ── */}
      {(user.role === 'admin' || user.role === 'branch_manager') && pendingCancellations.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444', marginBottom: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', marginBottom: '16px' }}>
            <FiAlertTriangle size={20} />
            Pending Sale Cancellation Requests ({pendingCancellations.length})
          </h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', marginTop: 0 }}>
            Inventory has already been restored for each of these. Approve to acknowledge, or reject to re-deduct inventory and reinstate the sale.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Branch</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Sold By</th>
                  <th>Reason</th>
                  <th>Requested By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingCancellations.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ fontSize: '13px' }}>{new Date(sale.transaction_date).toLocaleDateString()}</td>
                    <td style={{ fontSize: '13px' }}>{sale.location_name}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{sale.item_description}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{sale.item_unit}</div>
                    </td>
                    <td style={{ fontSize: '13px' }}>{formatQuantity(sale.quantity_sold)}</td>
                    <td style={{ fontSize: '13px', fontWeight: 600 }}>₱{formatPrice(sale.total_amount)}</td>
                    <td style={{ fontSize: '12px' }}>{sale.sold_by_name}</td>
                    <td style={{ fontSize: '12px', color: '#6b7280', maxWidth: '160px' }}>{sale.cancellation_reason}</td>
                    <td style={{ fontSize: '12px' }}>
                      {sale.cancelled_by_name}
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {sale.cancelled_at ? new Date(sale.cancelled_at).toLocaleDateString() : ''}
                      </div>
                    </td>
                    <td>
                      {rejectCancelState.id === sale.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                          <textarea
                            rows={2}
                            placeholder="Rejection reason (required)"
                            value={rejectCancelState.note}
                            onChange={e => setRejectCancelState(s => ({ ...s, note: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn"
                              style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#ef4444', color: '#fff', border: 'none' }}
                              onClick={handleRejectCancellation}
                            >
                              Confirm Reject
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => setRejectCancelState({ id: null, note: '' })}
                            >
                              <FiX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleApproveCancellation(sale.id)}
                          >
                            <FiCheckCircle size={12} /> Approve
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 10px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setRejectCancelState({ id: sale.id, note: '' })}
                          >
                            <FiX size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {user.role === 'admin' && (
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Sales</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(totalSales)}</div>
          </div>
        )}
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Items Sold</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>{Math.round(totalItems)}</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Transactions</div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{sales.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          flexWrap: 'wrap', 
          gap: '16px' 
        }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: '12px', 
            alignItems: 'center',
            flex: 1,
            minWidth: '300px'
          }}>
            <FiCalendar size={18} color="var(--text-secondary)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>From Date</label>
                <input 
                  type="date" 
                  value={filters.startDate} 
                  onChange={(e) => setFilters({...filters, startDate: e.target.value})} 
                  style={{ fontSize: '14px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>To Date</label>
                <input 
                  type="date" 
                  value={filters.endDate} 
                  onChange={(e) => setFilters({...filters, endDate: e.target.value})} 
                  style={{ fontSize: '14px' }}
                />
              </div>
              {(user.role === 'admin' || user.role === 'branch_manager') && (
                <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                  <label style={{ fontSize: '12px', marginBottom: '4px' }}>Location</label>
                  <select 
                    value={filters.locationId} 
                    onChange={(e) => setFilters({...filters, locationId: e.target.value})}
                    style={{ fontSize: '14px' }}
                  >
                    <option value="all">{user.role === 'admin' ? 'All Branches' : 'All My Branches'}</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sale Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '20px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: 0 }}>Record New Sale</h3>
            <button 
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
              style={{ padding: '6px 12px', fontSize: '14px' }}
            >
              <FiX size={16} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit}>
            {/* Basic Information */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--primary)' }}>
                Sale Information
              </h4>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '16px' 
              }}>
                <div className="form-group">
                  <label>Date *</label>
                  <input 
                    type="date" 
                    value={formData.transaction_date} 
                    onChange={(e) => setFormData({...formData, transaction_date: e.target.value})} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Location *</label>
                  <select
                    value={formData.location_id}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        location_id: e.target.value,
                        item_description: '',
                        item_unit: '',
                        quantity_sold: '',
                        unit_price: ''
                      });
                      setItemBatches([]);
                      setBatchSelections([]);
                    }}
                    required
                    disabled={user.role === 'branch_staff' || user.role === 'warehouse'}
                  >
                    <option value="">Select location</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Item Selection */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--primary)' }}>
                Item Selection
              </h4>
              <div className="form-group">
                <label>Search Item *</label>
                <AutocompleteSearch
                  locationId={formData.location_id}
                  onSelect={handleItemSelect}
                  placeholder="Search for item to sell..."
                />
              </div>
            </div>

            {/* Cost Batch Selection - REMOVED */}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Item Description *</label>
                <input
                  type="text"
                  value={formData.item_description}
                  onChange={(e) => setFormData({...formData, item_description: e.target.value})}
                  required
                  readOnly
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit *</label>
                <input
                  type="text"
                  value={formData.item_unit}
                  onChange={(e) => setFormData({...formData, item_unit: e.target.value})}
                  required
                  readOnly
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                />
              </div>
              {!hasMultipleExpiries && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Quantity Sold *</label>
                  <input
                    type="number"
                    value={formData.quantity_sold}
                    onChange={(e) => setFormData({...formData, quantity_sold: e.target.value})}
                    required
                    min="1"
                    placeholder="Enter quantity"
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit Price *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unit_price}
                  onChange={(e) => setFormData({...formData, unit_price: e.target.value})}
                  required
                  min="0.01"
                />
              </div>
            </div>

            {hasMultipleExpiries && (
              <div style={{
                marginBottom: '16px',
                padding: '16px',
                border: '2px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'rgba(245, 158, 11, 0.05)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--primary)' }}>
                    Batches (pick expiry to sell from)
                  </h4>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Total: <strong>{getBatchTotal()} {formData.item_unit}</strong>
                  </div>
                </div>

                {batchSelections.map((sel, idx) => {
                  const currentBatch = itemBatches.find(b => String(b.id) === String(sel.cost_batch_id));
                  const usedIds = new Set(
                    batchSelections.filter((_, i) => i !== idx).map(s => String(s.cost_batch_id))
                  );
                  return (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr auto',
                      gap: '8px',
                      alignItems: 'end',
                      marginBottom: '8px'
                    }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '12px' }}>Expiry Batch *</label>
                        <select
                          value={sel.cost_batch_id}
                          onChange={(e) => {
                            const next = [...batchSelections];
                            next[idx] = { ...next[idx], cost_batch_id: e.target.value, quantity: '' };
                            setBatchSelections(next);
                          }}
                          required
                        >
                          <option value="">Select expiry</option>
                          {itemBatches
                            .filter(b => b.expiry_date && (!usedIds.has(String(b.id)) || String(b.id) === String(sel.cost_batch_id)))
                            .map(b => (
                              <option key={b.id} value={b.id}>
                                Exp {new Date(b.expiry_date).toLocaleDateString()} · {formatQuantity(b.quantity)} left
                                {b.batch_number ? ` · ${b.batch_number}` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: '12px' }}>
                          Qty {currentBatch ? `(max ${formatQuantity(currentBatch.quantity)})` : ''}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={currentBatch ? currentBatch.quantity : undefined}
                          value={sel.quantity}
                          onChange={(e) => {
                            const next = [...batchSelections];
                            next[idx] = { ...next[idx], quantity: e.target.value };
                            setBatchSelections(next);
                          }}
                          disabled={!sel.cost_batch_id}
                          required
                          onWheel={(e) => e.target.blur()}
                        />
                      </div>
                      {batchSelections.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '8px 10px' }}
                          onClick={() => {
                            setBatchSelections(batchSelections.filter((_, i) => i !== idx));
                          }}
                          title="Remove batch"
                        >
                          <FiX size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {batchSelections.length < itemBatches.filter(b => b.expiry_date).length && (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: '4px', fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => setBatchSelections([...batchSelections, { cost_batch_id: '', quantity: '' }])}
                  >
                    <FiPlus size={14} /> Add Another Batch
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Payment Method *</label>
                <select 
                  value={formData.payment_method} 
                  onChange={(e) => setFormData({...formData, payment_method: e.target.value})} 
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Customer Name</label>
                <input 
                  type="text" 
                  value={formData.customer_name} 
                  onChange={(e) => setFormData({...formData, customer_name: e.target.value})} 
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Discount Section */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ 
                padding: '20px', 
                backgroundColor: 'rgba(59, 130, 246, 0.05)', 
                borderRadius: 'var(--radius)', 
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <h4 style={{ 
                  marginTop: 0, 
                  marginBottom: '16px', 
                  fontSize: '16px', 
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <FiDollarSign size={16} />
                  Discount Options
                </h4>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '16px',
                  marginBottom: '16px'
                }}>
                  <div className="form-group">
                    <label>Discount Type</label>
                    <select 
                      value={formData.discount_type} 
                      onChange={(e) => {
                        setFormData({
                          ...formData, 
                          discount_type: e.target.value,
                          custom_discount_percent: e.target.value === 'custom' ? formData.custom_discount_percent : '',
                          discount_reason: e.target.value === 'custom' ? formData.discount_reason : 
                                         e.target.value === 'pwd' ? 'PWD Discount' :
                                         e.target.value === 'senior' ? 'Senior Citizen Discount' : ''
                        });
                      }}
                    >
                      <option value="none">No Discount</option>
                      <option value="pwd">PWD (20%)</option>
                      <option value="senior">Senior Citizen (20%)</option>
                      <option value="custom">Custom Discount</option>
                    </select>
                  </div>

                  {formData.discount_type === 'custom' && (
                    <>
                      <div className="form-group">
                        <label>Discount Percentage *</label>
                        <input 
                          type="number" 
                          step="0.01"
                          min="0"
                          max="100"
                          value={formData.custom_discount_percent} 
                          onChange={(e) => setFormData({...formData, custom_discount_percent: e.target.value})} 
                          placeholder="e.g., 10"
                          required={formData.discount_type === 'custom'}
                        />
                      </div>
                      <div className="form-group">
                        <label>Discount Reason *</label>
                        <input 
                          type="text" 
                          value={formData.discount_reason} 
                          onChange={(e) => setFormData({...formData, discount_reason: e.target.value})} 
                          placeholder="e.g., Holiday Promo, Loyalty Discount"
                          required={formData.discount_type === 'custom'}
                        />
                      </div>
                    </>
                  )}
                </div>

                {formData.discount_type !== 'none' && (
                  <div style={{ 
                    padding: '16px', 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <strong>Discount Information:</strong>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formData.discount_type === 'pwd' && 'PWD Discount (20% on net of VAT + VAT Exempt)'}
                      {formData.discount_type === 'senior' && 'Senior Citizen Discount (20% on net of VAT + VAT Exempt)'}
                      {formData.discount_type === 'custom' && formData.custom_discount_percent && 
                        `Custom Discount (${formData.custom_discount_percent}%)`}
                      {formData.discount_reason && ` - ${formData.discount_reason}`}
                    </div>
                    {(formData.discount_type === 'pwd' || formData.discount_type === 'senior') && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        <strong>Formula:</strong> Price ÷ 1.12 × 0.20 = Discount, then Price - Discount = Final Amount
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Price Summary */}
            <div style={{ 
              padding: '16px', 
              backgroundColor: 'rgba(16, 185, 129, 0.1)', 
              borderRadius: 'var(--radius)', 
              marginBottom: '16px',
              border: '2px solid rgba(16, 185, 129, 0.3)'
            }}>
              {(() => {
                const effectiveQty = hasMultipleExpiries
                  ? getBatchTotal()
                  : (parseFloat(formData.quantity_sold) || 0);
                const grossAmount = effectiveQty * (parseFloat(formData.unit_price) || 0);
                let discountAmount = 0;
                let finalTotal = grossAmount;

                if (formData.discount_type === 'pwd' || formData.discount_type === 'senior') {
                  // Philippine PWD/Senior Citizen Formula:
                  // 1. Remove VAT to get net amount: Price / 1.12
                  const netOfVat = grossAmount / 1.12;
                  // 2. Calculate 20% discount on net of VAT
                  discountAmount = netOfVat * 0.20;
                  // 3. Subtract discount from original price and round off
                  finalTotal = Math.round(grossAmount - discountAmount);
                  
                  // Debug logging
                  console.log('Discount Calculation:', {
                    grossAmount,
                    netOfVat,
                    discountAmount,
                    finalTotal,
                    discountType: formData.discount_type
                  });
                } else if (formData.discount_type === 'custom') {
                  // Custom discount: simple percentage off
                  const discountPercent = parseFloat(formData.custom_discount_percent) || 0;
                  discountAmount = grossAmount * (discountPercent / 100);
                  // Round off for custom discounts too
                  finalTotal = Math.round(grossAmount - discountAmount);
                }
                
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px' }}>Gross Amount:</span>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>₱{formatPrice(grossAmount)}</span>
                    </div>
                    
                    {(formData.discount_type === 'pwd' || formData.discount_type === 'senior') && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span>Net of VAT (÷1.12):</span>
                          <span>₱{formatPrice(grossAmount / 1.12)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#ef4444' }}>
                          <span style={{ fontSize: '14px' }}>Less: SC/PWD Discount (20%):</span>
                          <span style={{ fontSize: '14px', fontWeight: 600 }}>-₱{formatPrice(discountAmount)}</span>
                        </div>
                      </>
                    )}
                    
                    {formData.discount_type === 'custom' && discountAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#ef4444' }}>
                        <span style={{ fontSize: '14px' }}>Discount ({formData.custom_discount_percent}%):</span>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>-₱{formatPrice(discountAmount)}</span>
                      </div>
                    )}
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      paddingTop: '8px', 
                      borderTop: '2px solid rgba(16, 185, 129, 0.3)' 
                    }}>
                      <span style={{ fontSize: '16px', fontWeight: 700 }}>Amount Due:</span>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>
                        ₱{(formData.discount_type !== 'none' && discountAmount > 0) 
                          ? finalTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                          : formatPrice(finalTotal)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea 
                value={formData.notes} 
                onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                rows="2"
                placeholder="Additional notes..."
              />
            </div>

            <button type="submit" className="btn btn-success">
              <FiDollarSign size={16} />
              Record Sale
            </button>
          </form>
        </div>
      )}

      {/* Sales List */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Sales Transactions</h3>
          <button className="btn btn-primary" onClick={handlePrint}>
            <FiShoppingCart size={16} />
            Print Sales Report
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              {(user.role === 'admin' || user.role === 'branch_manager') && <th>Branch</th>}
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Discount</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Sold By</th>
              {(user.role === 'admin' || isBranchUser) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={(user.role === 'admin' || user.role === 'branch_manager') ? "10" : isBranchUser ? "9" : "8"} style={{ textAlign: 'center', padding: '20px' }}>
                  No sales recorded for this period
                </td>
              </tr>
            ) : (
              sales.map(sale => {
                const isEditing = editingId === sale.id;
                return (
                  <tr key={sale.id}>
                    <td>
                      {isEditing ? (
                        <input 
                          type="date" 
                          value={editData.transaction_date}
                          onChange={(e) => setEditData({...editData, transaction_date: e.target.value})}
                          style={{ width: '100%', padding: '4px' }}
                        />
                      ) : (
                        new Date(sale.transaction_date).toLocaleDateString()
                      )}
                    </td>
                    {(user.role === 'admin' || user.role === 'branch_manager') && (
                      <td>
                        <span className={`badge ${sale.location_type === 'warehouse' ? 'badge-primary' : 'badge-info'}`}>
                          {sale.location_name}
                        </span>
                      </td>
                    )}
                    <td>
                      <div style={{ fontWeight: 600 }}>{sale.item_description}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sale.item_unit}</div>
                    </td>
                    <td>
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="1"
                          min="1"
                          value={Math.round(editData.quantity_sold)}
                          onChange={(e) => setEditData({...editData, quantity_sold: parseInt(e.target.value) || 1})}
                          style={{ width: '80px', padding: '4px' }}
                        />
                      ) : (
                        parseInt(sale.quantity_sold)
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="0.01"
                          min="0.01"
                          value={editData.unit_price}
                          onChange={(e) => setEditData({...editData, unit_price: e.target.value})}
                          style={{ width: '100px', padding: '4px' }}
                        />
                      ) : (
                        `₱${formatPrice(sale.unit_price)}`
                      )}
                    </td>
                    <td>
                      {sale.discount_percent > 0 ? (
                        <div>
                          <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                            {sale.discount_percent}% OFF
                          </span>
                          {sale.discount_reason && (
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {sale.discount_reason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {isEditing ? (
                        (() => {
                          // Calculate total with any existing discount
                          const grossAmount = (parseFloat(editData.quantity_sold) || 0) * (parseFloat(editData.unit_price) || 0);
                          // For editing, we don't have discount info, so just show gross amount
                          // The backend will recalculate properly when saved
                          return `₱${formatPrice(grossAmount)}`;
                        })()
                      ) : (
                        `₱${formatPrice(sale.total_amount)}`
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select 
                          value={editData.payment_method}
                          onChange={(e) => setEditData({...editData, payment_method: e.target.value})}
                          style={{ width: '100%', padding: '4px' }}
                        >
                          <option value="cash">Cash</option>
                          <option value="gcash">GCash</option>
                          <option value="maya">Maya</option>
                          <option value="credit_card">Credit Card</option>
                          <option value="other">Other</option>
                        </select>
                      ) : (
                        <span className="badge badge-info">{sale.payment_method}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px' }}>{sale.sold_by_name}</td>
                    {(user.role === 'admin' || isBranchUser) && (
                      <td>
                        {/* Admin: edit / delete / show cancelled badge */}
                        {user.role === 'admin' && (
                          <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-start' }}>
                            {sale.cancellation_status === 'approved' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fee2e2', color: '#b91c1c', marginBottom: '4px' }}>
                                <FiX size={10} /> Cancelled
                              </span>
                            )}
                            {sale.cancellation_status === 'rejected' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#92400e', marginBottom: '4px' }}>
                                Cancel Rejected
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isEditing ? (
                                <>
                                  <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleSaveEdit(sale.id)} title="Save">
                                    <FiCheck size={14} />
                                  </button>
                                  <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={handleCancelEdit} title="Cancel">
                                    <FiX size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleEdit(sale)} title="Edit">
                                    <FiEdit2 size={12} />
                                  </button>
                                  <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDelete(sale.id)} title="Delete">
                                    <FiTrash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Branch: request cancellation */}
                        {isBranchUser && (
                          <button
                            className="btn"
                            style={{ padding: '4px 10px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => { setCancelModal({ open: true, sale }); setCancelReason(''); }}
                          >
                            <FiX size={11} /> Cancel Sale
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Step 1: Review sale details */}
      {(() => {
        const effectiveQty = hasMultipleExpiries
          ? getBatchTotal()
          : (parseFloat(formData.quantity_sold) || 0);
        const grossAmount = effectiveQty * (parseFloat(formData.unit_price) || 0);
        let discountAmount = 0;
        let finalTotal = grossAmount;
        if (formData.discount_type === 'pwd' || formData.discount_type === 'senior') {
          discountAmount = (grossAmount / 1.12) * 0.20;
          finalTotal = Math.round(grossAmount - discountAmount);
        } else if (formData.discount_type === 'custom' && formData.custom_discount_percent) {
          discountAmount = grossAmount * (parseFloat(formData.custom_discount_percent) / 100);
          finalTotal = Math.round(grossAmount - discountAmount);
        }
        const locationName = locations.find(l => l.id === parseInt(formData.location_id))?.name || '';
        const discountLabel = formData.discount_type === 'pwd' ? 'PWD (20%)' :
          formData.discount_type === 'senior' ? 'Senior (20%)' :
          formData.discount_type === 'custom' ? `Custom (${formData.custom_discount_percent}%)` : 'None';

        return (
          <ConfirmModal
            isOpen={showConfirm1}
            onClose={() => setShowConfirm1(false)}
            onConfirm={() => { setShowConfirm1(false); setShowConfirm2(true); }}
            title="Review Sale Details"
            message={
              <>
                <strong>{formData.item_description}</strong>
                {locationName && <><br /><span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Branch: {locationName}</span></>}
                <br /><br />
                Qty: <strong>{effectiveQty} {formData.item_unit}</strong>
                {hasMultipleExpiries && (
                  <>
                    <br />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {batchSelections.map((s, i) => {
                        const b = itemBatches.find(x => String(x.id) === String(s.cost_batch_id));
                        if (!b) return null;
                        return (
                          <span key={i} style={{ display: 'block' }}>
                            · {s.quantity} {formData.item_unit} from Exp {new Date(b.expiry_date).toLocaleDateString()}
                          </span>
                        );
                      })}
                    </span>
                  </>
                )}
                <br />
                Unit Price: <strong>₱{formatPrice(parseFloat(formData.unit_price) || 0)}</strong>
                <br />
                Discount: <strong>{discountLabel}</strong>
                {discountAmount > 0 && <> (-₱{formatPrice(discountAmount)})</>}
                <br /><br />
                <span style={{ fontSize: '16px' }}>
                  Total Due: <strong style={{ color: 'var(--success)' }}>₱{formatPrice(finalTotal)}</strong>
                </span>
                <br />
                Payment: <strong>{formData.payment_method.replace('_', ' ').toUpperCase()}</strong>
                {formData.customer_name && <><br />Customer: <strong>{formData.customer_name}</strong></>}
              </>
            }
            confirmText="Looks correct, proceed"
            cancelText="Go back & edit"
            type="warning"
          />
        );
      })()}

      {/* Step 2: Final confirmation */}
      <ConfirmModal
        isOpen={showConfirm2}
        onClose={() => { setShowConfirm2(false); setShowConfirm1(true); }}
        onConfirm={executeSale}
        title="Final Confirmation"
        message="This will permanently record the sale and deduct the quantity from inventory. Are you absolutely sure? Any errors after recording are your responsibility."
        confirmText="Yes, Record Sale"
        cancelText="No, go back"
        type="danger"
        loading={confirmLoading}
      />

      {/* ── Cancel Sale Modal ── */}
      {cancelModal.open && cancelModal.sale && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: 'var(--bg-card, #fff)', borderRadius: '12px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiAlertTriangle size={22} color="#ef4444" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Cancel Sale Record</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>Inventory will be restored immediately</p>
                </div>
              </div>
              <button onClick={() => setCancelModal({ open: false, sale: null })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                <FiX size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {/* Sale summary */}
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#b91c1c' }}>{cancelModal.sale.item_description}</div>
                <div style={{ fontSize: '13px', color: '#991b1b', marginTop: '4px' }}>
                  {formatQuantity(cancelModal.sale.quantity_sold)} {cancelModal.sale.item_unit} &nbsp;·&nbsp; ₱{formatPrice(cancelModal.sale.total_amount)}
                  &nbsp;·&nbsp; {new Date(cancelModal.sale.transaction_date).toLocaleDateString()}
                </div>
              </div>

              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                The sale will be cancelled and <strong>{formatQuantity(cancelModal.sale.quantity_sold)} {cancelModal.sale.item_unit}</strong> will be returned to inventory right away. Admin will be notified to acknowledge.
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Reason for cancellation <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain the error — e.g. wrong item entered, duplicate record, customer returned…"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--bg-input, #fff)' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setCancelModal({ open: false, sale: null })} disabled={cancelLoading} className="btn" style={{ padding: '8px 20px' }}>
                Keep Sale
              </button>
              <button
                onClick={handleCancelSale}
                disabled={cancelLoading || !cancelReason.trim()}
                className="btn"
                style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', opacity: (cancelLoading || !cancelReason.trim()) ? 0.6 : 1 }}
              >
                {cancelLoading ? 'Cancelling…' : 'Cancel & Restore Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;
