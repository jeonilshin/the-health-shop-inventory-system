import { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { FiPackage, FiPlus, FiDownload, FiSearch, FiAlertCircle, FiTrash2 } from 'react-icons/fi';

function Inventory() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    suggested_selling_price: '',
    expiry_date: '',
    batch_number: ''
  });

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await fetchLocations();
      setLoading(false);
    };
    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      console.log('Fetched locations:', response.data); // Debug log
      setLocations(response.data);
      
      if (user.role !== 'admin' && user.location_id) {
        setSelectedLocation(user.location_id);
      } else if (response.data.length > 0) {
        setSelectedLocation(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
      alert('Error loading locations: ' + (error.response?.data?.error || error.message));
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get(`/inventory/location/${selectedLocation}`);
      setInventory(response.data);
      setFilteredInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  useEffect(() => {
    if (searchTerm) {
      const filtered = inventory.filter(item =>
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.unit.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredInventory(filtered);
    } else {
      setFilteredInventory(inventory);
    }
  }, [searchTerm, inventory]);

  const handleExport = () => {
    const csvContent = [
      ['Description', 'Unit', 'Quantity', 'Unit Cost', 'Suggested Price', 'Total Value'],
      ...filteredInventory.map(item => [
        item.description,
        item.unit,
        item.quantity,
        item.unit_cost,
        item.suggested_selling_price || 0,
        parseFloat(item.quantity) * parseFloat(item.unit_cost)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/inventory', {
        location_id: selectedLocation,
        ...formData
      });
      setShowForm(false);
      setFormData({
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        suggested_selling_price: '',
        expiry_date: '',
        batch_number: ''
      });
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding inventory');
    }
  };

  const canAddInventory = user.role === 'admin' || user.role === 'warehouse';

  const handleDeleteInventory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this inventory item?')) {
      return;
    }
    try {
      await api.delete(`/inventory/${id}`);
      alert('Inventory item deleted successfully!');
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting inventory item');
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <FiPackage size={32} color="#2563eb" />
        <h2 style={{ margin: 0 }}>Inventory Management</h2>
      </div>
      
      {user.role === 'branch_manager' && (
        <div className="alert alert-info" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          Branch managers cannot add inventory directly. Please request transfers from the warehouse.
        </div>
      )}
      
      {(user.role === 'warehouse' || user.role === 'branch_manager' || user.role === 'branch_staff') && !user.location_id && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          Your account is not assigned to a location. Please contact the administrator to assign you to a location.
        </div>
      )}
      
      {!loading && locations.length === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <FiAlertCircle size={16} />
          No locations found. Please create locations in the Admin panel first.
        </div>
      )}
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="form-group" style={{ marginBottom: 0, width: '300px' }}>
            <label>Select Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              disabled={user.role !== 'admin' && user.location_id}
            >
              <option value="">Select location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={handleExport} disabled={filteredInventory.length === 0}>
              <FiDownload size={16} />
              Export CSV
            </button>
            {canAddInventory && (
              <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                <FiPlus size={16} />
                {showForm ? 'Cancel' : 'Add Item'}
              </button>
            )}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="text"
              placeholder="Search by description or unit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '40px' }}
            />
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Description *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit *</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g., kg, pcs, box"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Unit Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Suggested Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.suggested_selling_price}
                  onChange={(e) => setFormData({ ...formData, suggested_selling_price: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Batch Number</label>
                <input
                  type="text"
                  value={formData.batch_number}
                  onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                  placeholder="e.g., BATCH-2024-001"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Expiry Date</label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success" style={{ marginTop: '16px' }}>
              <FiPlus size={16} />
              Add to Inventory
            </button>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Unit</th>
              <th>Quantity</th>
              <th>Batch</th>
              <th>Expiry</th>
              {user.role === 'admin' && (
                <>
                  <th>Unit Cost</th>
                  <th>Suggested Price</th>
                  <th>Total Value</th>
                </>
              )}
              {user.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'admin' ? 9 : 5} style={{ textAlign: 'center', padding: '20px' }}>
                  {searchTerm ? 'No items match your search' : 'No inventory items found'}
                </td>
              </tr>
            ) : (
              filteredInventory.map((item) => {
                const expiryDate = item.expiry_date ? new Date(item.expiry_date) : null;
                const today = new Date();
                const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
                const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.description}</td>
                    <td>{item.unit}</td>
                    <td>
                      <span className={`badge ${parseFloat(item.quantity) < 10 ? 'badge-danger' : 'badge-success'}`}>
                        {formatQuantity(item.quantity)}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.batch_number || '-'}
                    </td>
                    <td>
                      {expiryDate ? (
                        <span style={{ 
                          fontSize: '12px',
                          color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'var(--text-secondary)',
                          fontWeight: (isExpired || isExpiringSoon) ? 600 : 400
                        }}>
                          {expiryDate.toLocaleDateString()}
                          {isExpired && ' (Expired)'}
                          {isExpiringSoon && ` (${daysUntilExpiry}d)`}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    {user.role === 'admin' && (
                      <>
                        <td>₱{formatPrice(item.unit_cost)}</td>
                        <td>₱{formatPrice(item.suggested_selling_price || 0)}</td>
                        <td style={{ fontWeight: 600 }}>₱{formatPrice(parseFloat(item.quantity) * parseFloat(item.unit_cost))}</td>
                      </>
                    )}
                    {user.role === 'admin' && (
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleDeleteInventory(item.id)}
                        >
                          <FiTrash2 size={12} />
                          Delete
                        </button>
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

export default Inventory;
