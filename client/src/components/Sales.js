import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

function Sales() {
  const { user } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [sales, setSales] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    location_id: '',
    description: '',
    unit: '',
    quantity: '',
    selling_price: '',
    customer_name: '',
    notes: ''
  });

  useEffect(() => {
    fetchLocations();
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations');
      const branches = response.data.filter(loc => loc.type === 'branch');
      setLocations(branches);
      
      if (user.location_id) {
        setFormData(prev => ({ ...prev, location_id: user.location_id }));
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await api.get('/sales');
      setSales(response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sales', formData);
      setShowForm(false);
      setFormData({
        location_id: user.location_id || '',
        description: '',
        unit: '',
        quantity: '',
        selling_price: '',
        customer_name: '',
        notes: ''
      });
      fetchSales();
      alert('Sale recorded successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error recording sale');
    }
  };

  return (
    <div className="container">
      <h2>Sales Management</h2>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>Sales History</h3>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Record Sale'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <div className="form-group">
              <label>Branch</label>
              <select
                value={formData.location_id}
                onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
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
              <label>Selling Price (per unit)</label>
              <input
                type="number"
                step="0.01"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
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
            <button type="submit" className="btn btn-success">Record Sale</button>
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Branch</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
              <th>Customer</th>
              <th>Sold By</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{new Date(sale.sale_date).toLocaleString()}</td>
                <td>{sale.location_name}</td>
                <td>{sale.description}</td>
                <td>{parseFloat(sale.quantity).toFixed(2)} {sale.unit}</td>
                <td>₱{parseFloat(sale.selling_price).toFixed(2)}</td>
                <td>₱{parseFloat(sale.total_amount).toFixed(2)}</td>
                <td>{sale.customer_name || '-'}</td>
                <td>{sale.sold_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Sales;
