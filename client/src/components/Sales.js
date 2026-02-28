import { useState, useEffect, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import AutocompleteSearch from './AutocompleteSearch';
import { 
  FiShoppingCart, 
  FiDownload, 
  FiPlus, 
  FiX,
  FiPackage,
  FiMapPin,
  FiUser,
  FiFileText,
  FiAlertCircle
} from 'react-icons/fi';

function Sales() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [locations, setLocations] = useState([]);
  const [sales, setSales] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    location_id: '',
    inventory_id: '',
    description: '',
    unit: '',
    quantity: '',
    selling_price: '',
    customer_name: '',
    notes: ''
  });

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await fetchLocations();
      await fetchSales();
      setLoading(false);
    };
    initializeData();
  }, [location, user.location_id]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      const branches = response.data.filter(loc => loc.type === 'branch');
      setLocations(branches);
      
      // Auto-select location for branch managers/staff
      if (user.location_id) {
        const userLocation = branches.find(loc => loc.id === user.location_id);
        if (userLocation) {
          setFormData(prev => ({ ...prev, location_id: user.location_id }));
        }
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
      alert('Error loading branches: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleLocationChange = (locationId) => {
    setFormData({ 
      ...formData, 
      location_id: locationId,
      inventory_id: '',
      description: '',
      unit: '',
      quantity: '',
      selling_price: ''
    });
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales');
      setSales(response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ['Date', 'Branch', 'Description', 'Quantity', 'Unit', 'Price', 'Total', 'Customer', 'Sold By'],
      ...sales.map(sale => [
        new Date(sale.sale_date).toLocaleString(),
        sale.location_name,
        sale.description,
        sale.quantity,
        sale.unit,
        sale.selling_price,
        sale.total_amount,
        sale.customer_name || '-',
        sale.sold_by_name
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleProductSelect = (product) => {
    setFormData({
      ...formData,
      inventory_id: product.id,
      description: product.description,
      unit: product.unit,
      selling_price: product.suggested_selling_price || product.unit_cost || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sales', formData);
      setShowForm(false);
      setFormData({
        location_id: user.location_id || '',
        inventory_id: '',
        description: '',
        unit: '',
        quantity: '',
        selling_price: '',
        customer_name: '',
        notes: ''
      });
      fetchSales();
      if (user.location_id) {
        setFormData(prev => ({ ...prev, location_id: user.location_id }));
      }
      alert('Sale recorded successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error recording sale');
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiShoppingCart size={32} color="#10b981" />
        <h2 style={{ margin: 0 }}>Sales Management</h2>
      </div>
      
      {(user.role === 'branch_manager' || user.role === 'branch_staff') && !user.location_id && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          Your account is not assigned to a branch. Please contact the administrator to assign you to a branch location.
        </div>
      )}
      
      {!loading && locations.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          No branch locations found. Please create branch locations in the Admin panel first.
        </div>
      )}
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FiFileText size={20} />
            Sales History
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn" onClick={handleExport} disabled={sales.length === 0}>
              <FiDownload size={16} />
              Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? <><FiX size={16} /> Cancel</> : <><FiPlus size={16} /> Record Sale</>}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiMapPin size={14} />
                Branch
              </label>
              <select
                value={formData.location_id}
                onChange={(e) => handleLocationChange(e.target.value)}
                disabled={user.role !== 'admin' && user.location_id}
                required
              >
                <option value="">Select branch</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            
            {formData.location_id && (
              <>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FiPackage size={14} />
                    Search Product (Type 3+ characters)
                  </label>
                  <AutocompleteSearch
                    locationId={formData.location_id}
                    onSelect={handleProductSelect}
                    placeholder="Search by product name or batch number..."
                  />
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Or enter product details manually below
                  </div>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '12px' 
                }}>
                  <div className="form-group">
                    <label>Description *</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit *</label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Selling Price (per unit) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.selling_price}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </>
            )}
            
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiUser size={14} />
                Customer Name (Optional)
              </label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiFileText size={14} />
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="3"
              />
            </div>
            <button type="submit" className="btn btn-success">
              <FiShoppingCart size={16} />
              Record Sale
            </button>
          </form>
        )}

        {sales.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiShoppingCart />
            </div>
            <h3>No Sales Yet</h3>
            <p>Start recording sales to see them here</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <FiPlus size={16} />
              Record First Sale
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Branch</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  {user.role === 'admin' && (
                    <>
                      <th>Price</th>
                      <th>Total</th>
                    </>
                  )}
                  <th>Customer</th>
                  <th>Sold By</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{new Date(sale.sale_date).toLocaleString()}</td>
                    <td>{sale.location_name}</td>
                    <td style={{ fontWeight: 600 }}>{sale.description}</td>
                    <td>{formatQuantity(sale.quantity)} {sale.unit}</td>
                    {user.role === 'admin' && (
                      <>
                        <td>₱{formatPrice(sale.selling_price)}</td>
                        <td style={{ fontWeight: 600 }}>₱{formatPrice(sale.total_amount)}</td>
                      </>
                    )}
                    <td>{sale.customer_name || '-'}</td>
                    <td>{sale.sold_by_name}</td>
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

export default Sales;
