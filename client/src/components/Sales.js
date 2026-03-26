import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice, formatQuantity } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import { FiShoppingCart, FiPlus, FiTrash2, FiDollarSign, FiCalendar, FiEdit2, FiX, FiCheck } from 'react-icons/fi';

function Sales() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [sales, setSales] = useState([]);
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
      cost_batch_id: '' // No longer needed
    });
    
    // No need to fetch cost batches anymore - we'll use FIFO automatically
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Debug: Log the form data being sent
      console.log('Submitting sale with data:', formData);
      
      // Calculate the expected total for debugging
      const grossAmount = (parseFloat(formData.quantity_sold) || 0) * (parseFloat(formData.unit_price) || 0);
      let expectedTotal = grossAmount;
      
      if (formData.discount_type === 'pwd' || formData.discount_type === 'senior') {
        const netOfVat = grossAmount / 1.12;
        const discountAmount = netOfVat * 0.20;
        expectedTotal = Math.round(grossAmount - discountAmount);
      } else if (formData.discount_type === 'custom' && formData.custom_discount_percent) {
        const discountAmount = grossAmount * (parseFloat(formData.custom_discount_percent) / 100);
        expectedTotal = Math.round(grossAmount - discountAmount);
      }
      
      console.log('Expected total calculation:', {
        grossAmount,
        discountType: formData.discount_type,
        expectedTotal
      });
      
      await api.post('/sales-transactions', formData);
      alert('Sale recorded successfully!');
      setShowForm(false);
      resetForm();
      fetchSales();
    } catch (error) {
      console.error('Sale submission error:', error.response?.data || error);
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
              {user.role === 'admin' && (
                <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                  <label style={{ fontSize: '12px', marginBottom: '4px' }}>Location</label>
                  <select 
                    value={filters.locationId} 
                    onChange={(e) => setFilters({...filters, locationId: e.target.value})}
                    style={{ fontSize: '14px' }}
                  >
                    <option value="all">All Branches</option>
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
