import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import { FiShoppingCart, FiPlus, FiTrash2, FiDollarSign, FiCalendar, FiEdit2, FiX, FiCheck } from 'react-icons/fi';

function Sales() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [sales, setSales] = useState([]);
  const [costBatches, setCostBatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  
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

  useEffect(() => {
    fetchLocations();
    fetchSales();
    
    // Listen for tab visibility changes
    const handleTabVisible = () => {
      fetchSales();
    };
    
    window.addEventListener('tab-visible', handleTabVisible);
    return () => window.removeEventListener('tab-visible', handleTabVisible);
    // eslint-disable-next-line
  }, [filters]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
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

  const handleItemSelect = async (item) => {
    setFormData({
      ...formData,
      item_description: item.description,
      item_unit: item.unit,
      unit_price: item.suggested_selling_price || item.unit_cost,
      cost_batch_id: ''
    });
    
    // Fetch cost batches for this item
    try {
      const response = await api.get(`/inventory/cost-batches/${formData.location_id}/${encodeURIComponent(item.description)}/${encodeURIComponent(item.unit)}`);
      setCostBatches(response.data);
    } catch (error) {
      console.error('Error fetching cost batches:', error);
      setCostBatches([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sales-transactions', formData);
      alert('Sale recorded successfully!');
      setShowForm(false);
      resetForm();
      fetchSales();
    } catch (error) {
      alert(error.response?.data?.error || 'Error recording sale');
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
    setCostBatches([]);
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

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiShoppingCart size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Sales Recording</h2>
      </div>

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

      {/* Filters and Actions */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <FiCalendar size={18} color="var(--text-secondary)" />
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input 
                type="date" 
                value={filters.startDate} 
                onChange={(e) => setFilters({...filters, startDate: e.target.value})} 
              />
            </div>
            <span>to</span>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input 
                type="date" 
                value={filters.endDate} 
                onChange={(e) => setFilters({...filters, endDate: e.target.value})} 
              />
            </div>
            {user.role === 'admin' && (
              <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                <select 
                  value={filters.locationId} 
                  onChange={(e) => setFilters({...filters, locationId: e.target.value})}
                >
                  <option value="all">All Branches</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {canRecordSales && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              <FiPlus size={16} />
              {showForm ? 'Cancel' : 'Record Sale'}
            </button>
          )}
        </div>
      </div>

      {/* Sale Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>Record New Sale</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Date *</label>
                <input 
                  type="date" 
                  value={formData.transaction_date} 
                  onChange={(e) => setFormData({...formData, transaction_date: e.target.value})} 
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Location *</label>
                <select 
                  value={formData.location_id} 
                  onChange={(e) => setFormData({...formData, location_id: e.target.value})} 
                  required
                  disabled={user.role !== 'admin' && user.location_id}
                >
                  <option value="">Select location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Search Item *</label>
              <AutocompleteSearch
                locationId={formData.location_id}
                onSelect={handleItemSelect}
                placeholder="Search for item to sell..."
              />
            </div>

            {/* Cost Batch Selection */}
            {costBatches.length > 0 && (
              <div className="form-group">
                <label>Select Cost Batch *</label>
                <select
                  value={formData.cost_batch_id}
                  onChange={(e) => {
                    const selectedBatch = costBatches.find(b => b.cost_batch_id === e.target.value);
                    setFormData({
                      ...formData,
                      cost_batch_id: e.target.value,
                      unit_price: selectedBatch ? selectedBatch.suggested_selling_price || selectedBatch.unit_cost : formData.unit_price
                    });
                  }}
                  required
                  style={{ 
                    background: costBatches.some(b => b.is_new_cost) ? 'rgba(245, 158, 11, 0.1)' : 'white',
                    border: costBatches.some(b => b.is_new_cost) ? '2px solid var(--warning)' : '1px solid var(--border)'
                  }}
                >
                  <option value="">Choose which batch to sell from...</option>
                  {costBatches.map((batch) => (
                    <option key={batch.cost_batch_id} value={batch.cost_batch_id}>
                      Cost: ₱{formatPrice(batch.unit_cost)} | Price: ₱{formatPrice(batch.suggested_selling_price || 0)} | 
                      Qty: {formatQuantity(batch.quantity)} | 
                      Batch: {batch.batch_number || 'N/A'}
                      {batch.is_new_cost ? ' (NEW COST)' : ''}
                    </option>
                  ))}
                </select>
                {costBatches.some(b => b.is_new_cost) && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    background: 'rgba(245, 158, 11, 0.1)', 
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: 'var(--warning)',
                    fontWeight: '600'
                  }}>
                    🌳 This item has multiple cost batches. Choose carefully!
                  </div>
                )}
              </div>
            )}

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
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Quantity Sold *</label>
                <input 
                  type="number" 
                  value={formData.quantity_sold} 
                  onChange={(e) => setFormData({...formData, quantity_sold: e.target.value})} 
                  required 
                  min="1"
                  max={(() => {
                    if (!formData.cost_batch_id) return undefined;
                    const selectedBatch = costBatches.find(b => b.cost_batch_id === formData.cost_batch_id);
                    return selectedBatch ? selectedBatch.quantity : undefined;
                  })()}
                  placeholder={(() => {
                    if (!formData.cost_batch_id) return 'Select batch first';
                    const selectedBatch = costBatches.find(b => b.cost_batch_id === formData.cost_batch_id);
                    return selectedBatch ? `Max: ${selectedBatch.quantity}` : '';
                  })()}
                  disabled={!formData.cost_batch_id && costBatches.length > 0}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
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
            <div style={{ 
              padding: '16px', 
              backgroundColor: 'rgba(59, 130, 246, 0.05)', 
              borderRadius: 'var(--radius)', 
              marginBottom: '16px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', color: 'var(--primary)' }}>
                Discount Options
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
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
                    <div className="form-group" style={{ marginBottom: 0 }}>
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
                    <div className="form-group" style={{ marginBottom: 0 }}>
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
                  marginTop: '12px', 
                  padding: '12px', 
                  backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {formData.discount_type === 'pwd' && 'PWD Discount (20% on net of VAT + VAT Exempt)'}
                    {formData.discount_type === 'senior' && 'Senior Citizen Discount (20% on net of VAT + VAT Exempt)'}
                    {formData.discount_type === 'custom' && formData.custom_discount_percent && 
                      `Custom Discount (${formData.custom_discount_percent}%)`}
                    {formData.discount_reason && ` - ${formData.discount_reason}`}
                  </div>
                  {(formData.discount_type === 'pwd' || formData.discount_type === 'senior') && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Formula: Price ÷ 1.12 × 0.20 = Discount, then Price - Discount = Final
                    </div>
                  )}
                </div>
              )}
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
                const grossAmount = (parseFloat(formData.quantity_sold) || 0) * (parseFloat(formData.unit_price) || 0);
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
        <h3>Sales Transactions</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              {user.role === 'admin' && <th>Branch</th>}
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Discount</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Sold By</th>
              {user.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'admin' ? "10" : "8"} style={{ textAlign: 'center', padding: '20px' }}>
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
                    {user.role === 'admin' && (
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
                        `₱${formatPrice((parseFloat(editData.quantity_sold) || 0) * (parseFloat(editData.unit_price) || 0))}`
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
                    {user.role === 'admin' && (
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {isEditing ? (
                            <>
                              <button 
                                className="btn btn-success" 
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                onClick={() => handleSaveEdit(sale.id)}
                                title="Save"
                              >
                                <FiCheck size={14} />
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                onClick={handleCancelEdit}
                                title="Cancel"
                              >
                                <FiX size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                onClick={() => handleEdit(sale)}
                                title="Edit"
                              >
                                <FiEdit2 size={12} />
                              </button>
                              <button 
                                className="btn btn-danger" 
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                onClick={() => handleDelete(sale.id)}
                                title="Delete"
                              >
                                <FiTrash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Sales;
