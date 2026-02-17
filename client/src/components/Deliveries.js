import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { formatQuantity, formatPrice } from '../utils/formatNumber';

function Deliveries() {
  const { user } = useContext(AuthContext);
  const [deliveries, setDeliveries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    status: 'pending',
    notes: '',
    items: [{ description: '', unit: '', quantity: '', unit_cost: '' }]
  });

  useEffect(() => {
    fetchDeliveries();
    fetchLocations();
  }, []);

  const fetchDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      setDeliveries(response.data);
    } catch (error) {
      console.error('Error fetching deliveries:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', unit: '', quantity: '', unit_cost: '' }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/deliveries', formData);
      setShowForm(false);
      setFormData({
        from_location_id: '',
        to_location_id: '',
        delivery_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        notes: '',
        items: [{ description: '', unit: '', quantity: '', unit_cost: '' }]
      });
      fetchDeliveries();
      alert('Delivery created successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error creating delivery');
    }
  };

  const updateDeliveryStatus = async (id, status) => {
    try {
      await api.put(`/deliveries/${id}`, { status });
      fetchDeliveries();
      alert('Delivery status updated!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error updating delivery');
    }
  };

  const deleteDelivery = async (id) => {
    if (!window.confirm('Are you sure you want to delete this delivery?')) {
      return;
    }
    try {
      await api.delete(`/deliveries/${id}`);
      fetchDeliveries();
      alert('Delivery deleted successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting delivery');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'in_transit': return '#3498db';
      case 'delivered': return '#27ae60';
      case 'cancelled': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  return (
    <div className="container">
      <h2>Delivery Management</h2>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>Deliveries</h3>
          {(user.role === 'admin' || user.role === 'warehouse') && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Create Delivery'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label>From Location</label>
                <select
                  value={formData.from_location_id}
                  onChange={(e) => setFormData({ ...formData, from_location_id: e.target.value })}
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To Location</label>
                <select
                  value={formData.to_location_id}
                  onChange={(e) => setFormData({ ...formData, to_location_id: e.target.value })}
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Delivery Date</label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="2"
              />
            </div>

            <h4 style={{ marginTop: '20px', marginBottom: '10px' }}>Items</h4>
            {formData.items.map((item, index) => (
              <div key={index} style={{ padding: '15px', backgroundColor: 'white', borderRadius: '4px', marginBottom: '10px', border: '1px solid #ddd' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Unit</label>
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(e) => updateItem(index, 'unit', e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Unit Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_cost}
                      onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
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
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            <button type="button" className="btn" onClick={addItem} style={{ marginRight: '10px' }}>
              Add Item
            </button>
            <button type="submit" className="btn btn-success">Create Delivery</button>
          </form>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Items</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{new Date(delivery.delivery_date).toLocaleDateString()}</td>
                  <td>{delivery.from_location_name}</td>
                  <td>{delivery.to_location_name}</td>
                  <td>
                    {delivery.items && delivery.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '12px', marginBottom: '5px' }}>
                        {item.description} - {formatQuantity(item.quantity)} {item.unit}
                      </div>
                    ))}
                  </td>
                  <td>₱{formatPrice(delivery.total_value)}</td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: getStatusColor(delivery.status),
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {delivery.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>{delivery.created_by_name}</td>
                  <td>
                    {delivery.status !== 'delivered' && delivery.status !== 'cancelled' && (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {delivery.status === 'pending' && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#3498db' }}
                            onClick={() => updateDeliveryStatus(delivery.id, 'in_transit')}
                          >
                            In Transit
                          </button>
                        )}
                        {delivery.status === 'in_transit' && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => updateDeliveryStatus(delivery.id, 'delivered')}
                          >
                            Delivered
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => updateDeliveryStatus(delivery.id, 'cancelled')}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {user.role === 'admin' && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '12px', marginTop: '5px' }}
                        onClick={() => deleteDelivery(delivery.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Deliveries;
