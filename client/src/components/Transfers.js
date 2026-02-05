import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

function Transfers() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    description: '',
    unit: '',
    quantity: '',
    unit_cost: '',
    notes: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const fetchTransfers = async () => {
    try {
      const response = await api.get('/transfers');
      setTransfers(response.data);
    } catch (error) {
      console.error('Error fetching transfers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transfers', formData);
      setShowForm(false);
      setFormData({
        from_location_id: user.location_id || '',
        to_location_id: '',
        description: '',
        unit: '',
        quantity: '',
        unit_cost: '',
        notes: ''
      });
      fetchTransfers();
      alert('Transfer completed successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error creating transfer');
    }
  };

  return (
    <div className="container">
      <h2>Inventory Transfers</h2>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>Transfer History</h3>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New Transfer'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <div className="form-group">
              <label>From Location</label>
              <select
                value={formData.from_location_id}
                onChange={(e) => setFormData({ ...formData, from_location_id: e.target.value })}
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
              <label>To Location</label>
              <select
                value={formData.to_location_id}
                onChange={(e) => setFormData({ ...formData, to_location_id: e.target.value })}
                required
              >
                <option value="">Select destination location</option>
                {locations.filter(loc => loc.id !== formData.from_location_id).map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            </div>
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
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="3"
              />
            </div>
            <button type="submit" className="btn btn-success">Complete Transfer</button>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Transferred By</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id}>
                <td>{new Date(transfer.transfer_date).toLocaleString()}</td>
                <td>{transfer.from_location_name}</td>
                <td>{transfer.to_location_name}</td>
                <td>{transfer.description}</td>
                <td>{parseFloat(transfer.quantity).toFixed(2)} {transfer.unit}</td>
                <td>₱{parseFloat(transfer.unit_cost).toFixed(2)}</td>
                <td>{transfer.transferred_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Transfers;
