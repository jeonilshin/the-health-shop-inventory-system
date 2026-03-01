import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatPrice } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import { FiShoppingCart, FiPlus, FiTrash2, FiDollarSign, FiCalendar } from 'react-icons/fi';

function Sales() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    location_id: user.location_id || '',
    item_description: '',
    item_unit: '',
    quantity_sold: '',
    unit_price: '',
    payment_method: 'cash',
    customer_name: '',
    notes: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchSales();
    // eslint-disable-next-line
  }, [filters]);

  useEffect(() => {
    if (formData.location_id) {
      fetchInventory();
    }
    // eslint-disable-next-line
  }, [formData.location_id]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get(`/inventory/location/${formData.location_id}`);
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      
      const response = await api.get(`/sales-transactions?${params.toString()}`);
      setSales(response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const handleItemSelect = (item) => {
    setFormData({
      ...formData,
      item_description: item.description,
      item_unit: item.unit,
      unit_price: item.suggested_selling_price || item.unit_cost
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sales-transactions', formData);
      alert('Sale recorded successfully!');
      setShowForm(false);
      resetForm();
      fetchSales();
      fetchInventory();
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
      quantity_sold: '',
      unit_price: '',
      payment_method: 'cash',
      customer_name: '',
      notes: ''
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will restore the item to inventory.')) return;
    try {
      await api.delete(`/sales-transactions/${id}`);
      alert('Sale deleted and inventory restored!');
      fetchSales();
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting sale');
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
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Sales</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>₱{formatPrice(totalSales)}</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Items Sold</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>{totalItems.toFixed(2)}</div>
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
                items={inventory}
                onSelect={handleItemSelect}
                placeholder="Search for item to sell..."
                displayField="description"
              />
            </div>

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
                  step="0.01"
                  value={formData.quantity_sold} 
                  onChange={(e) => setFormData({...formData, quantity_sold: e.target.value})} 
                  required 
                  min="0.01"
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
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Total Amount</label>
                <input 
                  type="text" 
                  value={`₱${formatPrice((parseFloat(formData.quantity_sold) || 0) * (parseFloat(formData.unit_price) || 0))}`}
                  readOnly
                  style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 600, color: 'var(--primary)' }}
                />
              </div>
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
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Customer</th>
              <th>Sold By</th>
              {user.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'admin' ? "9" : "8"} style={{ textAlign: 'center', padding: '20px' }}>
                  No sales recorded for this period
                </td>
              </tr>
            ) : (
              sales.map(sale => (
                <tr key={sale.id}>
                  <td>{new Date(sale.transaction_date).toLocaleDateString()}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{sale.item_description}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sale.item_unit}</div>
                  </td>
                  <td>{parseFloat(sale.quantity_sold).toFixed(2)}</td>
                  <td>₱{formatPrice(sale.unit_price)}</td>
                  <td style={{ fontWeight: 600 }}>₱{formatPrice(sale.total_amount)}</td>
                  <td>
                    <span className="badge badge-info">{sale.payment_method}</span>
                  </td>
                  <td style={{ fontSize: '12px' }}>{sale.customer_name || '-'}</td>
                  <td style={{ fontSize: '12px' }}>{sale.sold_by_name}</td>
                  {user.role === 'admin' && (
                    <td>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => handleDelete(sale.id)}
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Sales;
