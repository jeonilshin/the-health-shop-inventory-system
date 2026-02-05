import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

function Inventory() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    suggested_selling_price: ''
  });

  useEffect(() => {
    fetchLocations();
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
      setLocations(response.data);
      
      if (user.role !== 'admin' && user.location_id) {
        setSelectedLocation(user.location_id);
      } else if (response.data.length > 0) {
        setSelectedLocation(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get(`/inventory/location/${selectedLocation}`);
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
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
        suggested_selling_price: ''
      });
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding inventory');
    }
  };

  const canEdit = user.role === 'admin' || user.role === 'warehouse' || user.role === 'branch_manager';

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
      <h2>Inventory Management</h2>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Add Item'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g., kg, pcs, box"
                required
              />
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Unit Cost</label>
              <input
                type="number"
                step="0.01"
                value={formData.unit_cost}
                onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Suggested Selling Price</label>
              <input
                type="number"
                step="0.01"
                value={formData.suggested_selling_price}
                onChange={(e) => setFormData({ ...formData, suggested_selling_price: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-success">Add to Inventory</button>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Unit</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Suggested Price</th>
              <th>Total Value</th>
              {user.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td>{parseFloat(item.quantity).toFixed(2)}</td>
                <td>₱{parseFloat(item.unit_cost).toFixed(2)}</td>
                <td>₱{parseFloat(item.suggested_selling_price || 0).toFixed(2)}</td>
                <td>₱{(parseFloat(item.quantity) * parseFloat(item.unit_cost)).toFixed(2)}</td>
                {user.role === 'admin' && (
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => handleDeleteInventory(item.id)}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Inventory;
